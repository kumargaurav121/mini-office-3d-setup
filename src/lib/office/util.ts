// Small shared helpers: a 2D point type, colour shading and deterministic noise.

export type Vec = { x: number; y: number };

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

/** 32-bit FNV-1a hash of a string (stable ids and seeds). */
export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
