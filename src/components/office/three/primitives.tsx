"use client";

import * as THREE from "three";

/**
 * World units per design pixel. The layout keeps the 2D renderer's units:
 * x/y are tiles on the floor (x = gx, y = gy) and heights are design pixels.
 * In three.js the floor is the XZ plane, so grid y becomes world z.
 */
export const K = 0.05;

export const unitBox = new THREE.BoxGeometry(1, 1, 1);

const materials = new Map<string, THREE.MeshStandardMaterial>();

/** Shared matte material per colour, so hundreds of boxes cost a handful of materials. */
export function mat(color: string): THREE.MeshStandardMaterial {
  let m = materials.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 });
    materials.set(color, m);
  }
  return m;
}

const glows = new Map<string, THREE.MeshBasicMaterial>();

/** Unlit material for things that emit light (screens, LEDs, sky). */
export function glow(color: string): THREE.MeshBasicMaterial {
  let m = glows.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    glows.set(color, m);
  }
  return m;
}

export interface BlockProps {
  x: number;
  y: number;
  z?: number;
  w: number;
  d: number;
  h: number;
  color: string;
  /** Use an unlit material. */
  lit?: boolean;
  cast?: boolean;
  receive?: boolean;
}

/** Axis-aligned box: footprint (x, y, w, d) in tiles, base z and height h in design pixels. */
export function Block({ x, y, z = 0, w, d, h, color, lit = true, cast = true, receive = true }: BlockProps) {
  return (
    <mesh
      geometry={unitBox}
      material={lit ? mat(color) : glow(color)}
      position={[x + w / 2, (z + h / 2) * K, y + d / 2]}
      scale={[w, h * K, d]}
      castShadow={cast}
      receiveShadow={receive}
    />
  );
}

const DECOR = 0.015;

/** Flat panel on the right-hand wall (plane y = 0); higher layers sit in front. */
export function RightWallPanel(p: { x0: number; x1: number; z0: number; z1: number; color: string; layer?: number; lit?: boolean }) {
  const t = DECOR * (p.layer ?? 1);
  return <Block x={p.x0} y={0} z={p.z0} w={p.x1 - p.x0} d={t} h={p.z1 - p.z0} color={p.color} lit={p.lit} cast={false} />;
}

/** Flat panel on the left-hand wall (plane x = 0). */
export function LeftWallPanel(p: { y0: number; y1: number; z0: number; z1: number; color: string; layer?: number; lit?: boolean }) {
  const t = DECOR * (p.layer ?? 1);
  return <Block x={0} y={p.y0} z={p.z0} w={t} d={p.y1 - p.y0} h={p.z1 - p.z0} color={p.color} lit={p.lit} cast={false} />;
}

const ico = new THREE.IcosahedronGeometry(1, 0);
const faceted = new Map<string, THREE.MeshStandardMaterial>();

function facetedMat(color: string) {
  let m = faceted.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
    faceted.set(color, m);
  }
  return m;
}

/** Low-poly blob (foliage, fruit) centred at (x, y) tiles and height z design pixels; r in tiles. */
export function Blob({ x, y, z, r, color }: { x: number; y: number; z: number; r: number; color: string }) {
  return (
    <mesh
      geometry={ico}
      material={facetedMat(color)}
      position={[x, z * K, y]}
      scale={r}
      castShadow
      receiveShadow
    />
  );
}
