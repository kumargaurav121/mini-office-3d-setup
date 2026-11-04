import { hashString } from "./util";

// The office is a grid of rooms, one per local folder, joined by bridges.
// Cells are grid coordinates: east is +x, south is +z.

export type Side = "north" | "east" | "south" | "west";

export interface Cell {
  x: number;
  z: number;
}

export interface RoomRecord {
  id: string;
  /** Display name (the folder name). */
  name: string;
  /** Absolute path of the repo on disk. */
  path: string;
  cell: Cell;
}

export interface OpenSide {
  roomId: string;
  side: Side;
  /** The empty cell a new room would occupy. */
  cell: Cell;
}

/** The room the office starts with (configured in office.config.json). */
export const MAIN_ROOM_ID = "main";

export const SIDES: Side[] = ["north", "east", "south", "west"];

const STEP: Record<Side, Cell> = {
  north: { x: 0, z: -1 },
  east: { x: 1, z: 0 },
  south: { x: 0, z: 1 },
  west: { x: -1, z: 0 },
};

export function neighborCell(cell: Cell, side: Side): Cell {
  return { x: cell.x + STEP[side].x, z: cell.z + STEP[side].z };
}

const key = (c: Cell) => `${c.x},${c.z}`;

/** Every side of every room that faces an empty cell, i.e. where a + bridge goes. */
export function openSides(rooms: RoomRecord[]): OpenSide[] {
  const taken = new Set(rooms.map((r) => key(r.cell)));
  const out: OpenSide[] = [];
  for (const room of rooms) {
    for (const side of SIDES) {
      const cell = neighborCell(room.cell, side);
      if (!taken.has(key(cell))) out.push({ roomId: room.id, side, cell });
    }
  }
  return out;
}

export interface Bridge {
  from: string;
  to: string;
  /** Side of `from` that the bridge leaves through (always east or south). */
  side: Side;
}

/** One bridge per pair of rooms that share an edge. */
export function bridges(rooms: RoomRecord[]): Bridge[] {
  const byCell = new Map(rooms.map((r) => [key(r.cell), r]));
  const out: Bridge[] = [];
  for (const room of rooms) {
    for (const side of ["east", "south"] as const) {
      const other = byCell.get(key(neighborCell(room.cell, side)));
      if (other) out.push({ from: room.id, to: other.id, side });
    }
  }
  return out;
}

/** A new room needs a free cell that shares an edge with an existing room. */
export function canPlaceRoom(rooms: RoomRecord[], cell: Cell): boolean {
  const taken = new Set(rooms.map((r) => key(r.cell)));
  if (taken.has(key(cell))) return false;
  return SIDES.some((side) => taken.has(key(neighborCell(cell, side))));
}

/** Stable id for a repo: slugged folder name plus a short hash of the full path. */
export function roomIdForPath(path: string): string {
  const name = path.split("/").filter(Boolean).pop() ?? "room";
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "room";
  return `${slug}-${hashString(path).toString(36)}`;
}

/** True if every room can reach the main room over bridges. */
function allConnected(rooms: RoomRecord[]): boolean {
  const byCell = new Map(rooms.map((r) => [key(r.cell), r]));
  const start = rooms.find((r) => r.id === MAIN_ROOM_ID);
  if (!start) return false;
  const seen = new Set([start.id]);
  const stack = [start];
  while (stack.length) {
    const room = stack.pop()!;
    for (const side of SIDES) {
      const next = byCell.get(key(neighborCell(room.cell, side)));
      if (next && !seen.has(next.id)) {
        seen.add(next.id);
        stack.push(next);
      }
    }
  }
  return seen.size === rooms.length;
}

/** Any room but the main one can go, as long as nobody is left without a way back to main. */
export function canRemoveRoom(rooms: RoomRecord[], id: string): boolean {
  if (id === MAIN_ROOM_ID || !rooms.some((r) => r.id === id)) return false;
  return allConnected(rooms.filter((r) => r.id !== id));
}

/**
 * Free cells room `id` could move to: next to another room (never its own
 * cell), keeping every room connected to main. The main room stays put.
 */
export function moveTargets(rooms: RoomRecord[], id: string): Cell[] {
  const moving = rooms.find((r) => r.id === id);
  if (!moving || id === MAIN_ROOM_ID) return [];
  const others = rooms.filter((r) => r.id !== id);
  const seen = new Set([key(moving.cell)]);
  const out: Cell[] = [];
  for (const { cell } of openSides(others)) {
    if (seen.has(key(cell))) continue;
    seen.add(key(cell));
    if (allConnected([...others, { ...moving, cell }])) out.push(cell);
  }
  return out;
}
