import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAIN_ROOM_ID, roomIdForPath } from "@/lib/office/rooms";
import { findRepos, listFolders, RoomStore } from "./office-store";

let home: string;

/** Make a fake repo (a folder containing .git) and return its path. */
async function repo(...parts: string[]) {
  const dir = join(home, ...parts);
  await mkdir(join(dir, ".git"), { recursive: true });
  return dir;
}

beforeEach(async () => {
  home = await realpath(await mkdtemp(join(tmpdir(), "office-store-")));
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

const storeFor = (mainRoom: string) =>
  new RoomStore({ config: { mainRoom, repoRoots: [home] }, statePath: join(home, ".office", "rooms.json") });

describe("room store", () => {
  it("starts with just the main room from config, in the middle", async () => {
    const tempo = await repo("work", "tempo");
    expect(await storeFor(tempo).rooms()).toEqual([
      { id: MAIN_ROOM_ID, name: "tempo", path: tempo, cell: { x: 0, z: 0 } },
    ]);
  });

  it("adds a repo as a room next to an existing one and remembers it after a restart", async () => {
    const tempo = await repo("work", "tempo");
    const api = await repo("work", "api");
    const added = await storeFor(tempo).addRoom(api, { x: 1, z: 0 });
    const expected = { id: roomIdForPath(api), name: "api", path: api, cell: { x: 1, z: 0 } };
    expect(added.at(-1)).toEqual(expected);
    // A fresh store reading the same file sees it too.
    expect(await storeFor(tempo).rooms()).toEqual([
      { id: MAIN_ROOM_ID, name: "tempo", path: tempo, cell: { x: 0, z: 0 } },
      expected,
    ]);
  });

  it("refuses a spot that is taken or not next to any room", async () => {
    const tempo = await repo("work", "tempo");
    const api = await repo("work", "api");
    const store = storeFor(tempo);
    await expect(store.addRoom(api, { x: 0, z: 0 })).rejects.toThrow(/spot/i);
    await expect(store.addRoom(api, { x: 2, z: 0 })).rejects.toThrow(/spot/i);
    expect(await store.rooms()).toHaveLength(1);
  });

  it("refuses a repo that already has a room, however the path is written", async () => {
    const tempo = await repo("work", "tempo");
    const api = await repo("work", "api");
    const store = storeFor(tempo);
    await expect(store.addRoom(`${tempo}/`, { x: 1, z: 0 })).rejects.toThrow(/already/i);
    await store.addRoom(api, { x: 1, z: 0 });
    await expect(store.addRoom(join(home, "work", "x", "..", "api"), { x: -1, z: 0 })).rejects.toThrow(/already/i);
  });

  it("refuses a symlink to a folder that already has a room", async () => {
    const tempo = await repo("work", "tempo");
    await symlink(tempo, join(home, "tempo-link"));
    await expect(storeFor(tempo).addRoom(join(home, "tempo-link"), { x: 1, z: 0 })).rejects.toThrow(/already/i);
  });

  it("refuses a spot that isn't whole grid coordinates", async () => {
    const tempo = await repo("work", "tempo");
    const api = await repo("work", "api");
    await expect(storeFor(tempo).addRoom(api, { x: 0.5, z: 0 })).rejects.toThrow(/spot/i);
    await expect(storeFor(tempo).addRoom(api, { x: "1", z: 0 } as never)).rejects.toThrow(/spot/i);
  });

  it("keeps both rooms when two are added at the same time", async () => {
    const tempo = await repo("work", "tempo");
    const api = await repo("work", "api");
    const web = await repo("work", "web");
    // Two requests each get their own store, like two browser tabs.
    await Promise.all([storeFor(tempo).addRoom(api, { x: 1, z: 0 }), storeFor(tempo).addRoom(web, { x: -1, z: 0 })]);
    expect((await storeFor(tempo).rooms()).map((r) => r.name).sort()).toEqual(["api", "tempo", "web"]);
  });

  it("refuses paths that don't exist or aren't folders", async () => {
    const tempo = await repo("work", "tempo");
    await writeFile(join(home, "notes.txt"), "hi");
    const store = storeFor(tempo);
    await expect(store.addRoom(join(home, "nope"), { x: 1, z: 0 })).rejects.toThrow(/folder/i);
    await expect(store.addRoom(join(home, "notes.txt"), { x: 1, z: 0 })).rejects.toThrow(/folder/i);
  });

  it("only accepts folders inside the configured repo roots, even through symlinks", async () => {
    const tempo = await repo("work", "tempo");
    const elsewhere = await realpath(await mkdtemp(join(tmpdir(), "office-outside-")));
    try {
      await mkdir(join(elsewhere, ".git"));
      await symlink(elsewhere, join(home, "sneaky"));
      const store = storeFor(tempo);
      await expect(store.addRoom(elsewhere, { x: 1, z: 0 })).rejects.toThrow(/inside/i);
      await expect(store.addRoom(join(home, "sneaky"), { x: 1, z: 0 })).rejects.toThrow(/inside/i);
    } finally {
      await rm(elsewhere, { recursive: true, force: true });
    }
  });

  it("removes a room and forgets it after a restart", async () => {
    const tempo = await repo("work", "tempo");
    const api = await repo("work", "api");
    const [, added] = await storeFor(tempo).addRoom(api, { x: 1, z: 0 });
    expect((await storeFor(tempo).removeRoom(added.id)).map((r) => r.name)).toEqual(["tempo"]);
    expect((await storeFor(tempo).rooms()).map((r) => r.name)).toEqual(["tempo"]);
  });

  it("refuses to remove the main room, a room others depend on, or one that doesn't exist", async () => {
    const tempo = await repo("work", "tempo");
    const store = storeFor(tempo);
    const [, api] = await store.addRoom(await repo("work", "api"), { x: 1, z: 0 });
    await store.addRoom(await repo("work", "web"), { x: 2, z: 0 });
    await expect(store.removeRoom(MAIN_ROOM_ID)).rejects.toThrow(/can't remove/i);
    await expect(store.removeRoom(api.id)).rejects.toThrow(/can't remove/i);
    await expect(store.removeRoom("nope")).rejects.toThrow(/can't remove/i);
    expect(await store.rooms()).toHaveLength(3);
  });

  it("moves a room to another free spot and remembers it after a restart", async () => {
    const tempo = await repo("work", "tempo");
    const [, api] = await storeFor(tempo).addRoom(await repo("work", "api"), { x: 1, z: 0 });
    const moved = await storeFor(tempo).moveRoom(api.id, { x: 0, z: 1 });
    expect(moved.find((r) => r.id === api.id)?.cell).toEqual({ x: 0, z: 1 });
    expect((await storeFor(tempo).rooms()).find((r) => r.id === api.id)?.cell).toEqual({ x: 0, z: 1 });
  });

  it("refuses moves that strand a room, land on a taken spot, or move the main room", async () => {
    const tempo = await repo("work", "tempo");
    const store = storeFor(tempo);
    const [, api] = await store.addRoom(await repo("work", "api"), { x: 1, z: 0 });
    const [, , web] = await store.addRoom(await repo("work", "web"), { x: 2, z: 0 });
    await expect(store.moveRoom(api.id, { x: 0, z: 1 })).rejects.toThrow(/spot/i); // web would be stranded
    await expect(store.moveRoom(web.id, { x: 1, z: 0 })).rejects.toThrow(/spot/i); // taken
    await expect(store.moveRoom(MAIN_ROOM_ID, { x: 0, z: 1 })).rejects.toThrow(/spot/i);
    expect((await store.rooms()).map((r) => r.cell)).toEqual([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
    ]);
  });
});

describe("finding repos", () => {
  it("lists git repos under the roots by name, skipping plain folders", async () => {
    const zeta = await repo("zeta");
    const alpha = await repo("clients", "acme", "alpha");
    await mkdir(join(home, "photos", "2024"), { recursive: true });
    expect(await findRepos([home])).toEqual([
      { name: "alpha", path: alpha },
      { name: "zeta", path: zeta },
    ]);
  });

  it("skips dependency, hidden and Library folders, and repos nested inside repos", async () => {
    const app = await repo("app");
    await repo("app", "vendor", "lib");
    await repo("node_modules", "some-pkg");
    await repo(".cache", "thing");
    await repo("Library", "Caches", "tool");
    expect(await findRepos([home])).toEqual([{ name: "app", path: app }]);
  });

  it("stops at a depth limit that still reaches repos five folders down by default", async () => {
    const shallow = await repo("a", "b", "c");
    await repo("a", "b", "x", "deep");
    expect(await findRepos([home], { maxDepth: 3 })).toEqual([{ name: "c", path: shallow }]);
    // Like ~/Documents/Repo/personal/logiciel-self/tempo
    const tempo = await repo("Documents", "Repo", "personal", "logiciel-self", "tempo");
    expect((await findRepos([home])).map((r) => r.path)).toContain(tempo);
  });
});

describe("browsing folders", () => {
  it("lists a folder's subfolders by name, without hidden or dependency folders", async () => {
    const mono = await repo("mono");
    await mkdir(join(mono, "tempo"));
    await mkdir(join(mono, "apps"));
    await mkdir(join(mono, ".obsidian"));
    await mkdir(join(mono, "node_modules"));
    await writeFile(join(mono, "README.md"), "#");
    expect(await listFolders([home], mono)).toEqual([
      { name: "apps", path: join(mono, "apps") },
      { name: "tempo", path: join(mono, "tempo") },
    ]);
  });

  it("refuses to list folders outside the repo roots", async () => {
    await expect(listFolders([join(home, "work")], home)).rejects.toThrow(/inside/i);
  });
});
