import { box, fillPoly, floorRect, hash, iso, line, planeX, planeY, type Ctx } from "./iso";
import { BUFFER_H, BUFFER_W, ORIGIN, ROOM_D, ROOM_W, SLAB, WALL_H, WALL_T } from "./layout";

const W = ROOM_W;
const D = ROOM_D;
const H = WALL_H;
const T = WALL_T;

const PLANKS = ["#c99560", "#c08b57", "#d19d68", "#c4905b"];
const PLANK_SEAM = "#ad7845";
const WINDOWS: [number, number][] = [
  [3.9, 5.9],
  [6.9, 8.9],
];
const WINDOW_Z: [number, number] = [17, 45];

/** Everything that never moves: floor, rugs, walls and wall decorations. */
export function renderBackground(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = BUFFER_W;
  canvas.height = BUFFER_H;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(ORIGIN.x, ORIGIN.y);

  drawSlab(ctx);
  drawFloor(ctx);
  drawRugs(ctx);
  drawWalls(ctx);
  for (const [x0, x1] of WINDOWS) drawWindow(ctx, x0, x1);
  drawSunlight(ctx);
  drawWhiteboard(ctx);
  drawPoster(ctx);
  drawPicture(ctx);
  drawUpperCabinet(ctx);
  return canvas;
}

function drawSlab(ctx: Ctx) {
  // Floating diorama: the floor's thickness shows along the two front edges.
  fillPoly(ctx, [iso(-T, D, -SLAB), iso(W, D, -SLAB), iso(W, D, 0), iso(-T, D, 0)], "#8a5d3b");
  fillPoly(ctx, [iso(W, -T, -SLAB), iso(W, D, -SLAB), iso(W, D, 0), iso(W, -T, 0)], "#6b4630");
  line(ctx, iso(-T, D, 0), iso(W, D, 0), "#a4744b");
  line(ctx, iso(W, -T, 0), iso(W, D, 0), "#7f553a");
}

function drawFloor(ctx: Ctx) {
  const plankLen = 1.5;
  for (let r = 0; r < D * 2; r++) {
    const y0 = r * 0.5;
    const offset = ((r * 7) % 3) * 0.5;
    let k = 0;
    for (let x = -offset; x < W; x += plankLen, k++) {
      const x0 = Math.max(0, x);
      const x1 = Math.min(W, x + plankLen);
      floorRect(ctx, x0, y0, x1 - x0, 0.5, PLANKS[Math.floor(hash(r, k) * PLANKS.length)]);
      if (x0 > 0) line(ctx, iso(x0, y0), iso(x0, y0 + 0.5), PLANK_SEAM);
    }
    if (r > 0) line(ctx, iso(0, y0), iso(W, y0), PLANK_SEAM);
  }
}

function drawRugs(ctx: Ctx) {
  // Carpet under the desk pod
  floorRect(ctx, 3.1, 2.3, 5.8, 5.4, "#34406a");
  floorRect(ctx, 3.25, 2.45, 5.5, 5.1, "#465789");
  floorRect(ctx, 3.45, 2.65, 5.1, 4.7, "#34406a");
  floorRect(ctx, 3.55, 2.75, 4.9, 4.5, "#465789");
  // Lounge rug
  floorRect(ctx, 0.3, 6.3, 2.7, 3.1, "#b9524a");
  floorRect(ctx, 0.45, 6.45, 2.4, 2.8, "#d36c56");
  for (const y of [6.9, 7.8, 8.7]) floorRect(ctx, 0.45, y, 2.4, 0.12, "#f0c27a");
}

function drawWalls(ctx: Ctx) {
  // Right-hand wall (plane y = 0)
  planeY(ctx, 0, 0, W, 0, H, "#f1e7d6");
  planeY(ctx, 0, 0, W, 0, 20, "#9bb59e");
  for (let x = 0.5; x < W; x += 0.5) line(ctx, iso(x, 0, 4), iso(x, 0, 19), "#8ca890");
  planeY(ctx, 0, 0, W, 20, 22, "#6e8c74");
  planeY(ctx, 0, 0, W, 0, 3, "#5c7562");
  // Left-hand wall (plane x = 0), a touch darker
  planeX(ctx, 0, 0, D, 0, H, "#e3d6c0");
  planeX(ctx, 0, 0, D, 0, 20, "#88a38c");
  for (let y = 0.5; y < D; y += 0.5) line(ctx, iso(0, y, 4), iso(0, y, 19), "#7a957e");
  planeX(ctx, 0, 0, D, 20, 22, "#5f7d66");
  planeX(ctx, 0, 0, D, 0, 3, "#4f6855");
  // Wall caps and cut ends
  fillPoly(ctx, [iso(-T, -T, H), iso(W, -T, H), iso(W, 0, H), iso(0, 0, H)], "#6d5a4c");
  fillPoly(ctx, [iso(-T, -T, H), iso(0, 0, H), iso(0, D, H), iso(-T, D, H)], "#7a6656");
  fillPoly(ctx, [iso(W, -T, -SLAB), iso(W, 0, -SLAB), iso(W, 0, H), iso(W, -T, H)], "#8c7564");
  fillPoly(ctx, [iso(-T, D, -SLAB), iso(0, D, -SLAB), iso(0, D, H), iso(-T, D, H)], "#a08a78");
}

function drawWindow(ctx: Ctx, x0: number, x1: number) {
  const [z0, z1] = WINDOW_Z;
  planeY(ctx, 0, x0, x1, z0, z1, "#f7f5ef");
  planeY(ctx, 0, x0 + 0.08, x1 - 0.08, z0 + 2, z1 - 2, "#8fd0f2");
  planeY(ctx, 0, x0 + 0.08, x1 - 0.08, z0 + 2, z0 + 14, "#b5e2f6");
  // Distant skyline
  let bx = x0 + 0.08;
  let i = 0;
  while (bx < x1 - 0.1) {
    const bw = 0.18 + hash(Math.round(x0 * 10), i) * 0.2;
    const bh = 4 + Math.floor(hash(Math.round(x0 * 10), i, 3) * 8);
    planeY(ctx, 0, bx, Math.min(bx + bw, x1 - 0.08), z0 + 2, z0 + 2 + bh, i % 2 ? "#86b7d6" : "#7aa9c9");
    bx += bw + 0.04;
    i++;
  }
  // Cloud
  planeY(ctx, 0, x0 + 0.3, x0 + 0.85, z1 - 9, z1 - 7, "#ffffff");
  planeY(ctx, 0, x0 + 0.42, x0 + 0.7, z1 - 7, z1 - 5, "#ffffff");
  // Mullions
  const xm = (x0 + x1) / 2;
  planeY(ctx, 0, xm - 0.04, xm + 0.04, z0, z1, "#f7f5ef");
  planeY(ctx, 0, x0, x1, 30, 32, "#f7f5ef");
  line(ctx, iso(x1 - 0.35, 0, z1 - 4), iso(x1 - 0.2, 0, z1 - 10), "#d6f0fb");
  // Sill with a tiny cactus
  box(ctx, x0 - 0.06, 0, z0 - 2, x1 - x0 + 0.12, 0.18, 2, {
    top: "#ffffff",
    left: "#e2ddd2",
    right: "#cfc8bb",
  });
  box(ctx, x0 + 0.25, 0.04, z0, 0.1, 0.1, 3, { top: "#5b3b26", left: "#c86c45", right: "#a55430" });
  box(ctx, x0 + 0.27, 0.06, z0 + 3, 0.06, 0.06, 4, { top: "#6fcc72", left: "#3d8a46", right: "#2f6b3a" });
}

function drawSunlight(ctx: Ctx) {
  const [z0, z1] = WINDOW_Z;
  const reach = 0.065;
  const skew = 0.35;
  for (const [x0, x1] of WINDOWS) {
    const near = z0 * reach;
    const far = z1 * reach;
    fillPoly(
      ctx,
      [iso(x0 + near * skew, near), iso(x1 + near * skew, near), iso(x1 + far * skew, far), iso(x0 + far * skew, far)],
      "rgba(255, 240, 200, 0.16)",
    );
  }
}

function drawWhiteboard(ctx: Ctx) {
  const y0 = 1.4;
  const y1 = 4.6;
  const z0 = 18;
  const z1 = 44;
  planeX(ctx, 0, y0, y1, z0, z1, "#9aa1ad");
  planeX(ctx, 0, y0 + 0.07, y1 - 0.07, z0 + 2, z1 - 2, "#fbfcfe");
  // Bar chart
  const bars: [number, string][] = [
    [6, "#4fb3ff"],
    [10, "#4fb3ff"],
    [8, "#5bbf6a"],
    [14, "#5bbf6a"],
    [18, "#e84a5f"],
  ];
  bars.forEach(([h, c], i) => {
    const by = y0 + 0.3 + i * 0.22;
    planeX(ctx, 0, by, by + 0.14, z0 + 4, z0 + 4 + h, c);
  });
  line(ctx, iso(0, y0 + 0.25, z0 + 4), iso(0, y0 + 1.45, z0 + 4), "#2a2438");
  // Scribbles and sticky notes
  for (let i = 0; i < 4; i++) {
    const zz = z1 - 6 - i * 3;
    planeX(ctx, 0, y0 + 1.75, y0 + 1.75 + 0.5 + hash(i, 5) * 0.6, zz, zz + 1, i === 0 ? "#e84a5f" : "#3a5ba8");
  }
  planeX(ctx, 0, y0 + 2.0, y0 + 2.35, z0 + 4, z0 + 10, "#ffd166");
  planeX(ctx, 0, y0 + 2.5, y0 + 2.85, z0 + 6, z0 + 12, "#ff9fb6");
  planeX(ctx, 0, y0 + 1.8, y0 + 1.95, z0 + 6, z0 + 8, "#2a2438");
  box(ctx, 0, y0 + 0.4, z0 - 1, 0.14, y1 - y0 - 0.8, 1, { top: "#c6ccd6", left: "#9aa1ad", right: "#838b98" });
  box(ctx, 0.02, y0 + 0.7, z0, 0.06, 0.16, 1, { top: "#e84a5f", left: "#c23a4d", right: "#9e2f3f" });
  box(ctx, 0.02, y0 + 1.0, z0, 0.06, 0.16, 1, { top: "#3a5ba8", left: "#2d4885", right: "#233866" });
}

function drawPoster(ctx: Ctx) {
  const x0 = 6.12;
  const x1 = 6.68;
  planeY(ctx, 0, x0, x1, 24, 42, "#2a2438");
  planeY(ctx, 0, x0 + 0.05, x1 - 0.05, 25, 41, "#f6efe1");
  planeY(ctx, 0, x0 + 0.12, x1 - 0.12, 33, 39, "#e84a5f");
  planeY(ctx, 0, x0 + 0.12, x1 - 0.12, 28, 31, "#2a2438");
  planeY(ctx, 0, x0 + 0.12, x0 + 0.3, 26, 27, "#2a2438");
}

function drawPicture(ctx: Ctx) {
  const y0 = 7.0;
  const y1 = 8.7;
  const z0 = 28;
  const z1 = 42;
  planeX(ctx, 0, y0, y1, z0, z1, "#6b4b35");
  planeX(ctx, 0, y0 + 0.08, y1 - 0.08, z0 + 1.5, z1 - 1.5, "#f6c98a");
  planeX(ctx, 0, y0 + 0.08, y1 - 0.08, z0 + 1.5, z0 + 6, "#e9a36a");
  planeX(ctx, 0, y0 + 1.1, y0 + 1.3, z1 - 7, z1 - 4, "#fff1c9");
  fillPoly(ctx, [iso(0, y0 + 0.1, z0 + 2), iso(0, y0 + 1.0, z0 + 2), iso(0, y0 + 0.55, z0 + 9)], "#6c5a8e");
  fillPoly(ctx, [iso(0, y0 + 0.6, z0 + 2), iso(0, y1 - 0.1, z0 + 2), iso(0, y0 + 1.15, z0 + 8)], "#4f4373");
}

function drawUpperCabinet(ctx: Ctx) {
  box(ctx, 1.0, 0, 34, 2.2, 0.38, 13, { top: "#efe9dd", left: "#7b9aa6", right: "#5f7f8c" });
  for (const dx of [0.73, 1.46]) line(ctx, iso(1.0 + dx, 0.38, 35), iso(1.0 + dx, 0.38, 46), "#55737f");
  for (const dx of [0.6, 0.86, 1.33, 1.6]) planeY(ctx, 0.38, 1.0 + dx, 1.0 + dx + 0.05, 37, 38, "#d8e2e6");
}

/** Analog wall clock on the left wall, showing the viewer's local time. */
export function drawClock(ctx: Ctx, now: Date) {
  const yc = 5.3;
  const zc = 45;
  const unit = 17.9; // screen length of one tile along the wall
  const ring = (r: number) =>
    Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      return iso(0, yc + (Math.cos(a) * r) / unit, zc + Math.sin(a) * r);
    });
  fillPoly(ctx, ring(6), "#2a2438");
  fillPoly(ctx, ring(5), "#fbfcfe");
  const hand = (frac: number, len: number, color: string) => {
    const a = frac * Math.PI * 2;
    line(ctx, iso(0, yc, zc), iso(0, yc - (Math.sin(a) * len) / unit, zc + Math.cos(a) * len), color);
  };
  const m = now.getMinutes() + now.getSeconds() / 60;
  hand(((now.getHours() % 12) + m / 60) / 12, 2.5, "#2a2438");
  hand(m / 60, 4, "#2a2438");
  hand(now.getSeconds() / 60, 4, "#e84a5f");
}
