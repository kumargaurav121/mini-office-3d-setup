import { describe, expect, it, vi } from "vitest";
import { DESKS, PORTAL } from "./layout";
import { MAIN_ROOM_ID, type RoomRecord } from "./rooms";
import { OfficeWorld, type AgentSpec } from "./world";

const main: RoomRecord = { id: MAIN_ROOM_ID, name: "tempo", path: "/Users/me/Repo/tempo", cell: { x: 0, z: 0 } };
const api: RoomRecord = { id: "api-1", name: "api", path: "/Users/me/Repo/api", cell: { x: 1, z: 0 } };
const spec = (id: string, deskIndex: number, phase: AgentSpec["phase"], roomId = MAIN_ROOM_ID): AgentSpec => ({
  id,
  roomId,
  name: `Agent ${id}`,
  model: "sonnet",
  deskIndex,
  phase,
});
const run = (world: OfficeWorld, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.05) world.update(0.05);
};
const agentIn = (world: OfficeWorld, roomIndex: number, id: string) => world.rooms[roomIndex].sim.agents.find((a) => a.emp.id === id);

describe("office world", () => {
  it("starts with empty rooms", () => {
    const world = new OfficeWorld([main, api]);
    expect(world.getSnapshot().statuses).toEqual([]);
    expect(world.getSnapshot().crews).toEqual({ [MAIN_ROOM_ID]: [], "api-1": [] });
  });

  it("brings a new agent in through the portal and walks it to its desk", () => {
    const world = new OfficeWorld([main, api]);
    world.syncAgents([spec("a1", 2, "working", "api-1")]);
    const agent = agentIn(world, 1, "a1")!;
    expect(agent.pos).toEqual(PORTAL);
    expect(world.getSnapshot().crews["api-1"].map((e) => e.name)).toEqual(["Agent a1"]);
    run(world, 30);
    expect(agent.mode).toBe("desk");
    expect(agent.pos).toEqual(DESKS[2].seat);
  });

  it("sends an idle agent on a break and calls it back when its session gets busy", () => {
    const world = new OfficeWorld([main]);
    world.syncAgents([spec("a1", 0, "idle")]);
    let tookBreak = false;
    for (let t = 0; t < 60; t += 0.05) {
      world.update(0.05);
      if (agentIn(world, 0, "a1")!.mode === "poi") tookBreak = true;
    }
    expect(tookBreak).toBe(true);
    world.syncAgents([spec("a1", 0, "working")]);
    run(world, 40);
    const agent = agentIn(world, 0, "a1")!;
    expect(agent.mode).toBe("desk");
    expect(agent.pos).toEqual(DESKS[0].seat);
  });

  it("walks an agent whose session ended back into the portal, then removes it", () => {
    const world = new OfficeWorld([main]);
    world.syncAgents([spec("a1", 0, "working")]);
    run(world, 30);
    const listener = vi.fn();
    world.subscribe(listener);
    world.syncAgents([spec("a1", 0, "ended")]);
    run(world, 40);
    expect(world.rooms[0].sim.agents).toHaveLength(0);
    expect(world.getSnapshot().crews[MAIN_ROOM_ID]).toEqual([]);
    expect(listener).toHaveBeenCalled();
  });

  it("keeps idle agents at their desks in calm mode", () => {
    const world = new OfficeWorld([main]);
    world.setCalm(true);
    world.syncAgents([spec("a1", 0, "idle")]);
    run(world, 60);
    expect(agentIn(world, 0, "a1")!.mode).toBe("desk");
  });

  it("drops removed rooms and moves rooms on sync, keeping the agents in them", () => {
    const web: RoomRecord = { id: "web-1", name: "web", path: "/Users/me/Repo/web", cell: { x: 0, z: 1 } };
    const world = new OfficeWorld([main, api, web]);
    world.syncAgents([spec("a1", 0, "working", "api-1")]);
    const apiSim = world.rooms[1].sim;
    world.syncRooms([main, { ...api, cell: { x: -1, z: 0 } }]);
    const snap = world.getSnapshot();
    expect(snap.rooms.map((r) => [r.id, r.cell])).toEqual([
      [MAIN_ROOM_ID, { x: 0, z: 0 }],
      ["api-1", { x: -1, z: 0 }],
    ]);
    expect(world.rooms[1].sim).toBe(apiSim);
    expect(snap.crews["web-1"]).toBeUndefined();
    expect(apiSim.agents).toHaveLength(1);
  });
});
