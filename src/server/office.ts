import { readSetup, saveMainRoom, statePathFor, type OfficeSetup } from "./office-config";
import { RoomStore, type OfficeConfig } from "./office-store";

export { expandHome } from "./office-config";

/** This office's setup: "choose" until a main room has been picked (a fresh clone). */
export function officeSetup(): Promise<OfficeSetup> {
  return readSetup(process.cwd());
}

/** First run: make `path` this office's main room (creates office.config.json). */
export function setMainRoom(path: string): Promise<void> {
  return saveMainRoom(process.cwd(), path);
}

/** The office's config: yours, or the example's defaults before you've picked a main room. */
export async function loadConfig(): Promise<OfficeConfig> {
  return (await officeSetup()).config;
}

export async function getStore(): Promise<RoomStore> {
  return new RoomStore({ config: await loadConfig(), statePath: statePathFor(process.cwd()) });
}
