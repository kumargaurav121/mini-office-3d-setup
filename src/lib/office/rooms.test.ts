import { describe, expect, it } from "vitest";
import {
  bridges,
  canPlaceRoom,
  canRemoveRoom,
  MAIN_ROOM_ID,
  moveTargets,
  openSides,
  roomIdForPath,
  type RoomRecord,
} from "./rooms";

const room = (id: string, x: number, z: number): RoomRecord => ({
  id,
  name: id,
  path: `/repos/${id}`,
  cell: { x, z },
});

describe("room grid", () => {
  it("offers a new room on all four sides of a lone room", () => {
    expect(openSides([room("main", 0, 0)])).toEqual([
      { roomId: "main", side: "north", cell: { x: 0, z: -1 } },
      { roomId: "main", side: "east", cell: { x: 1, z: 0 } },
      { roomId: "main", side: "south", cell: { x: 0, z: 1 } },
      { roomId: "main", side: "west", cell: { x: -1, z: 0 } },
    ]);
  });

  it("does not offer a side that already faces another room", () => {
    const sides = openSides([room("main", 0, 0), room("api", 1, 0)]);
    expect(sides.map((s) => `${s.roomId}:${s.side}`)).toEqual([
      "main:north",
      "main:south",
      "main:west",
      "api:north",
      "api:east",
      "api:south",
    ]);
  });

  it("joins each pair of side-by-side rooms with exactly one bridge", () => {
    // api is east of main, web is south of main; api and web only touch diagonally.
    const rooms = [room("main", 0, 0), room("api", 1, 0), room("web", 0, 1)];
    expect(bridges(rooms)).toEqual([
      { from: "main", to: "api", side: "east" },
      { from: "main", to: "web", side: "south" },
    ]);
  });

  it("only lets a new room go in a free cell next to an existing room", () => {
    const rooms = [room("main", 0, 0)];
    expect(canPlaceRoom(rooms, { x: 1, z: 0 })).toBe(true);
    expect(canPlaceRoom(rooms, { x: 0, z: 0 })).toBe(false); // taken
    expect(canPlaceRoom(rooms, { x: 2, z: 0 })).toBe(false); // floating, no bridge possible
    expect(canPlaceRoom(rooms, { x: 1, z: 1 })).toBe(false); // diagonal only
  });

  it("derives a stable, url-safe room id from the repo path", () => {
    const id = roomIdForPath("/Users/me/Repo/My App");
    expect(id).toBe(roomIdForPath("/Users/me/Repo/My App"));
    expect(id).toMatch(/^my-app-[a-z0-9]+$/);
    // Same folder name in two places must not collide.
    expect(roomIdForPath("/Users/me/work/api")).not.toBe(roomIdForPath("/Users/me/personal/api"));
  });

  it("lets any room but the main one be removed", () => {
    const rooms = [room(MAIN_ROOM_ID, 0, 0), room("api", 1, 0)];
    expect(canRemoveRoom(rooms, "api")).toBe(true);
    expect(canRemoveRoom(rooms, MAIN_ROOM_ID)).toBe(false);
  });

  it("won't remove a room that is the only way back to the main room for others", () => {
    // main — api — web in a row: web hangs off api.
    const rooms = [room(MAIN_ROOM_ID, 0, 0), room("api", 1, 0), room("web", 2, 0)];
    expect(canRemoveRoom(rooms, "api")).toBe(false);
    expect(canRemoveRoom(rooms, "web")).toBe(true);
  });

  it("offers every free spot next to another room as a move target, but never moves the main room", () => {
    const rooms = [room(MAIN_ROOM_ID, 0, 0), room("api", 1, 0)];
    expect(moveTargets(rooms, "api")).toEqual([
      { x: 0, z: -1 },
      { x: 0, z: 1 },
      { x: -1, z: 0 },
    ]);
    expect(moveTargets(rooms, MAIN_ROOM_ID)).toEqual([]);
  });

  it("only offers moves that leave every room still connected to the main room", () => {
    // main — api — web in a row.
    const rooms = [room(MAIN_ROOM_ID, 0, 0), room("api", 1, 0), room("web", 2, 0)];
    expect(moveTargets(rooms, "api")).toEqual([]); // web would be stranded wherever api goes
    expect(moveTargets(rooms, "web")).toEqual([
      { x: 0, z: -1 },
      { x: 0, z: 1 },
      { x: -1, z: 0 },
      { x: 1, z: -1 },
      { x: 1, z: 1 },
    ]);
  });
});
