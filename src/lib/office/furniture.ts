import { box, fillPoly, floorRect, hash, iso, line, planeX, planeY, RES, type BoxColors, type Ctx, type Vec } from "./iso";
import type { DeskItem } from "./employees";
import type { DeskSlot, Dir, Furniture } from "./layout";

const WOOD: BoxColors = { top: "#e3c193", left: "#c49e6c", right: "#a8845a", edge: "#f2d8ae" };
const DARK_WOOD: BoxColors = { top: "#9a6844", left: "#7d5235", right: "#623f28" };
const PANEL: BoxColors = { top: "#ecebf2", left: "#d4d1de", right: "#b7b3c4" };
const CABINET: BoxColors = { top: "#efe9dd", left: "#7b9aa6", right: "#5f7f8c" };
const COUNTERTOP: BoxColors = { top: "#f4efe5", left: "#d3cbbb", right: "#b9b09f", edge: "#ffffff" };
const APPLIANCE: BoxColors = { top: "#eef1f5", left: "#d6dce4", right: "#b8c0cc" };
const MACHINE: BoxColors = { top: "#4a4458", left: "#3a3446", right: "#2c2736" };
const MONITOR: BoxColors = { top: "#50566c", left: "#3a3e4f", right: "#2c2f3c" };
const KEYBOARD: BoxColors = { top: "#3f4357", left: "#2c2f3e", right: "#23252f" };
const CHAIR: BoxColors = { top: "#56648c", left: "#424e70", right: "#343e5a" };
const CHAIR_DARK: BoxColors = { top: "#3a3c4a", left: "#2c2d38", right: "#22232c" };
const COUCH: BoxColors = { top: "#e2a83f", left: "#c58c2b", right: "#a77322" };
const COUCH_BACK: BoxColors = { top: "#d39a35", left: "#b88027", right: "#99691f" };
const POT: BoxColors = { top: "#5b3b26", left: "#c86c45", right: "#a55430" };
const SCREEN_BG = "#18202e";
const CODE = ["#7ee787", "#79c0ff", "#ffa657", "#d2a8ff", "#ff7b72", "#e6edf3"];
const BOOKS = ["#e84a5f", "#4fb3ff", "#ffd166", "#5bbf6a", "#9b7be0", "#f29e4c", "#2f9e8f", "#e6e1d6"];

/** Small convex pixel blob (octagon) centred on a screen point. */
function blob(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string) {
  const k = 0.55;
  fillPoly(
    ctx,
    [
      { x: cx - rx * k, y: cy - ry },
      { x: cx + rx * k, y: cy - ry },
      { x: cx + rx, y: cy - ry * k },
      { x: cx + rx, y: cy + ry * k },
      { x: cx + rx * k, y: cy + ry },
      { x: cx - rx * k, y: cy + ry },
      { x: cx - rx, y: cy + ry * k },
      { x: cx - rx, y: cy - ry * k },
    ],
    color,
  );
}

function foliage(ctx: Ctx, p: Vec, size: number) {
  const scale = size * RES;
  const leaves: [number, number, number, number, string][] = [
    [-5, -6, 5, 4, "#2f6b3a"],
    [5, -7, 5, 4, "#2f6b3a"],
    [0, -12, 6, 5, "#3d8a46"],
    [-6, -15, 5, 4, "#3d8a46"],
    [6, -16, 5, 4, "#3d8a46"],
    [0, -21, 5, 5, "#4fa556"],
    [-3, -10, 3, 3, "#5dbb63"],
    [3, -18, 3, 3, "#6fcc72"],
    [-4, -19, 2, 2, "#6fcc72"],
  ];
  for (const [dx, dy, rx, ry, c] of leaves) blob(ctx, p.x + dx * scale, p.y + dy * scale, rx * scale, ry * scale, c);
}

export function drawFurniture(ctx: Ctx, f: Furniture, time: number, brewing: boolean) {
  const { x, y, w, d } = f;
  switch (f.kind) {
    case "fridge": {
      box(ctx, x, y, 0, w, d, 34, APPLIANCE);
      planeY(ctx, y + d, x + 0.04, x + w - 0.04, 21, 22, "#aab3c0");
      planeY(ctx, y + d, x + w - 0.16, x + w - 0.1, 24, 31, "#7d8794");
      planeY(ctx, y + d, x + w - 0.16, x + w - 0.1, 12, 18, "#7d8794");
      planeY(ctx, y + d, x + 0.2, x + 0.3, 27, 29, "#e84a5f");
      planeY(ctx, y + d, x + 0.38, x + 0.46, 25, 27, "#ffd166");
      planeY(ctx, y + d, x + 0.25, x + 0.33, 23, 25, "#4fb3ff");
      break;
    }
    case "counter": {
      box(ctx, x, y, 0, w, d, 11, CABINET);
      for (const dx of [0.73, 1.46]) line(ctx, iso(x + dx, y + d, 1), iso(x + dx, y + d, 10), "#55737f");
      for (const dx of [0.6, 0.86, 1.33, 1.6]) planeY(ctx, y + d, x + dx, x + dx + 0.05, 7, 8, "#d8e2e6");
      box(ctx, x - 0.02, y, 11, w + 0.04, d + 0.04, 2, COUNTERTOP);
      // Coffee machine
      const mx = x + 1.2;
      box(ctx, mx, y + 0.12, 13, 0.46, 0.44, 12, MACHINE);
      planeY(ctx, y + 0.56, mx + 0.1, mx + 0.36, 14, 20, "#1c1824");
      box(ctx, mx + 0.17, y + 0.4, 14, 0.12, 0.12, 3, { top: "#ffffff", left: "#e6e1d6", right: "#cfc8bb" });
      planeY(ctx, y + 0.56, mx + 0.32, mx + 0.4, 22, 23, brewing ? "#5bff8a" : "#ff6b6b");
      if (brewing) {
        const top = iso(mx + 0.23, y + 0.34, 25);
        for (let k = 0; k < 4; k++) {
          const phase = (time * 10 + k * 3.5) % 14;
          const px = Math.round(top.x + Math.sin(time * 3 + k * 2) * 1.5 * RES);
          ctx.fillStyle = `rgba(255,255,255,${0.75 - phase / 20})`;
          ctx.fillRect(px, Math.round(top.y - phase * RES), RES, 2 * RES);
        }
      }
      // Mugs and a fruit bowl
      box(ctx, x + 0.25, y + 0.35, 13, 0.12, 0.12, 4, { top: "#7a4a2a", left: "#e84a5f", right: "#c23a4d" });
      box(ctx, x + 0.45, y + 0.4, 13, 0.12, 0.12, 4, { top: "#7a4a2a", left: "#ffffff", right: "#dcd6cc" });
      const bowl = iso(x + 1.95, y + 0.45, 13);
      const R = RES;
      blob(ctx, bowl.x, bowl.y - R, 4 * R, 2 * R, "#5c7fa8");
      blob(ctx, bowl.x - 2 * R, bowl.y - 3 * R, 1.6 * R, 1.6 * R, "#f29e4c");
      blob(ctx, bowl.x + R, bowl.y - 4 * R, 1.6 * R, 1.6 * R, "#e84a5f");
      blob(ctx, bowl.x + 2 * R, bowl.y - 2 * R, 1.6 * R, 1.6 * R, "#ffd166");
      break;
    }
    case "bookshelf": {
      box(ctx, x, y, 0, w, d, 42, DARK_WOOD);
      planeY(ctx, y + d, x + 0.07, x + w - 0.07, 2, 40, "#4a2f20");
      let seed = 0;
      for (const zs of [3, 13, 23, 33]) {
        planeY(ctx, y + d, x + 0.07, x + w - 0.07, zs - 1, zs, "#9a6844");
        let bx = x + 0.1;
        while (bx < x + w - 0.16) {
          seed++;
          const bw = 0.06 + hash(seed, 1) * 0.05;
          if (hash(seed, 2) < 0.12) {
            bx += bw + 0.05;
            continue;
          }
          const bh = 5 + Math.floor(hash(seed, 3) * 4);
          planeY(ctx, y + d, bx, bx + bw, zs, zs + bh, BOOKS[Math.floor(hash(seed, 4) * BOOKS.length)]);
          bx += bw + 0.01;
        }
      }
      planeY(ctx, y + d, x + 0.07, x + w - 0.07, 40, 41, "#9a6844");
      const p = iso(x + w - 0.35, y + 0.3, 42);
      box(ctx, x + w - 0.45, y + 0.2, 42, 0.2, 0.2, 4, POT);
      foliage(ctx, { x: p.x, y: p.y - 4 * RES }, 0.45);
      break;
    }
    case "cooler": {
      box(ctx, x, y, 0, w, d, 15, APPLIANCE);
      planeX(ctx, x + w, y + 0.12, y + 0.48, 6, 13, "#c5ccd6");
      planeX(ctx, x + w, y + 0.16, y + 0.24, 10, 12, "#4fb3ff");
      planeX(ctx, x + w, y + 0.34, y + 0.42, 10, 12, "#e84a5f");
      box(ctx, x + 0.1, y + 0.1, 15, w - 0.2, d - 0.2, 11, { top: "#d9f3ff", left: "#a6dcf7", right: "#7cc3ea" });
      line(ctx, iso(x + w - 0.1, y + 0.2, 17), iso(x + w - 0.1, y + 0.2, 24), "#e9f8ff");
      box(ctx, x + 0.22, y + 0.22, 26, 0.16, 0.16, 1, { top: "#4fb3ff", left: "#3d8fd0", right: "#2f75ad" });
      break;
    }
    case "coffeeTable": {
      for (const [lx, ly] of [
        [0.04, 0.04],
        [w - 0.1, 0.04],
        [0.04, d - 0.1],
        [w - 0.1, d - 0.1],
      ]) {
        box(ctx, x + lx, y + ly, 0, 0.06, 0.06, 5, DARK_WOOD);
      }
      box(ctx, x, y, 5, w, d, 2, WOOD);
      box(ctx, x + 0.12, y + 0.2, 7, 0.3, 0.4, 1, { top: "#4fb3ff", left: "#2f75ad", right: "#245c88" });
      box(ctx, x + 0.12, y + 0.22, 8, 0.28, 0.34, 1, { top: "#ffd166", left: "#d9a93f", right: "#b98d2f" });
      box(ctx, x + 0.4, y + 0.75, 7, 0.12, 0.12, 4, { top: "#7a4a2a", left: "#5bbf6a", right: "#47a056" });
      break;
    }
    case "printer": {
      box(ctx, x, y, 0, w, d, 12, { top: "#9aa3b5", left: "#7f889b", right: "#666e80" });
      line(ctx, iso(x + 0.06, y + d, 6), iso(x + w - 0.06, y + d, 6), "#5d6475");
      box(ctx, x + 0.1, y + 0.1, 12, w - 0.2, d - 0.25, 7, APPLIANCE);
      planeY(ctx, y + d - 0.15, x + 0.25, x + w - 0.3, 14, 16, "#2c2f3c");
      floorRect(ctx, x + 0.3, y + 0.2, 0.35, 0.3, "#ffffff", 19);
      planeY(ctx, y + d - 0.15, x + w - 0.25, x + w - 0.18, 16, 17, "#5bff8a");
      break;
    }
    case "plant": {
      const cx = x + w / 2;
      const cy = y + d / 2;
      box(ctx, cx - 0.2, cy - 0.2, 0, 0.4, 0.4, 10, POT);
      line(ctx, iso(cx - 0.2, cy + 0.2, 8), iso(cx + 0.2, cy + 0.2, 8), "#e08a5f");
      foliage(ctx, iso(cx, cy, 10), 1);
      break;
    }
    case "couch":
      // Drawn by drawCouch, which needs the sitters.
      break;
  }
}

/** Couch facing +gx with an optional callback to draw people on the cushions. */
export function drawCouch(ctx: Ctx, f: Furniture, drawSitters: () => void) {
  const { x, y, w, d } = f;
  box(ctx, x, y, 0, 0.32, d, 16, COUCH_BACK);
  box(ctx, x, y, 0, w, 0.24, 11, COUCH);
  box(ctx, x + 0.3, y + 0.24, 0, w - 0.3, d - 0.48, 7, COUCH);
  line(ctx, iso(x + 0.3, y + d / 2, 7), iso(x + w, y + d / 2, 7), "#b98228");
  box(ctx, x + 0.3, y + 0.3, 7, 0.14, 0.45, 6, { top: "#4fb3ff", left: "#3d8fd0", right: "#2f75ad" });
  box(ctx, x + 0.3, y + d - 0.75, 7, 0.14, 0.45, 6, { top: "#e84a5f", left: "#c23a4d", right: "#9e2f3f" });
  drawSitters();
  box(ctx, x, y + d - 0.24, 0, w, 0.24, 11, COUCH);
}

/** Office chair; `drawSitter` runs at the right point in the layering. */
export function drawChair(ctx: Ctx, seat: Vec, facing: Dir, drawSitter?: () => void) {
  const { x, y } = seat;
  box(ctx, x - 0.17, y - 0.17, 0, 0.34, 0.34, 1, CHAIR_DARK);
  box(ctx, x - 0.035, y - 0.035, 1, 0.07, 0.07, 4, CHAIR_DARK);
  if (facing === "SW") {
    box(ctx, x - 0.03, y - 0.29, 5, 0.06, 0.05, 4, CHAIR_DARK);
    box(ctx, x - 0.22, y - 0.31, 9, 0.44, 0.07, 10, CHAIR);
    box(ctx, x - 0.24, y - 0.24, 5, 0.48, 0.48, 2, CHAIR);
    drawSitter?.();
  } else {
    box(ctx, x - 0.24, y - 0.24, 5, 0.48, 0.48, 2, CHAIR);
    drawSitter?.();
    box(ctx, x - 0.03, y + 0.24, 5, 0.06, 0.05, 4, CHAIR_DARK);
    box(ctx, x - 0.22, y + 0.24, 9, 0.44, 0.07, 5, CHAIR);
  }
}

export interface ScreenState {
  /** Owner is at the desk. */
  present: boolean;
  typing: boolean;
  /** Seconds, used to scroll code while typing. */
  t: number;
}

export function drawDesk(ctx: Ctx, desk: DeskSlot, items: [DeskItem, DeskItem], accent: string, screen: ScreenState) {
  const { x, y, w, d, seat } = desk;
  const towardViewer = desk.facing === "SW";
  floorRect(ctx, x + 0.06, y + 0.06, w - 0.12, d - 0.12, "rgba(60, 30, 20, 0.16)");
  box(ctx, x + 0.04, y + 0.06, 0, 0.1, d - 0.12, 9, PANEL);
  box(ctx, x + w - 0.14, y + 0.06, 0, 0.1, d - 0.12, 9, PANEL);
  box(ctx, x + 0.14, towardViewer ? y + d - 0.14 : y + 0.08, 2, w - 0.28, 0.06, 7, PANEL);
  box(ctx, x, y, 9, w, d, 2, WOOD);

  const monitorY = towardViewer ? y + d - 0.32 : y + 0.22;
  const keyboardY = towardViewer ? y + 0.16 : y + d - 0.34;

  drawDeskItem(ctx, items[0], x + 0.32, y + 0.5, accent);
  const drawKeyboard = () => {
    box(ctx, seat.x - 0.26, keyboardY, 11, 0.52, 0.17, 1, KEYBOARD);
    box(ctx, seat.x + 0.36, keyboardY + 0.03, 11, 0.08, 0.11, 1, KEYBOARD);
  };
  const drawMonitor = () => {
    const x0 = seat.x - 0.42;
    const x1 = seat.x + 0.42;
    box(ctx, seat.x - 0.17, monitorY - 0.08, 11, 0.34, 0.24, 1, MONITOR);
    box(ctx, seat.x - 0.04, monitorY - 0.02, 12, 0.08, 0.08, 4, MONITOR);
    box(ctx, x0, monitorY, 15, x1 - x0, 0.07, 11, MONITOR);
    const face = monitorY + 0.07;
    if (towardViewer) {
      planeY(ctx, face, seat.x - 0.05, seat.x + 0.05, 20, 22, "#8a90a8");
      return;
    }
    planeY(ctx, face, x0 + 0.05, x1 - 0.05, 16, 25, screen.present ? SCREEN_BG : "#0f141d");
    if (!screen.present) {
      const bx = x0 + 0.15 + ((Math.sin(screen.t * 0.7) + 1) / 2) * 0.45;
      const bz = 18 + Math.round(((Math.cos(screen.t * 0.9) + 1) / 2) * 4);
      planeY(ctx, face, bx, bx + 0.08, bz, bz + 2, accent);
      return;
    }
    const scroll = screen.typing ? Math.floor(screen.t * 2.5) : 0;
    for (let row = 0; row < 4; row++) {
      const n = row + scroll + desk.index * 17;
      const indent = Math.floor(hash(n, 7) * 3) * 0.08;
      const len = 0.15 + hash(n, 8) * 0.38;
      const sx = x0 + 0.1 + indent;
      planeY(ctx, face, sx, Math.min(sx + len, x1 - 0.1), 23 - row * 2, 24 - row * 2, CODE[Math.floor(hash(n, 9) * CODE.length)]);
    }
    if (screen.typing && Math.floor(screen.t * 3) % 2 === 0) planeY(ctx, face, x0 + 0.1, x0 + 0.15, 16, 17, "#e6edf3");
  };
  if (towardViewer) {
    drawKeyboard();
    drawMonitor();
  } else {
    drawMonitor();
    drawKeyboard();
  }
  drawDeskItem(ctx, items[1], x + w - 0.32, y + 0.5, accent);
}

function drawDeskItem(ctx: Ctx, item: DeskItem, cx: number, cy: number, accent: string) {
  switch (item) {
    case "mug":
      box(ctx, cx - 0.06, cy - 0.06, 11, 0.12, 0.12, 4, { top: "#7a4a2a", left: accent, right: accent });
      break;
    case "plant": {
      box(ctx, cx - 0.08, cy - 0.08, 11, 0.16, 0.16, 3, POT);
      const p = iso(cx, cy, 14);
      const R = RES;
      blob(ctx, p.x - 2 * R, p.y - 2 * R, 2.5 * R, 2 * R, "#3d8a46");
      blob(ctx, p.x + 2 * R, p.y - 3 * R, 2.5 * R, 2 * R, "#3d8a46");
      blob(ctx, p.x, p.y - 5 * R, 2.5 * R, 2.5 * R, "#5dbb63");
      blob(ctx, p.x + R, p.y - 6 * R, 1.2 * R, 1.2 * R, "#7fd884");
      break;
    }
    case "books":
      box(ctx, cx - 0.15, cy - 0.12, 11, 0.3, 0.24, 2, { top: "#e6e1d6", left: "#e84a5f", right: "#c23a4d" });
      box(ctx, cx - 0.13, cy - 0.1, 13, 0.26, 0.2, 2, { top: "#e6e1d6", left: "#4fb3ff", right: "#2f75ad" });
      break;
    case "notes":
      floorRect(ctx, cx - 0.14, cy - 0.12, 0.26, 0.22, "#ffffff", 11);
      floorRect(ctx, cx - 0.04, cy - 0.04, 0.16, 0.14, "#ffd166", 11);
      break;
  }
}
