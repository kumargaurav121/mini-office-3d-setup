import { describe, expect, it, vi } from "vitest";
import { MAIN_ROOM_ID, type RoomRecord } from "./rooms";
import { OfficeWorld } from "./world";

const main: RoomRecord = { id: MAIN_ROOM_ID, name: "tempo", path: "/Users/me/Repo/tempo", cell: { x: 0, z: 0 } };
const api: RoomRecord = { id: "api-1", name: "api", path: "/Users/me/Repo/api", cell: { x: 1, z: 0 } };

describe("office world", () => {
  it("reports every agent in every room in one status list", () => {
    const world = new OfficeWorld([main, api]);
    const ids = world.getSnapshot().statuses.map((s) => s.id);
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
    expect(ids.filter((id) => id.startsWith("main/"))).toHaveLength(4);
    expect(ids.filter((id) => id.startsWith("api-1/"))).toHaveLength(4);
  });

  it("passes status changes from any room on to subscribers", () => {
    const world = new OfficeWorld([main, api]);
    const before = world.getSnapshot();
    const listener = vi.fn();
    world.subscribe(listener);
    // A simulated minute is long enough for everyone to have left their desk at least once.
    for (let t = 0; t < 60; t += 0.1) world.update(0.1);
    expect(listener).toHaveBeenCalled();
    expect(world.getSnapshot()).not.toBe(before);
    expect(world.getSnapshot().statuses.some((s) => s.activity !== "working")).toBe(true);
  });

  it("seats a new room's crew on sync, keeps existing rooms running, and ignores no-op syncs", () => {
    const world = new OfficeWorld([main]);
    for (let t = 0; t < 30; t += 0.1) world.update(0.1);
    const mainSim = world.rooms[0].sim;
    const mainStatuses = world.getSnapshot().statuses;
    const listener = vi.fn();
    world.subscribe(listener);

    world.syncRooms([main, api]);
    const snap = world.getSnapshot();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(snap.rooms.map((r) => r.id)).toEqual([MAIN_ROOM_ID, "api-1"]);
    expect(world.rooms[0].sim).toBe(mainSim);
    expect(snap.statuses.filter((s) => s.id.startsWith("main/"))).toEqual(mainStatuses);
    expect(snap.statuses.filter((s) => s.id.startsWith("api-1/"))).toHaveLength(4);

    world.syncRooms([main, api]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps everyone at their desks in calm mode, including rooms added later", () => {
    const world = new OfficeWorld([main]);
    world.setCalm(true);
    world.syncRooms([main, api]);
    for (let t = 0; t < 60; t += 0.1) world.update(0.1);
    expect(world.getSnapshot().statuses.every((s) => s.activity === "working")).toBe(true);
  });
});
