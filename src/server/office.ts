import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { RoomStore, type OfficeConfig } from "./office-store";

/** `~` and `~/…` -> the home folder; anything else resolved to an absolute path. */
export const expandHome = (p: string) => (p === "~" || p.startsWith("~/") ? join(homedir(), p.slice(1)) : resolve(p));

/** office.config.json at the project root; `~` expands to the home folder. */
export async function loadConfig(): Promise<OfficeConfig> {
  const raw = JSON.parse(await readFile(join(process.cwd(), "office.config.json"), "utf8")) as OfficeConfig;
  return { mainRoom: expandHome(raw.mainRoom), repoRoots: raw.repoRoots.map(expandHome) };
}

export async function getStore(): Promise<RoomStore> {
  return new RoomStore({ config: await loadConfig(), statePath: join(process.cwd(), ".office", "rooms.json") });
}
