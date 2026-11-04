import { agentCharacter } from "./crew";
import type { Employee } from "./employees";
import type { RoomRecord } from "./rooms";
import { OfficeSim, type AgentStatus, type Phase } from "./sim";

/** An agent as the server reports it (just what the world needs to animate it). */
export interface AgentSpec {
  id: string;
  roomId: string;
  name: string;
  model: string;
  task?: string;
  deskIndex: number;
  phase: Phase;
}

export interface WorldRoom {
  record: RoomRecord;
  sim: OfficeSim;
}

export interface WorldSnapshot {
  rooms: RoomRecord[];
  /** People in each room, keyed by room id. */
  crews: Record<string, Employee[]>;
  statuses: AgentStatus[];
}

/** All rooms in the office, each with its own simulation (starting empty), behind one store for React. */
export class OfficeWorld {
  private list: WorldRoom[] = [];
  private snapshot: WorldSnapshot;
  private listeners = new Set<() => void>();
  private dirty = false;
  private calm = false;

  constructor(records: RoomRecord[]) {
    for (const record of records) this.addRoom(record);
    this.snapshot = this.buildSnapshot();
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  getSnapshot = () => this.snapshot;

  /** Rooms with their simulations, for the renderer. */
  get rooms(): readonly WorldRoom[] {
    return this.list;
  }

  /** Nobody leaves their desk (prefers-reduced-motion). */
  setCalm(calm: boolean) {
    this.calm = calm;
    for (const room of this.list) room.sim.setCalm(calm);
  }

  /**
   * Match the server's room list: add new rooms, drop removed ones, and move
   * rooms whose cell changed. Rooms that stay keep their simulation running.
   */
  syncRooms(records: RoomRecord[]) {
    const wanted = new Map(records.map((r) => [r.id, r]));
    const kept = this.list.filter((room) => wanted.has(room.record.id));
    if (kept.length !== this.list.length) this.dirty = true;
    this.list = kept;
    for (const room of this.list) {
      const next = wanted.get(room.record.id)!;
      if (next.cell.x !== room.record.cell.x || next.cell.z !== room.record.cell.z) {
        room.record = next;
        this.dirty = true;
      }
    }
    const known = new Set(this.list.map((r) => r.record.id));
    for (const record of records) {
      if (known.has(record.id)) continue;
      this.addRoom(record);
      this.dirty = true;
    }
    this.flush();
  }

  /** Advance every room; subscribers hear about it once if anything changed. */
  update(dt: number) {
    for (const room of this.list) room.sim.update(dt);
    this.flush();
  }

  /** Hand each room its agents; rooms not listed are ignored. */
  syncAgents(specs: AgentSpec[]) {
    for (const room of this.list) {
      const mine = specs.filter((s) => s.roomId === room.record.id);
      room.sim.syncAgents(mine.map((s) => ({ emp: agentCharacter(s), deskIndex: s.deskIndex, phase: s.phase })));
    }
    this.flush();
  }

  private addRoom(record: RoomRecord) {
    const sim = new OfficeSim();
    sim.setCalm(this.calm);
    sim.subscribe(() => {
      this.dirty = true;
    });
    this.list.push({ record, sim });
  }

  private flush() {
    if (!this.dirty) return;
    this.dirty = false;
    this.snapshot = this.buildSnapshot();
    for (const l of this.listeners) l();
  }

  private buildSnapshot(): WorldSnapshot {
    return {
      rooms: this.list.map((r) => r.record),
      crews: Object.fromEntries(this.list.map((r) => [r.record.id, r.sim.agents.map((a) => a.emp)])),
      statuses: this.list.flatMap((r) => r.sim.getSnapshot()),
    };
  }
}
