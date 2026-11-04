// Isometric projection + pixel-exact drawing primitives.
// Everything is drawn into a low-res buffer, so shapes must land on whole
// pixels: canvas paths antialias their edges, so we scanline-fill instead.

/**
 * Art pixels per design unit. Geometry and sprites are authored at 1x
 * (32x16 tiles, heights in "design pixels") and rendered RES times denser,
 * with 1px outlines and details, so the art reads as hi-res pixel art.
 */
export const RES = 2;
export const TILE_W = 32 * RES;
export const TILE_H = 16 * RES;
const HW = TILE_W / 2;
const HH = TILE_H / 2;

export type Vec = { x: number; y: number };
export type Ctx = CanvasRenderingContext2D;

/** Grid (tiles) + height (design pixels) -> buffer pixels, relative to the room origin. */
export function iso(gx: number, gy: number, z = 0): Vec {
  return { x: (gx - gy) * HW, y: (gx + gy) * HH - z * RES };
}

/** Scanline-fill a convex polygon using a top-left fill rule (no gaps, no overlap). */
export function fillPoly(ctx: Ctx, pts: Vec[], color: string) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  ctx.fillStyle = color;
  const y0 = Math.ceil(minY - 0.5);
  const y1 = Math.floor(maxY - 0.5);
  for (let y = y0; y <= y1; y++) {
    const sy = y + 0.5;
    let xMin = Infinity;
    let xMax = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a.y <= sy && b.y > sy) || (b.y <= sy && a.y > sy)) {
        const x = a.x + ((sy - a.y) / (b.y - a.y)) * (b.x - a.x);
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
      }
    }
    if (xMin > xMax) continue;
    const xa = Math.ceil(xMin - 0.5);
    const xb = Math.ceil(xMax - 0.5);
    if (xb > xa) ctx.fillRect(xa, y, xb - xa, 1);
  }
}

export function line(ctx: Ctx, a: Vec, b: Vec, color: string) {
  let x0 = Math.round(a.x);
  let y0 = Math.round(a.y);
  const x1 = Math.round(b.x);
  const y1 = Math.round(b.y);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  ctx.fillStyle = color;
  for (;;) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

export interface BoxColors {
  top: string;
  left: string;
  right: string;
  /** Optional 1px highlight along the top face's two front edges. */
  edge?: string;
}

/** Axis-aligned box: footprint (x, y, w, d) in tiles, base z and height h in pixels. */
export function box(
  ctx: Ctx,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  c: BoxColors,
) {
  const z1 = z + h;
  if (h > 0) {
    fillPoly(ctx, [iso(x, y + d, z), iso(x + w, y + d, z), iso(x + w, y + d, z1), iso(x, y + d, z1)], c.left);
    fillPoly(ctx, [iso(x + w, y, z), iso(x + w, y + d, z), iso(x + w, y + d, z1), iso(x + w, y, z1)], c.right);
  }
  fillPoly(ctx, [iso(x, y, z1), iso(x + w, y, z1), iso(x + w, y + d, z1), iso(x, y + d, z1)], c.top);
  if (c.edge) {
    line(ctx, iso(x, y + d, z1), iso(x + w, y + d, z1), c.edge);
    line(ctx, iso(x + w, y, z1), iso(x + w, y + d, z1), c.edge);
  }
}

/** Flat quad on the floor (or any constant z). */
export function floorRect(ctx: Ctx, x: number, y: number, w: number, d: number, color: string, z = 0) {
  fillPoly(ctx, [iso(x, y, z), iso(x + w, y, z), iso(x + w, y + d, z), iso(x, y + d, z)], color);
}

/** Rectangle on a plane of constant y (faces the viewer's lower-left). */
export function planeY(ctx: Ctx, y: number, x0: number, x1: number, z0: number, z1: number, color: string) {
  fillPoly(ctx, [iso(x0, y, z0), iso(x1, y, z0), iso(x1, y, z1), iso(x0, y, z1)], color);
}

/** Rectangle on a plane of constant x (faces the viewer's lower-right). */
export function planeX(ctx: Ctx, x: number, y0: number, y1: number, z0: number, z1: number, color: string) {
  fillPoly(ctx, [iso(x, y0, z0), iso(x, y1, z0), iso(x, y1, z1), iso(x, y0, z1)], color);
}

/** Mix a #rrggbb colour toward black (amt < 0) or white (amt > 0). */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const ch = (v: number) => Math.round(v + (t - v) * p);
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Deterministic pseudo-random in [0, 1) from integer seeds (for static textures). */
export function hash(a: number, b = 0, c = 0): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
