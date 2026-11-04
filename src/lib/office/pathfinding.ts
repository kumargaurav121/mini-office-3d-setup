import type { Vec } from "./util";
import { CHAIR_HALF, DESKS, FURNITURE, ROOM_D, ROOM_W } from "./layout";

// Walk graph: nodes every half tile, 4-connected along the iso axes so
// characters always face one of the four sprite directions.
const STEP = 0.5;
const NX = ROOM_W / STEP;
const NY = ROOM_D / STEP;
/** Roughly a character's footprint radius, so nobody clips into furniture. */
const MARGIN = 0.25;
const TURN_COST = 0.6;
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

const rects = [
  ...FURNITURE.map((f) => [f.x, f.y, f.x + f.w, f.y + f.d]),
  ...DESKS.map((d) => [d.x, d.y, d.x + d.w, d.y + d.d]),
  ...DESKS.map((d) => [
    d.seat.x - CHAIR_HALF,
    d.seat.y - CHAIR_HALF,
    d.seat.x + CHAIR_HALF,
    d.seat.y + CHAIR_HALF,
  ]),
];

const blocked = new Uint8Array((NX + 1) * (NY + 1));
for (let j = 0; j <= NY; j++) {
  for (let i = 0; i <= NX; i++) {
    const x = i * STEP;
    const y = j * STEP;
    const edge = i === 0 || j === 0 || i === NX || j === NY;
    const hit = rects.some(
      ([x0, y0, x1, y1]) => x > x0 - MARGIN && x < x1 + MARGIN && y > y0 - MARGIN && y < y1 + MARGIN,
    );
    blocked[j * (NX + 1) + i] = edge || hit ? 1 : 0;
  }
}

export function isWalkable(p: Vec): boolean {
  const i = Math.round(p.x / STEP);
  const j = Math.round(p.y / STEP);
  return i >= 0 && j >= 0 && i <= NX && j <= NY && !blocked[j * (NX + 1) + i];
}

/**
 * Shortest axis-aligned route between two grid nodes, preferring fewer turns.
 * Returns the corner waypoints (excluding `from`, including `to`).
 */
export function findPath(from: Vec, to: Vec): Vec[] {
  const W = NX + 1;
  const si = Math.round(from.x / STEP);
  const sj = Math.round(from.y / STEP);
  const gi = Math.round(to.x / STEP);
  const gj = Math.round(to.y / STEP);
  const start = sj * W + si;
  const goal = gj * W + gi;
  if (start === goal) return [to];

  const total = W * (NY + 1) * 4;
  const dist = new Float64Array(total).fill(Infinity);
  const prev = new Int32Array(total).fill(-1);
  const heap = new MinHeap();
  for (let d = 0; d < 4; d++) {
    dist[start * 4 + d] = 0;
    heap.push(0, start * 4 + d);
  }

  let end = -1;
  while (heap.size > 0) {
    const [cost, state] = heap.pop();
    if (cost > dist[state]) continue;
    const node = state >> 2;
    const dir = state & 3;
    if (node === goal) {
      end = state;
      break;
    }
    const i = node % W;
    const j = (node - i) / W;
    for (let nd = 0; nd < 4; nd++) {
      const ni = i + DX[nd];
      const nj = j + DY[nd];
      if (ni < 0 || nj < 0 || ni > NX || nj > NY) continue;
      const next = nj * W + ni;
      if (blocked[next] && next !== goal) continue;
      const c = cost + 1 + (nd === dir ? 0 : TURN_COST);
      const ns = next * 4 + nd;
      if (c < dist[ns]) {
        dist[ns] = c;
        prev[ns] = state;
        heap.push(c, ns);
      }
    }
  }
  if (end < 0) return [to];

  const states: number[] = [];
  for (let s = end; s >= 0; s = prev[s]) states.push(s);
  states.reverse();

  const out: Vec[] = [];
  for (let k = 1; k < states.length; k++) {
    const isLast = k === states.length - 1;
    if (isLast || (states[k] & 3) !== (states[k + 1] & 3)) {
      const node = states[k] >> 2;
      const i = node % W;
      out.push({ x: i * STEP, y: ((node - i) / W) * STEP });
    }
  }
  return out;
}

class MinHeap {
  private costs: number[] = [];
  private items: number[] = [];

  get size() {
    return this.items.length;
  }

  push(cost: number, item: number) {
    const c = this.costs;
    const it = this.items;
    let i = it.length;
    c.push(cost);
    it.push(item);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (c[p] <= cost) break;
      c[i] = c[p];
      it[i] = it[p];
      i = p;
    }
    c[i] = cost;
    it[i] = item;
  }

  pop(): [number, number] {
    const c = this.costs;
    const it = this.items;
    const topCost = c[0];
    const topItem = it[0];
    const lastCost = c.pop()!;
    const lastItem = it.pop()!;
    const n = it.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && c[r] < c[l] ? r : l;
        if (c[m] >= lastCost) break;
        c[i] = c[m];
        it[i] = it[m];
        i = m;
      }
      c[i] = lastCost;
      it[i] = lastItem;
    }
    return [topCost, topItem];
  }
}
