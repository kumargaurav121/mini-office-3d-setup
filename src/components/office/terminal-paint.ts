import type { IBufferCell, Terminal } from "@xterm/xterm";

// The 3D monitors show the live terminal as a texture (so things in front of a
// monitor can hide it). These helpers paint an xterm.js buffer onto a canvas.

/** Canvas pixels per terminal cell; 2x the on-screen size so text stays sharp up close. */
export const CELL_W = 16;
export const CELL_H = 32;
const FONT = "26px Menlo, Monaco, 'Courier New', monospace";
export const TERM_BG = "#0d1117";
export const TERM_FG = "#e6edf3";

/** xterm's 256-colour palette: 16 ANSI colours, a 6x6x6 cube, then 24 greys. */
const PALETTE: string[] = (() => {
  const ansi = [
    "#2e3436", "#cc0000", "#4e9a06", "#c4a000", "#3465a4", "#75507b", "#06989a", "#d3d7cf",
    "#555753", "#ef2929", "#8ae234", "#fce94f", "#729fcf", "#ad7fa8", "#34e2e2", "#eeeeec",
  ];
  const hex = (v: number) => v.toString(16).padStart(2, "0");
  const steps = [0, 95, 135, 175, 215, 255];
  const cube: string[] = [];
  for (let r = 0; r < 6; r++)
    for (let g = 0; g < 6; g++)
      for (let b = 0; b < 6; b++) cube.push(`#${hex(steps[r])}${hex(steps[g])}${hex(steps[b])}`);
  const greys = Array.from({ length: 24 }, (_, i) => {
    const v = hex(8 + i * 10);
    return `#${v}${v}${v}`;
  });
  return [...ansi, ...cube, ...greys];
})();

const rgb = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

function fg(cell: IBufferCell): string | null {
  if (cell.isFgDefault()) return null;
  return cell.isFgRGB() ? rgb(cell.getFgColor()) : PALETTE[cell.getFgColor()] ?? null;
}

function bg(cell: IBufferCell): string | null {
  if (cell.isBgDefault()) return null;
  return cell.isBgRGB() ? rgb(cell.getBgColor()) : PALETTE[cell.getBgColor()] ?? null;
}

/** Draw the visible part of `term` (respecting scroll position) plus the cursor. */
export function paintTerminal(g: CanvasRenderingContext2D, term: Terminal) {
  const buf = term.buffer.active;
  g.globalAlpha = 1;
  g.fillStyle = TERM_BG;
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  g.textBaseline = "middle";
  let font = "";
  const cell = buf.getNullCell();
  for (let y = 0; y < term.rows; y++) {
    const line = buf.getLine(buf.viewportY + y);
    if (!line) continue;
    for (let x = 0; x < term.cols; x++) {
      if (!line.getCell(x, cell)) continue;
      const width = cell.getWidth();
      if (width === 0) continue; // second half of a wide character
      let fore = fg(cell);
      let back = bg(cell);
      if (cell.isInverse()) [fore, back] = [back ?? TERM_BG, fore ?? TERM_FG];
      if (back) {
        g.globalAlpha = 1;
        g.fillStyle = back;
        g.fillRect(x * CELL_W, y * CELL_H, CELL_W * width, CELL_H);
      }
      const ch = cell.getChars();
      if (!ch || ch === " ") continue;
      const want = `${cell.isBold() ? "bold " : ""}${cell.isItalic() ? "italic " : ""}${FONT}`;
      if (want !== font) g.font = font = want;
      g.globalAlpha = cell.isDim() ? 0.6 : 1;
      g.fillStyle = fore ?? TERM_FG;
      g.fillText(ch, x * CELL_W, y * CELL_H + CELL_H / 2);
      if (cell.isUnderline()) g.fillRect(x * CELL_W, (y + 1) * CELL_H - 4, CELL_W * width, 2);
    }
  }
  const cursorRow = buf.baseY + buf.cursorY - buf.viewportY;
  if (cursorRow >= 0 && cursorRow < term.rows) {
    g.globalAlpha = 0.7;
    g.fillStyle = TERM_FG;
    g.fillRect(buf.cursorX * CELL_W, cursorRow * CELL_H, CELL_W, CELL_H);
  }
  g.globalAlpha = 1;
}
