import { drawClock } from "./background";
import { drawCharacter, HEAD_TOP, OUTLINE } from "./character";
import { drawChair, drawCouch, drawDesk, drawFurniture } from "./furniture";
import { drawBubble } from "./icons";
import { iso, line, RES, TILE_H, TILE_W, type Ctx, type Vec } from "./iso";
import { BUFFER_H, BUFFER_W, CHAIR_HALF, DESKS, FURNITURE, ORIGIN, SEAT_Z } from "./layout";
import { agentPose, isBrewing, isSeated, isTyping, type Agent, type OfficeSim } from "./sim";

const HOVER = "#ffffff";
const SELECT = "#ffd166";

export interface View {
  hoveredId: string | null;
  selectedId: string | null;
}

/** Feet position of each employee in buffer pixels, refreshed every frame. */
export type Anchors = Map<string, Vec>;

interface Drawable {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  draw: () => void;
}

export function renderScene(
  ctx: Ctx,
  background: HTMLCanvasElement,
  sim: OfficeSim,
  view: View,
  time: number,
  now: Date,
): Anchors {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, BUFFER_W, BUFFER_H);
  ctx.drawImage(background, 0, 0);
  ctx.setTransform(1, 0, 0, 1, ORIGIN.x, ORIGIN.y);
  drawClock(ctx, now);

  const feet = new Map<Agent, Vec>();
  for (const a of sim.agents) {
    const p = iso(a.pos.x, a.pos.y);
    feet.set(a, isSeated(a) ? { x: p.x, y: p.y - (SEAT_Z - 6) * RES } : p);
  }

  const selected = sim.agents.find((a) => a.emp.id === view.selectedId);
  if (selected) drawMarker(ctx, selected, time);

  const drawAgent = (a: Agent) => {
    const p = feet.get(a)!;
    const { pose, frame } = agentPose(a);
    const outline = a === selected ? SELECT : a.emp.id === view.hoveredId ? HOVER : undefined;
    drawCharacter(ctx, p.x, p.y, a.emp.look, {
      dir: a.dir,
      pose,
      frame,
      blink: a.blinkLeft > 0,
      outline,
      shadow: !isSeated(a),
    });
  };

  const items: Drawable[] = [];
  const brewing = sim.agents.some(isBrewing);
  for (const f of FURNITURE) {
    const bounds = { x0: f.x, y0: f.y, z0: 0, x1: f.x + f.w, y1: f.y + f.d, z1: f.h };
    if (f.kind === "couch") {
      const sitters = sim.agents
        .filter((a) => a.mode === "poi" && a.poi?.activity === "couch")
        .sort((a, b) => a.pos.y - b.pos.y);
      items.push({ ...bounds, draw: () => drawCouch(ctx, f, () => sitters.forEach(drawAgent)) });
    } else {
      items.push({ ...bounds, draw: () => drawFurniture(ctx, f, time, brewing) });
    }
  }

  for (const desk of DESKS) {
    const owner = sim.agents.find((a) => a.desk.index === desk.index);
    const atDesk = owner?.mode === "desk";
    items.push({
      x0: desk.x,
      y0: desk.y,
      z0: 0,
      x1: desk.x + desk.w,
      y1: desk.y + desk.d,
      z1: 26,
      draw: () =>
        drawDesk(ctx, desk, owner?.emp.deskItems ?? ["notes", "mug"], owner?.emp.look.shirt ?? "#9aa1ad", {
          present: atDesk,
          typing: owner ? isTyping(owner) : false,
          t: owner?.t ?? time,
        }),
    });
    // The backrest sticks out a little on the side the sitter's back faces.
    const back = 0.05;
    items.push({
      x0: desk.seat.x - CHAIR_HALF,
      y0: desk.seat.y - CHAIR_HALF - (desk.facing === "SW" ? back : 0),
      z0: 0,
      x1: desk.seat.x + CHAIR_HALF,
      y1: desk.seat.y + CHAIR_HALF + (desk.facing === "NE" ? back : 0),
      z1: 28,
      draw: () => drawChair(ctx, desk.seat, desk.facing, atDesk && owner ? () => drawAgent(owner) : undefined),
    });
  }

  for (const a of sim.agents) {
    if (isSeated(a)) continue;
    const r = 0.15;
    items.push({
      x0: a.pos.x - r,
      y0: a.pos.y - r,
      z0: 0,
      x1: a.pos.x + r,
      y1: a.pos.y + r,
      z1: 26,
      draw: () => drawAgent(a),
    });
  }

  for (const d of depthSort(items)) d.draw();

  for (const a of sim.agents) {
    const p = feet.get(a)!;
    const head = p.y + HEAD_TOP;
    if (a.bubble) {
      drawBubble(ctx, p.x, head - (a.bubble.age < 0.12 ? 0 : RES), a.bubble.icon);
    } else if (a === selected) {
      drawArrow(ctx, Math.round(p.x), Math.round(head - 2 * RES - (Math.sin(time * 6) > 0 ? RES : 0)));
    }
  }

  const anchors: Anchors = new Map();
  for (const [a, p] of feet) anchors.set(a.emp.id, { x: p.x + ORIGIN.x, y: p.y + ORIGIN.y });
  return anchors;
}

/** Topmost employee under a point in buffer pixels. */
export function hitTest(anchors: Anchors, bx: number, by: number): string | null {
  let best: string | null = null;
  let bestY = -Infinity;
  for (const [id, p] of anchors) {
    const inside = bx >= p.x - 7 * RES && bx <= p.x + 7 * RES && by >= p.y + HEAD_TOP - RES && by <= p.y + 2 * RES;
    if (inside && p.y > bestY) {
      best = id;
      bestY = p.y;
    }
  }
  return best;
}

function drawMarker(ctx: Ctx, a: Agent, time: number) {
  const r = Math.sin(time * 5) > 0 ? 0.42 : 0.36;
  const { x, y } = a.pos;
  const pts = [iso(x - r, y - r), iso(x + r, y - r), iso(x + r, y + r), iso(x - r, y + r)];
  for (let i = 0; i < 4; i++) line(ctx, pts[i], pts[(i + 1) % 4], SELECT);
}

/** Downward-pointing marker above the selected employee. */
function drawArrow(ctx: Ctx, x: number, tipY: number) {
  const rows = [5, 3, 1].map((w, i) => ({ w: w * RES, y: tipY - (3 - i) * RES }));
  ctx.fillStyle = OUTLINE;
  for (const r of rows) ctx.fillRect(x - r.w / 2 - 1, r.y - 1, r.w + 2, RES + 2);
  ctx.fillStyle = SELECT;
  for (const r of rows) ctx.fillRect(x - r.w / 2, r.y, r.w, RES);
}

/**
 * Painter's order for iso boxes: for every pair whose screen rects overlap,
 * whichever is fully behind along x, y or z goes first; then topologically sort.
 */
function depthSort(items: Drawable[]): Drawable[] {
  const pad = 6 * RES;
  const rects = items.map((d) => ({
    l: (d.x0 - d.y1) * (TILE_W / 2) - pad,
    r: (d.x1 - d.y0) * (TILE_W / 2) + pad,
    t: (d.x0 + d.y0) * (TILE_H / 2) - d.z1 * RES - pad,
    b: (d.x1 + d.y1) * (TILE_H / 2) - d.z0 * RES,
  }));
  const behind: number[][] = items.map(() => []);
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = rects[i];
      const b = rects[j];
      if (a.l >= b.r || b.l >= a.r || a.t >= b.b || b.t >= a.b) continue;
      if (drawsBefore(items[i], items[j])) behind[j].push(i);
      else behind[i].push(j);
    }
  }
  const order = items.map((_, i) => i).sort((i, j) => depthKey(items[i]) - depthKey(items[j]));
  const seen = new Uint8Array(items.length);
  const out: Drawable[] = [];
  const visit = (i: number) => {
    if (seen[i]) return;
    seen[i] = 1;
    for (const k of behind[i]) visit(k);
    out.push(items[i]);
  };
  for (const i of order) visit(i);
  return out;
}

function depthKey(d: Drawable) {
  return d.x0 + d.x1 + d.y0 + d.y1;
}

function drawsBefore(a: Drawable, b: Drawable): boolean {
  if (a.x1 <= b.x0) return true;
  if (b.x1 <= a.x0) return false;
  if (a.y1 <= b.y0) return true;
  if (b.y1 <= a.y0) return false;
  if (a.z1 <= b.z0) return true;
  if (b.z1 <= a.z0) return false;
  return depthKey(a) < depthKey(b);
}
