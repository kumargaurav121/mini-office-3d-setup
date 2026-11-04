import type { Vec } from "./util";
import type { Cell } from "./rooms";

// Room: gx runs along the right-hand wall, gy along the left-hand wall.
export const ROOM_W = 12;
export const ROOM_D = 10;
export const WALL_H = 56;
export const WALL_T = 0.25;
export const SLAB = 8;
/** Height of chair seats and couch cushions, in pixels. */
export const SEAT_Z = 7;

/** Tiles between neighbouring rooms, spanned by a bridge. */
export const ROOM_GAP = 4;

/**
 * Doorways in the two walled sides, where bridges to the north and west
 * attach. Bridges to the east/south line up with them on the open sides.
 */
export const DOOR_H = 32;
export const NORTH_DOOR = { from: 6.02, to: 6.78 }; // along x, in the wall at y = 0
export const WEST_DOOR = { from: 5.65, to: 6.55 }; // along y, in the wall at x = 0

/** Grid cell -> position of the room's (0, 0) corner, in tiles. */
export function roomOrigin(cell: Cell): Vec {
  return { x: cell.x * (ROOM_W + ROOM_GAP), y: cell.z * (ROOM_D + ROOM_GAP) };
}

/** Facing on screen: SE = +gx, SW = +gy, NE = -gy, NW = -gx. */
export type Dir = "SE" | "SW" | "NE" | "NW";

export type FurnitureKind =
  | "fridge"
  | "counter"
  | "bookshelf"
  | "cooler"
  | "couch"
  | "coffeeTable"
  | "plant"
  | "printer";

export interface Furniture {
  id: string;
  kind: FurnitureKind;
  x: number;
  y: number;
  w: number;
  d: number;
  /** Tallest point in pixels (used for depth sorting). */
  h: number;
}

export const FURNITURE: Furniture[] = [
  { id: "fridge", kind: "fridge", x: 0.1, y: 0.1, w: 0.85, d: 0.8, h: 34 },
  { id: "counter", kind: "counter", x: 1.0, y: 0.05, w: 2.2, d: 0.8, h: 24 },
  { id: "bookshelf", kind: "bookshelf", x: 9.6, y: 0.05, w: 2.0, d: 0.6, h: 50 },
  { id: "cooler", kind: "cooler", x: 0.15, y: 5.0, w: 0.6, d: 0.6, h: 28 },
  { id: "couch", kind: "couch", x: 0.1, y: 6.6, w: 1.15, d: 2.5, h: 30 },
  { id: "coffeeTable", kind: "coffeeTable", x: 1.9, y: 7.3, w: 0.7, d: 1.1, h: 10 },
  { id: "printer", kind: "printer", x: 10.6, y: 4.4, w: 1.0, d: 0.8, h: 20 },
  { id: "plantL", kind: "plant", x: 0.12, y: 9.22, w: 0.56, d: 0.56, h: 34 },
  { id: "plantR", kind: "plant", x: 11.22, y: 9.22, w: 0.56, d: 0.56, h: 34 },
];

export interface DeskSlot {
  index: number;
  x: number;
  y: number;
  w: number;
  d: number;
  seat: Vec;
  /** Walkable grid node just behind the chair. */
  approach: Vec;
  facing: Dir;
}

// A 2x2 pod. Row A sits behind the desks facing the viewer; row B faces
// away, so their screens are visible.
export const DESKS: DeskSlot[] = [
  { index: 0, x: 4, y: 4, w: 2, d: 1, seat: { x: 5, y: 3.7 }, approach: { x: 5, y: 3 }, facing: "SW" },
  { index: 1, x: 6, y: 4, w: 2, d: 1, seat: { x: 7, y: 3.7 }, approach: { x: 7, y: 3 }, facing: "SW" },
  { index: 2, x: 4, y: 5, w: 2, d: 1, seat: { x: 5, y: 6.3 }, approach: { x: 5, y: 7 }, facing: "NE" },
  { index: 3, x: 6, y: 5, w: 2, d: 1, seat: { x: 7, y: 6.3 }, approach: { x: 7, y: 7 }, facing: "NE" },
];

export const CHAIR_HALF = 0.27;

export type Activity =
  | "working"
  | "walking"
  | "coffee"
  | "water"
  | "window"
  | "books"
  | "whiteboard"
  | "couch";

export type IconName = "coffee" | "water" | "sun" | "book" | "pencil" | "zzz" | "idea" | "heart" | "music";

export interface Poi {
  id: string;
  activity: Activity;
  /** Status line while doing it. */
  label: string;
  /** Where to, for the "Heading to …" status. */
  place: string;
  /** Walkable grid node to path to. */
  stand: Vec;
  /** Extra off-grid steps after reaching `stand` (e.g. onto a couch cushion). */
  enter: Vec[];
  facing: Dir;
  duration: [number, number];
  weight: number;
  icon: IconName;
}

export const POIS: Poi[] = [
  {
    id: "coffee",
    activity: "coffee",
    label: "Grabbing a coffee",
    place: "the coffee machine",
    stand: { x: 2, y: 1.5 },
    enter: [],
    facing: "NE",
    duration: [7, 10],
    weight: 3,
    icon: "coffee",
  },
  {
    id: "cooler",
    activity: "water",
    label: "At the water cooler",
    place: "the water cooler",
    stand: { x: 1, y: 5.5 },
    enter: [],
    facing: "NW",
    duration: [5, 8],
    weight: 2,
    icon: "water",
  },
  {
    id: "window-1",
    activity: "window",
    label: "Gazing out the window",
    place: "the window",
    stand: { x: 5, y: 1 },
    enter: [],
    facing: "NE",
    duration: [5, 9],
    weight: 1.5,
    icon: "sun",
  },
  {
    id: "window-2",
    activity: "window",
    label: "Gazing out the window",
    place: "the window",
    stand: { x: 8, y: 1 },
    enter: [],
    facing: "NE",
    duration: [5, 9],
    weight: 1.5,
    icon: "sun",
  },
  {
    id: "books",
    activity: "books",
    label: "Browsing the bookshelf",
    place: "the bookshelf",
    stand: { x: 10.5, y: 1 },
    enter: [],
    facing: "NE",
    duration: [6, 9],
    weight: 1,
    icon: "book",
  },
  {
    id: "whiteboard",
    activity: "whiteboard",
    label: "Sketching on the whiteboard",
    place: "the whiteboard",
    stand: { x: 0.5, y: 3 },
    enter: [],
    facing: "NW",
    duration: [7, 11],
    weight: 1.5,
    icon: "pencil",
  },
  {
    id: "couch-a",
    activity: "couch",
    label: "Taking a break",
    place: "the couch",
    stand: { x: 1.5, y: 7 },
    enter: [
      { x: 1.5, y: 7.25 },
      { x: 0.68, y: 7.25 },
    ],
    facing: "SE",
    duration: [8, 13],
    weight: 1.2,
    icon: "zzz",
  },
  {
    id: "couch-b",
    activity: "couch",
    label: "Taking a break",
    place: "the couch",
    stand: { x: 1.5, y: 9 },
    enter: [
      { x: 1.5, y: 8.45 },
      { x: 0.68, y: 8.45 },
    ],
    facing: "SE",
    duration: [8, 13],
    weight: 1.2,
    icon: "zzz",
  },
];
