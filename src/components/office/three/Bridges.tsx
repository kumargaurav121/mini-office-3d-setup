"use client";

import { EW_DOOR, NS_DOOR, ROOM_D, ROOM_GAP, ROOM_W, SLAB, WALL_T } from "@/lib/office/layout";
import type { Side } from "@/lib/office/rooms";
import { Block } from "./primitives";

const WIDTH = 1.1;
/** Length of the stub on an open side, where the + button sits. */
export const STUB = 1.6;
/** A full bridge spans the gap between the two rooms' outer walls. */
export const BRIDGE = ROOM_GAP - 2 * WALL_T;
const DECK = "#b98250";
const SEAM = "#8a5a36";
const RAIL = "#5c5f73";
const POST = "#4a4d5e";
// Bridges line up with the doorways, so neighbours' bridges meet head-on.
const NS_AXIS = (NS_DOOR.from + NS_DOOR.to) / 2;
const EW_AXIS = (EW_DOOR.from + EW_DOOR.to) / 2;

interface Span {
  /** Which floor axis the walkway runs along. */
  along: "x" | "y";
  from: number;
  to: number;
  /** Position of the centre line on the other axis. */
  center: number;
}

/** Where a walkway of `length` leaving through `side` lies (from the wall outward), in room-local tiles. */
function span(side: Side, length: number): Span & { end: number } {
  switch (side) {
    case "east":
      return { along: "x", from: ROOM_W + WALL_T, to: ROOM_W + WALL_T + length, center: EW_AXIS, end: ROOM_W + WALL_T + length };
    case "west":
      return { along: "x", from: -WALL_T - length, to: -WALL_T, center: EW_AXIS, end: -WALL_T - length };
    case "south":
      return { along: "y", from: ROOM_D + WALL_T, to: ROOM_D + WALL_T + length, center: NS_AXIS, end: ROOM_D + WALL_T + length };
    case "north":
      return { along: "y", from: -WALL_T - length, to: -WALL_T, center: NS_AXIS, end: -WALL_T - length };
  }
}

/** Point above the far end of a stub, for its + button: [x, height, z] in room-local world units. */
export function stubAnchor(side: Side): [number, number, number] {
  const s = span(side, STUB);
  return s.along === "x" ? [s.end, 0.8, s.center] : [s.center, 0.8, s.end];
}

/** A wooden walkway with railings leaving the room through `side`. */
export function Walkway({ side, length }: { side: Side; length: number }) {
  const s = span(side, length);
  // Lay everything out along a generic axis, then map to x/y.
  const box = (a: number, b: number, c0: number, c1: number, z: number, h: number, color: string, cast = true) =>
    s.along === "x" ? (
      <Block key={`${a}-${c0}-${z}`} x={a} y={c0} z={z} w={b - a} d={c1 - c0} h={h} color={color} cast={cast} />
    ) : (
      <Block key={`${a}-${c0}-${z}`} x={c0} y={a} z={z} w={c1 - c0} d={b - a} h={h} color={color} cast={cast} />
    );
  const c0 = s.center - WIDTH / 2;
  const c1 = s.center + WIDTH / 2;
  const posts = Math.max(2, Math.round(length / 0.9) + 1);
  const seams = Math.floor(length / 0.45);
  return (
    <>
      {box(s.from, s.to, c0, c1, -SLAB, SLAB, DECK)}
      {Array.from({ length: seams }, (_, i) => {
        const at = s.from + (i + 1) * 0.45;
        return box(at - 0.015, at + 0.015, c0, c1, 0, 0.2, SEAM, false);
      })}
      {[c0, c1 - 0.06].map((edge) => (
        <group key={edge}>
          {Array.from({ length: posts }, (_, i) => {
            const at = s.from + ((length - 0.06) * i) / (posts - 1);
            return box(at, at + 0.06, edge, edge + 0.06, 0, 13, POST);
          })}
          {box(s.from, s.to, edge - 0.005, edge + 0.065, 12, 1.5, RAIL)}
        </group>
      ))}
    </>
  );
}
