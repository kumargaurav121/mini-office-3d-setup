import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { RoomError, RoomStore, type OfficeConfig } from "./office-store";

// The office's setup: your own office.config.json (not committed), or, on a
// fresh clone, the example's defaults until you pick a main room.

const CONFIG = "office.config.json";
const EXAMPLE = "office.config.example.json";

/** Where the office keeps the rooms you add. */
export const statePathFor = (projectDir: string) => join(projectDir, ".office", "rooms.json");

/** `~` and `~/…` -> the home folder; anything else resolved against `base`. */
export const expandHome = (p: string, base = process.cwd()) =>
  p === "~" || p.startsWith("~/") ? join(homedir(), p.slice(1)) : resolve(base, p);

/** The home folder written back as `~`, so the saved config reads like the example. */
function tildeFor(path: string): string {
  const home = homedir();
  if (path === home) return "~";
  return path.startsWith(home + sep) ? `~/${path.slice(home.length + 1)}` : path;
}

/** "choose": no office.config.json yet, so ask for a main room (the config holds the example's defaults). */
export interface OfficeSetup {
  status: "ready" | "choose";
  config: OfficeConfig;
}

async function readConfigFile(path: string): Promise<OfficeConfig | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as OfficeConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

const expandPaths = (raw: OfficeConfig, base: string): OfficeConfig => ({
  mainRoom: expandHome(raw.mainRoom, base),
  repoRoots: raw.repoRoots.map((r) => expandHome(r, base)),
});

/** The setup as written in the files, before `~` and relative paths are expanded. */
async function writtenSetup(projectDir: string): Promise<{ status: OfficeSetup["status"]; written: OfficeConfig }> {
  const own = await readConfigFile(join(projectDir, CONFIG));
  const written = own ?? (await readConfigFile(join(projectDir, EXAMPLE)));
  if (!written) throw new Error(`Neither ${CONFIG} nor ${EXAMPLE} found in ${projectDir}.`);
  return { status: own ? "ready" : "choose", written };
}

export async function readSetup(projectDir: string): Promise<OfficeSetup> {
  const { status, written } = await writtenSetup(projectDir);
  return { status, config: expandPaths(written, projectDir) };
}

const ALREADY_SET_UP = "This office already has a main room.";

/**
 * First run: create office.config.json with `path` as the main room and the
 * example's repo roots. Never replaces a config that's already there.
 */
export async function saveMainRoom(projectDir: string, path: string): Promise<void> {
  const { status, written } = await writtenSetup(projectDir);
  if (status === "ready") throw new RoomError(ALREADY_SET_UP);
  const store = new RoomStore({ config: expandPaths(written, projectDir), statePath: statePathFor(projectDir) });
  const folder = await store.mainRoomFolder(path);
  // Keep the example's repo roots as written ("~"), so the saved file reads like it.
  const config = { mainRoom: tildeFor(folder), repoRoots: written.repoRoots };
  try {
    // Exclusive create: a stale welcome page can't clobber a config written meanwhile.
    await writeFile(join(projectDir, CONFIG), `${JSON.stringify(config, null, 2)}\n`, { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") throw new RoomError(ALREADY_SET_UP);
    throw err;
  }
}
