import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readSetup, saveMainRoom } from "./office-config";

/** A fresh clone of the project: just the example config. */
let project: string;
/** Where the user's repos live (the example's repo root in these tests). */
let code: string;

beforeEach(async () => {
  const base = await realpath(await mkdtemp(join(tmpdir(), "office-config-")));
  project = join(base, "mini-office");
  code = join(base, "code");
  await mkdir(project);
  await mkdir(code);
  await writeFile(join(project, "office.config.example.json"), JSON.stringify({ mainRoom: ".", repoRoots: [code] }));
});
afterEach(async () => {
  await rm(join(project, ".."), { recursive: true, force: true });
});

describe("office setup", () => {
  it("asks for a main room when the office has no config yet, offering the example's repo roots", async () => {
    expect(await readSetup(project)).toEqual({ status: "choose", config: { mainRoom: project, repoRoots: [code] } });
  });

  it("is set up once there's an office.config.json, even if its main room folder is gone", async () => {
    await writeFile(join(project, "office.config.json"), JSON.stringify({ mainRoom: join(code, "deleted"), repoRoots: [code] }));
    expect((await readSetup(project)).status).toBe("ready");
  });

  it("saves the folder you pick as the main room, with the example's repo roots", async () => {
    const shop = join(code, "shop");
    await mkdir(shop);
    await saveMainRoom(project, shop);
    expect(JSON.parse(await readFile(join(project, "office.config.json"), "utf8"))).toEqual({ mainRoom: shop, repoRoots: [code] });
    expect(await readSetup(project)).toEqual({ status: "ready", config: { mainRoom: shop, repoRoots: [code] } });
  });

  it("only accepts a real folder inside the repo roots that isn't already a room", async () => {
    const api = join(code, "api");
    await mkdir(api);
    await writeFile(join(code, "notes.txt"), "hi");
    // A room added under an earlier config is still in the office's saved rooms.
    await mkdir(join(project, ".office"));
    await writeFile(
      join(project, ".office", "rooms.json"),
      JSON.stringify({ rooms: [{ id: "api", name: "api", path: api, cell: { x: 1, z: 0 } }] }),
    );
    await expect(saveMainRoom(project, join(code, "missing"))).rejects.toThrow(/isn't a folder/);
    await expect(saveMainRoom(project, join(code, "notes.txt"))).rejects.toThrow(/isn't a folder/);
    await expect(saveMainRoom(project, tmpdir())).rejects.toThrow(/Only folders inside/);
    await expect(saveMainRoom(project, api)).rejects.toThrow(/already has a room/);
    expect((await readSetup(project)).status).toBe("choose");
  });

  it("never overwrites an office.config.json that's already there", async () => {
    const mine = JSON.stringify({ mainRoom: "~/mine", repoRoots: ["~"] });
    await writeFile(join(project, "office.config.json"), mine);
    const shop = join(code, "shop");
    await mkdir(shop);
    await expect(saveMainRoom(project, shop)).rejects.toThrow(/already has a main room/);
    expect(await readFile(join(project, "office.config.json"), "utf8")).toBe(mine);
  });
});
