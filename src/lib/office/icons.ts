import { RES, type Ctx } from "./iso";
import type { IconName } from "./layout";
import { OUTLINE } from "./character";

export const ICON_COLORS: Record<string, string> = {
  k: "#2a2438",
  w: "#ffffff",
  l: "#b8bfd6",
  b: "#7a4a2a",
  r: "#e84a5f",
  y: "#ffd166",
  o: "#f29e4c",
  u: "#4fb3ff",
  g: "#5bbf6a",
};

// 7x7 pixel icons for speech bubbles.
export const ICONS: Record<IconName, string[]> = {
  coffee: [
    ".l..l..",
    "..l..l.",
    "kkkkk..",
    "kbbbkkk",
    "kwwwk.k",
    "kwwwkkk",
    ".kkk...",
  ],
  water: [
    "...u...",
    "..uuu..",
    ".uuuuu.",
    ".wuuuu.",
    "uwuuuuu",
    ".uuuuu.",
    "..uuu..",
  ],
  sun: [
    "o..y..o",
    ".o.y.o.",
    "..yyy..",
    "yyyyyyy",
    "..yyy..",
    ".o.y.o.",
    "o..y..o",
  ],
  book: [
    ".......",
    "kk...kk",
    "kukkkrk",
    "kuukrrk",
    "kuukrrk",
    "kkkkkkk",
    ".......",
  ],
  pencil: [
    ".....rr",
    "....orr",
    "...ooo.",
    "..ooo..",
    ".ooo...",
    "wwo....",
    "kw.....",
  ],
  zzz: [
    "kkkk...",
    "..k....",
    ".k.....",
    "kkkk...",
    "....kkk",
    ".....k.",
    "....kkk",
  ],
  idea: [
    "..yyy..",
    ".yywyy.",
    ".ywyyy.",
    ".yyyyy.",
    "..yyy..",
    "..lll..",
    "..kkk..",
  ],
  heart: [
    ".......",
    ".rr.rr.",
    "rwrrrrr",
    "rrrrrrr",
    ".rrrrr.",
    "..rrr..",
    "...r...",
  ],
  music: [
    "..kkkkk",
    "..k...k",
    "..k...k",
    "..k...k",
    "kkk.kkk",
    "kkk.kkk",
    ".......",
  ],
};

/** Speech bubble whose tail points at (x, y), with a 7x7 icon inside. */
export function drawBubble(ctx: Ctx, x: number, y: number, icon: IconName) {
  const S = RES;
  x = Math.round(x);
  y = Math.round(y);
  const size = 11 * S;
  const left = x - Math.floor(size / 2);
  const top = y - size - 3 * S;
  const bottom = top + size;
  // Rounded box with a 1px outline and a small tail.
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(left + 2, top, size - 4, size);
  ctx.fillRect(left, top + 2, size, size - 4);
  ctx.fillRect(left + 1, top + 1, size - 2, size - 2);
  ctx.fillRect(x - 3, bottom, 7, 1);
  ctx.fillRect(x - 2, bottom + 1, 5, 1);
  ctx.fillRect(x - 1, bottom + 2, 3, 1);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(left + 2, top + 1, size - 4, size - 2);
  ctx.fillRect(left + 1, top + 2, size - 2, size - 4);
  ctx.fillRect(x - 2, bottom - 1, 5, 1);
  ctx.fillRect(x - 1, bottom, 3, 1);
  ctx.fillRect(x, bottom + 1, 1, 1);

  const rows = ICONS[icon];
  const ox = left + Math.round((size - 7 * S) / 2);
  const oy = top + Math.round((size - 7 * S) / 2);
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const ch = rows[r][c];
      if (ch === ".") continue;
      ctx.fillStyle = ICON_COLORS[ch];
      ctx.fillRect(ox + c * S, oy + r * S, S, S);
    }
  }
}
