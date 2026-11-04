import { describe, expect, it } from "vitest";
import { crewForRoom } from "./crew";
import { DESKS } from "./layout";
import type { RoomRecord } from "./rooms";

const main: RoomRecord = { id: "main", name: "tempo", path: "/Users/me/Repo/tempo", cell: { x: 0, z: 0 } };
const repo = (path: string): RoomRecord => ({ id: `r-${path}`, name: path, path, cell: { x: 1, z: 0 } });

describe("crew for a room", () => {
  it("keeps the original team in the main room, with room-scoped ids", () => {
    const crew = crewForRoom(main, { main: true });
    expect(crew.map((e) => e.name)).toEqual(["Ava Moreno", "Kenji Watanabe", "Priya Nair", "Marcus Bell"]);
    expect(crew.map((e) => e.id)).toEqual(["main/ava", "main/kenji", "main/priya", "main/marcus"]);
  });

  it("gives a repo room its own agent for every desk, with unique room-scoped ids", () => {
    const room = repo("/Users/me/Repo/api");
    const crew = crewForRoom(room);
    expect(crew).toHaveLength(DESKS.length);
    expect(new Set(crew.map((e) => e.id)).size).toBe(DESKS.length);
    for (const e of crew) expect(e.id.startsWith(`${room.id}/`)).toBe(true);
    const mainNames = crewForRoom(main, { main: true }).map((e) => e.name);
    expect(crew.some((e) => mainNames.includes(e.name))).toBe(false);
  });

  it("gives the same repo the same crew every time (so reloads don't reshuffle people)", () => {
    const room = repo("/Users/me/Repo/api");
    expect(crewForRoom(room)).toEqual(crewForRoom(room));
  });

  it("never seats two people with the same first name in one room", () => {
    for (let i = 0; i < 200; i++) {
      const firstNames = crewForRoom(repo(`/Users/me/Repo/project-${i}`)).map((e) => e.name.split(" ")[0]);
      expect(new Set(firstNames).size).toBe(firstNames.length);
    }
  });
});
