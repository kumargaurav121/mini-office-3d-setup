import { RES, shade, type Ctx } from "./iso";
import type { Look } from "./employees";
import type { Dir } from "./layout";

export type Pose = "stand" | "walk" | "sit" | "type" | "drink" | "write";

export interface CharacterOpts {
  dir: Dir;
  pose: Pose;
  frame: number;
  blink?: boolean;
  /** Override the silhouette outline (used for hover / selection). */
  outline?: string;
  shadow?: boolean;
}

export const OUTLINE = "#1d1a2b";
const SHOE = "#2b2430";
const SHOE_HI = "#4a4152";
const EYE = "#241c2c";
const LENS = "#cfe7f5";
const FRAME = "#2a2633";
const CUP = "#f3efe6";
const BAND = "#2d2a3a";
const EARCUP = "#e84a5f";
const MARKER = "#d94a4a";
const BLUSH = "rgba(240, 110, 120, 0.45)";
const BUCKLE = "#d9c27a";

/** Top of the tallest hairstyle relative to the feet, in buffer pixels. */
export const HEAD_TOP = -24 * RES;

interface Part {
  x: number;
  y: number;
  w: number;
  h: number;
  c: string;
  outlined: boolean;
}

type Add = (x: number, y: number, w: number, h: number, c: string, outlined?: boolean) => void;

/**
 * Procedural chibi sprite anchored at the feet (ax, ay) in buffer pixels.
 * Parts are laid out in design units (multiples of 0.5 = one buffer pixel at
 * RES 2). The art is authored facing SE (front) / NE (back); SW and NW mirror.
 */
export function drawCharacter(ctx: Ctx, ax: number, ay: number, look: Look, o: CharacterOpts) {
  ax = Math.round(ax);
  ay = Math.round(ay);
  const front = o.dir === "SE" || o.dir === "SW";
  const flip = o.dir === "SW" || o.dir === "NW";
  const parts: Part[] = [];
  const add: Add = (x, y, w, h, c, outlined = true) => parts.push({ x, y, w, h, c, outlined });

  const skin = look.skin;
  const skinD = shade(skin, -0.2);
  const shirtD = shade(look.shirt, -0.22);
  const shirtL = shade(look.shirt, 0.18);
  const pantsD = shade(look.pants, -0.28);
  const hair = look.hair;
  const hairL = shade(hair, 0.3);

  const seated = o.pose === "sit" || o.pose === "type";
  const walking = o.pose === "walk";
  const f = o.frame;
  const u = walking && f % 2 === 1 ? -0.5 : 0;

  // Legs
  if (seated) {
    if (front) {
      add(-3, -5, 3, 2, pantsD);
      add(-1, -3, 2, 2, pantsD);
      add(-1, -5, 4, 2, look.pants);
      add(2, -4, 2, 3, look.pants);
      add(2, -1, 3, 1, SHOE);
      add(2, -1, 1, 0.5, SHOE_HI, false);
    }
  } else {
    const lUp = walking && f === 0 ? 1 : 0;
    const rUp = walking && f === 2 ? 1 : 0;
    const top = -5 + u;
    add(-3, top, 2, 4 - u - lUp, look.pants);
    add(-3, -1 - lUp, 2, 1, SHOE);
    add(-3, -1 - lUp, 1, 0.5, SHOE_HI, false);
    add(0, top, 2, 4 - u - rUp, pantsD);
    add(0, -1 - rUp, 2, 1, SHOE);
    add(0, -1 - rUp, 1, 0.5, SHOE_HI, false);
  }

  // Torso
  add(-3, -12 + u, 6, 7, look.shirt);
  add(2, -12 + u, 1, 6, shirtD, false);
  add(-3, -11.5 + u, 0.5, 4, shirtL, false);
  add(-3, -6 + u, 6, 1, pantsD, false);
  if (front) {
    add(-0.5, -6 + u, 1, 0.5, BUCKLE, false);
    add(-1, -12 + u, 2, 0.5, skinD, false);
    add(-0.5, -11.5 + u, 1, 0.5, skinD, false);
  } else {
    add(-2, -12 + u, 4, 0.5, shirtD, false);
  }

  // Arms: back arm on screen-left, front arm on screen-right
  const typeShift = o.pose === "type" ? (f % 2) * 0.5 : 0;
  const backSwing = walking && f === 0 ? 1 : 0;
  const frontSwing = walking && f === 2 ? 1 : 0;
  add(-4, -12 + u + typeShift, 1, 4 - backSwing, shirtD);
  add(-4, -8 + u - backSwing + typeShift, 1, 1, skin);
  if (o.pose === "drink") {
    add(3, -12 + u, 1, 2, shirtD);
    add(4, -13 + u, 1, 3, skin);
    add(4, -15 + u, 2, 2, CUP);
    add(4.5, -15 + u, 1, 0.5, "#7a4a2a", false);
  } else if (o.pose === "write") {
    const w = (f % 2) * 0.5;
    add(3, -12 + u, 1, 2, shirtD);
    add(4, -16 + u - w, 1, 5, skin);
    add(4, -17 + u - w, 1, 1, MARKER);
  } else if (o.pose === "type") {
    add(3, -12 + u + (0.5 - typeShift), 1, 3, shirtD);
    if (front) add(4, -10 + typeShift, 2, 1, skin);
  } else {
    add(3, -12 + u, 1, 4 - frontSwing, shirtD);
    add(3, -8 + u - frontSwing, 1, 1, skin);
  }

  // Head
  add(-5, -21 + u, 10, 9, skin);
  if (!front) {
    // Ears peek out from behind short hair
    if (look.hairStyle === "short" || look.hairStyle === "bun" || look.hairStyle === "curly") {
      add(4.5, -17.5 + u, 1, 2, skinD);
      add(-5.5, -17.5 + u, 1, 2, skinD);
    }
  }
  drawHair(add, look, front, u, hair, hairL, skinD);

  if (front) {
    const glasses = look.accessory === "glasses";
    if (glasses) {
      add(-1, -17.5 + u, 2.5, 2.5, LENS, false);
      add(2, -17.5 + u, 2.5, 2.5, LENS, false);
      add(-1, -18 + u, 5.5, 0.5, FRAME, false);
      add(1.5, -17 + u, 0.5, 0.5, FRAME, false);
    } else {
      add(0, -18 + u, 1, 0.5, shade(hair, 0.1), false);
      add(3, -18 + u, 1, 0.5, shade(hair, 0.1), false);
    }
    if (o.blink) {
      add(0, -16 + u, 1, 0.5, skinD, false);
      add(3, -16 + u, 1, 0.5, skinD, false);
    } else {
      add(0, -17 + u, 1, 2, EYE, false);
      add(3, -17 + u, 1, 2, EYE, false);
      add(0, -17 + u, 0.5, 0.5, "#ffffff", false);
      add(3, -17 + u, 0.5, 0.5, "#ffffff", false);
    }
    add(-1.5, -15 + u, 1, 0.5, BLUSH, false);
    add(4, -15 + u, 1, 0.5, BLUSH, false);
    add(1, -14 + u, 1.5, 0.5, shade(skin, -0.38), false);
  } else if (look.accessory === "glasses") {
    add(3.5, -18 + u, 1.5, 0.5, FRAME, false);
  }

  if (look.accessory === "headphones") {
    if (front) {
      add(-5, -23 + u, 9, 1, BAND);
      add(-6, -22 + u, 1, 3, BAND);
      add(-7, -19 + u, 2, 4, EARCUP);
      add(-7, -19 + u, 0.5, 4, shade(EARCUP, 0.25), false);
    } else {
      add(-5, -23 + u, 10, 1, BAND);
      add(-7, -19 + u, 2, 4, EARCUP);
      add(5, -19 + u, 2, 4, EARCUP);
    }
  }

  const S = RES;
  if (o.shadow) {
    ctx.fillStyle = "rgba(24, 16, 40, 0.28)";
    ctx.fillRect(ax - 4 * S, ay - S, 8 * S, S);
    ctx.fillRect(ax - 5 * S, ay, 10 * S, S);
    ctx.fillRect(ax - 3 * S, ay + S, 6 * S, S);
  }

  const px = (v: number) => Math.round(v * S);
  const X = (x: number, w: number) => ax + px(flip ? -x - w : x);
  ctx.fillStyle = o.outline ?? OUTLINE;
  for (const p of parts) {
    if (p.outlined) ctx.fillRect(X(p.x, p.w) - 1, ay + px(p.y) - 1, px(p.w) + 2, px(p.h) + 2);
  }
  for (const p of parts) {
    ctx.fillStyle = p.c;
    ctx.fillRect(X(p.x, p.w), ay + px(p.y), px(p.w), px(p.h));
  }
}

function drawHair(add: Add, look: Look, front: boolean, u: number, hair: string, hairL: string, skinD: string) {
  const s = look.hairStyle;
  if (front) {
    switch (s) {
      case "short":
        add(-5, -22 + u, 10, 4, hair);
        add(-5, -18 + u, 2, 3, hair);
        add(1, -18.5 + u, 3, 1, hair);
        break;
      case "bob":
        add(-5, -22 + u, 10, 4, hair);
        add(-6, -20 + u, 3, 7, hair);
        add(4, -20 + u, 2, 6, hair);
        add(0, -18.5 + u, 4, 1, hair);
        add(-5.5, -19 + u, 0.5, 5, hairL, false);
        break;
      case "long":
        add(-5, -22 + u, 10, 4, hair);
        add(-6, -20 + u, 3, 11, hair);
        add(4, -20 + u, 2, 9, hair);
        add(-1, -18.5 + u, 2, 1, hair);
        add(-5.5, -19 + u, 0.5, 8, hairL, false);
        add(4.5, -19 + u, 0.5, 6, hairL, false);
        break;
      case "bun":
        add(-2, -25 + u, 4, 3, hair);
        add(-5, -22 + u, 10, 4, hair);
        add(-5, -18 + u, 2, 2, hair);
        add(-1, -24.5 + u, 1.5, 0.5, hairL, false);
        break;
      case "curly":
        add(-6, -23 + u, 12, 5, hair);
        add(-6, -18 + u, 2, 4, hair);
        add(4, -18 + u, 2, 2, hair);
        for (const [hx, hy] of [
          [-4.5, -22.5],
          [-1, -22],
          [2.5, -22.5],
          [-3, -20],
          [1, -19.5],
          [4, -20.5],
        ]) {
          add(hx, hy + u, 1, 0.5, hairL, false);
        }
        break;
    }
    if (s !== "curly") {
      add(-3, -21.5 + u, 4, 0.5, hairL, false);
      add(-3.5, -21 + u, 1, 0.5, hairL, false);
    }
    if (s === "short" || s === "bun") add(-3, -17 + u, 1, 2, skinD, false);
  } else {
    switch (s) {
      case "short":
        add(-5, -22 + u, 10, 8.5, hair);
        break;
      case "bob":
        add(-6, -22 + u, 12, 9, hair);
        add(-4, -14 + u, 8, 1, hair);
        break;
      case "long":
        add(-6, -22 + u, 12, 8, hair);
        add(-4.5, -14 + u, 9, 4, hair);
        add(-2, -13.5 + u, 0.5, 3, hairL, false);
        add(1.5, -13.5 + u, 0.5, 3, hairL, false);
        break;
      case "bun":
        add(-2, -25 + u, 4, 3, hair);
        add(-5, -22 + u, 10, 8.5, hair);
        add(-1, -24.5 + u, 1.5, 0.5, hairL, false);
        break;
      case "curly":
        add(-6, -23 + u, 12, 9.5, hair);
        for (const [hx, hy] of [
          [-4.5, -22.5],
          [-1, -22],
          [2.5, -22.5],
          [-3.5, -19.5],
          [0.5, -19],
          [3.5, -19.5],
          [-2, -16.5],
          [2, -16],
        ]) {
          add(hx, hy + u, 1, 0.5, hairL, false);
        }
        break;
    }
    if (s !== "curly") {
      add(-3, -21.5 + u, 5, 0.5, hairL, false);
      add(-4, -20.5 + u, 1, 0.5, hairL, false);
      add(2, -20 + u, 1.5, 0.5, hairL, false);
      add(-1, -18 + u, 0.5, 2, hairL, false);
    }
  }
}
