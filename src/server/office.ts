import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { RoomStore, type OfficeConfig } from "./office-store";

/** `~` and `~/…` -> the home folder; anything else resolved to an absolute path. */
export const expandHome = (p: string) => (p === "~" || p.startsWith("~/") ? join(homedir(), p.slice(1)) : resolve(p));

/** Your office.config.json at the project root (not committed), else the example; `~` expands to the home folder. */
export async function loadConfig(): Promise<OfficeConfig> {
  const read = (name: string) => readFile(join(process.cwd(), name), "utf8");
  const text = await read("office.config.json").catch((err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") return read("office.config.example.json");
    throw err;
  });
  const raw = JSON.parse(text) as OfficeConfig;
  return { mainRoom: expandHome(raw.mainRoom), repoRoots: raw.repoRoots.map(expandHome) };
}

export async function getStore(): Promise<RoomStore> {
  return new RoomStore({ config: await loadConfig(), statePath: join(process.cwd(), ".office", "rooms.json") });
}
