import { mkdir, readdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import {
  canPlaceRoom,
  canRemoveRoom,
  MAIN_ROOM_ID,
  moveTargets,
  roomIdForPath,
  type Cell,
  type RoomRecord,
} from "@/lib/office/rooms";

export interface OfficeConfig {
  /** Absolute path of the repo shown in the middle room. */
  mainRoom: string;
  /** Folders searched for repos; new rooms must live inside one of them. */
  repoRoots: string[];
}

/** A request the user can fix (bad path, taken spot…); the message is shown in the UI. */
export class RoomError extends Error {}

interface SavedState {
  rooms: RoomRecord[];
}

/** Serialises read-modify-write cycles per state file (each request builds its own store). */
const locks = new Map<string, Promise<unknown>>();

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (locks.get(key) ?? Promise.resolve()).then(fn, fn);
  locks.set(key, run.catch(() => undefined));
  return run;
}

/** Rooms of the office: the main room from config plus rooms added since, saved to a JSON file. */
export class RoomStore {
  private config: OfficeConfig;
  private statePath: string;

  constructor(opts: { config: OfficeConfig; statePath: string }) {
    this.config = opts.config;
    this.statePath = opts.statePath;
  }

  async rooms(): Promise<RoomRecord[]> {
    const main = this.config.mainRoom;
    const saved = await this.load();
    return [{ id: MAIN_ROOM_ID, name: basename(main), path: main, cell: { x: 0, z: 0 } }, ...saved.rooms];
  }

  /** Add the repo at `path` as a room in `cell`; returns the updated room list. */
  async addRoom(rawPath: string, cell: Cell): Promise<RoomRecord[]> {
    return withLock(this.statePath, () => this.addRoomUnlocked(rawPath, cell));
  }

  private async addRoomUnlocked(rawPath: string, cell: Cell): Promise<RoomRecord[]> {
    if (!Number.isInteger(cell?.x) || !Number.isInteger(cell?.z)) throw new RoomError("That isn't a spot on the grid.");
    const path = resolve(rawPath);
    const isFolder = await stat(path).then((s) => s.isDirectory(), () => false);
    if (!isFolder) throw new RoomError(`${path} isn't a folder.`);
    await assertInsideRoots(this.config.repoRoots, path);
    const rooms = await this.rooms();
    // Compare real paths so a symlink can't sneak in a second room for the same folder.
    const real = await realpath(path);
    const taken = await Promise.all(rooms.map((r) => realpath(r.path).catch(() => resolve(r.path))));
    if (taken.includes(real)) throw new RoomError(`${basename(path)} already has a room.`);
    if (!canPlaceRoom(rooms, cell)) throw new RoomError("That spot is taken or isn't next to a room.");
    const saved = await this.load();
    saved.rooms.push({ id: roomIdForPath(path), name: basename(path), path, cell });
    await this.save(saved);
    return this.rooms();
  }

  /** Remove a room from the office (the folder on disk is untouched). */
  async removeRoom(id: string): Promise<RoomRecord[]> {
    return withLock(this.statePath, async () => {
      if (!canRemoveRoom(await this.rooms(), id)) {
        throw new RoomError("Can't remove that room: it's the main room, or other rooms connect through it.");
      }
      const saved = await this.load();
      saved.rooms = saved.rooms.filter((r) => r.id !== id);
      await this.save(saved);
      return this.rooms();
    });
  }

  /** Move a room to another cell. */
  async moveRoom(id: string, cell: Cell): Promise<RoomRecord[]> {
    return withLock(this.statePath, async () => {
      const target = moveTargets(await this.rooms(), id).find((c) => c.x === cell?.x && c.z === cell?.z);
      if (!target) throw new RoomError("That room can't move to that spot.");
      const saved = await this.load();
      saved.rooms = saved.rooms.map((r) => (r.id === id ? { ...r, cell: target } : r));
      await this.save(saved);
      return this.rooms();
    });
  }

  private async load(): Promise<SavedState> {
    try {
      return JSON.parse(await readFile(this.statePath, "utf8")) as SavedState;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return { rooms: [] };
      throw err;
    }
  }

  private async save(state: SavedState) {
    await mkdir(dirname(this.statePath), { recursive: true });
    const tmp = `${this.statePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`);
    await rename(tmp, this.statePath);
  }
}

/** Throws unless `path` is inside one of `roots`. Symlinks are resolved on both sides. */
async function assertInsideRoots(roots: string[], path: string) {
  const real = await realpath(path);
  for (const root of roots) {
    const realRoot = await realpath(root).catch(() => null);
    if (realRoot && (real === realRoot || real.startsWith(realRoot + sep))) return;
  }
  throw new RoomError(`Only folders inside ${roots.join(", ")} can be used.`);
}

/** Folders never worth descending into when scanning a home directory. */
const SKIP = new Set(["node_modules", "Library", "Applications", "vendor", "target", "dist", "build"]);

export interface RepoEntry {
  name: string;
  path: string;
}

/** Git repos (folders containing .git) under the given roots, sorted by name. */
export async function findRepos(roots: string[], { maxDepth = 6 } = {}): Promise<RepoEntry[]> {
  const found: RepoEntry[] = [];
  const walk = async (dir: string, depth: number) => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    if (entries.some((e) => e.name === ".git")) {
      found.push({ name: basename(dir), path: dir });
      return;
    }
    for (const e of entries) {
      const wanted = e.isDirectory() && !e.name.startsWith(".") && !SKIP.has(e.name);
      if (wanted && depth < maxDepth) await walk(join(dir, e.name), depth + 1);
    }
  };
  for (const root of roots) await walk(resolve(root), 0);
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/** Visible subfolders of `path` (which must be inside the roots), sorted by name. */
export async function listFolders(roots: string[], path: string): Promise<RepoEntry[]> {
  const dir = resolve(path);
  await assertInsideRoots(roots, dir);
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !SKIP.has(e.name))
    .map((e) => ({ name: e.name, path: join(dir, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
