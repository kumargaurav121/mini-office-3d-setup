"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * World units per design pixel. The layout keeps the 2D design's units:
 * x/y are tiles on the floor (x = gx, y = gy) and heights are design pixels.
 * In three.js the floor is the XZ plane, so grid y becomes world z.
 */
export const K = 0.05;

export const unitBox = new THREE.BoxGeometry(1, 1, 1);

const materials = new Map<string, THREE.MeshStandardMaterial>();

/** Shared matte material per colour (for the few boxes that aren't batched). */
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

// ---------------------------------------------------------------------------
// Batching: a room is several hundred static boxes. Instead of one mesh (and
// draw call) each, boxes register with the nearest <StaticBatch>, which draws
// them as one instanced mesh per kind and rebuilds only when the set changes.

type Kind = "cast" | "flat" | "blob";

interface Instance {
  kind: Kind;
  matrix: THREE.Matrix4;
  color: THREE.Color;
}

class Batch {
  readonly items = new Set<Instance>();
  readonly meshes: Record<Kind, THREE.InstancedMesh | null> = { cast: null, flat: null, blob: null };
  private dirty = true;

  add(item: Instance) {
    this.items.add(item);
    this.dirty = true;
    return () => {
      this.items.delete(item);
      this.dirty = true;
    };
  }

  attach(kind: Kind, mesh: THREE.InstancedMesh | null) {
    this.meshes[kind] = mesh;
    this.dirty = true;
  }

  /** Copy instances into the meshes if anything changed since last time. */
  sync() {
    if (!this.dirty) return;
    this.dirty = false;
    const counts: Record<Kind, number> = { cast: 0, flat: 0, blob: 0 };
    for (const item of this.items) {
      const mesh = this.meshes[item.kind];
      const i = counts[item.kind]++;
      if (!mesh || i >= CAPACITY[item.kind]) continue;
      mesh.setMatrixAt(i, item.matrix);
      mesh.setColorAt(i, item.color);
    }
    for (const kind of KINDS) {
      const mesh = this.meshes[kind];
      if (!mesh) continue;
      if (counts[kind] > CAPACITY[kind]) console.warn(`StaticBatch: ${counts[kind]} ${kind} items, capacity ${CAPACITY[kind]}`);
      mesh.count = Math.min(counts[kind], CAPACITY[kind]);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }
}

const BatchContext = createContext<Batch | null>(null);

const KINDS: Kind[] = ["cast", "flat", "blob"];
const CAPACITY: Record<Kind, number> = { cast: 2048, flat: 1024, blob: 256 };
const boxMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85, metalness: 0 });
const ico = new THREE.IcosahedronGeometry(1, 0);
const blobMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9, flatShading: true });

/** Collects the static boxes and blobs rendered below it into instanced meshes. */
export function StaticBatch({ children }: { children: ReactNode }) {
  const [batch] = useState(() => new Batch());
  const attachCast = useCallback((m: THREE.InstancedMesh | null) => batch.attach("cast", m), [batch]);
  const attachFlat = useCallback((m: THREE.InstancedMesh | null) => batch.attach("flat", m), [batch]);
  const attachBlob = useCallback((m: THREE.InstancedMesh | null) => batch.attach("blob", m), [batch]);
  useFrame(() => batch.sync());
  return (
    <BatchContext.Provider value={batch}>
      {children}
      <instancedMesh ref={attachCast} args={[unitBox, boxMaterial, CAPACITY.cast]} castShadow receiveShadow />
      <instancedMesh ref={attachFlat} args={[unitBox, boxMaterial, CAPACITY.flat]} receiveShadow />
      <instancedMesh ref={attachBlob} args={[ico, blobMaterial, CAPACITY.blob]} castShadow receiveShadow />
    </BatchContext.Provider>
  );
}

/** Registers one instance with the enclosing batch while mounted; `kind` null opts out. */
function useBatched(kind: Kind | null, position: THREE.Vector3Tuple, scale: THREE.Vector3Tuple, color: string) {
  const batch = useContext(BatchContext);
  const [px, py, pz] = position;
  const [sx, sy, sz] = scale;
  useLayoutEffect(() => {
    if (!batch || !kind) return;
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(px, py, pz),
      new THREE.Quaternion(),
      new THREE.Vector3(sx, sy, sz),
    );
    return batch.add({ kind, matrix, color: new THREE.Color(color) });
  }, [batch, kind, px, py, pz, sx, sy, sz, color]);
  return batch !== null && kind !== null;
}

export interface BlockProps {
  x: number;
  y: number;
  z?: number;
  w: number;
  d: number;
  h: number;
  color: string;
  /** Use an unlit material (drawn as its own mesh, not batched). */
  lit?: boolean;
  cast?: boolean;
}

/** Axis-aligned box: footprint (x, y, w, d) in tiles, base z and height h in design pixels. */
export function Block({ x, y, z = 0, w, d, h, color, lit = true, cast = true }: BlockProps) {
  const position: THREE.Vector3Tuple = [x + w / 2, (z + h / 2) * K, y + d / 2];
  const scale: THREE.Vector3Tuple = [w, h * K, d];
  const batched = useBatched(lit ? (cast ? "cast" : "flat") : null, position, scale, color);
  if (batched) return null;
  return (
    <mesh
      geometry={unitBox}
      material={lit ? mat(color) : glow(color)}
      position={position}
      scale={scale}
      castShadow={lit && cast}
      receiveShadow={lit}
    />
  );
}

const DECOR = 0.015;

/** Flat panel on the north wall (plane y = 0); higher layers sit in front. */
export function RightWallPanel(p: { x0: number; x1: number; z0: number; z1: number; color: string; layer?: number; lit?: boolean }) {
  const t = DECOR * (p.layer ?? 1);
  return <Block x={p.x0} y={0} z={p.z0} w={p.x1 - p.x0} d={t} h={p.z1 - p.z0} color={p.color} lit={p.lit} cast={false} />;
}

/** Flat panel on the west wall (plane x = 0). */
export function LeftWallPanel(p: { y0: number; y1: number; z0: number; z1: number; color: string; layer?: number; lit?: boolean }) {
  const t = DECOR * (p.layer ?? 1);
  return <Block x={0} y={p.y0} z={p.z0} w={t} d={p.y1 - p.y0} h={p.z1 - p.z0} color={p.color} lit={p.lit} cast={false} />;
}

/** Low-poly blob (foliage, fruit) centred at (x, y) tiles and height z design pixels; r in tiles. */
export function Blob({ x, y, z, r, color }: { x: number; y: number; z: number; r: number; color: string }) {
  const position: THREE.Vector3Tuple = [x, z * K, y];
  const batched = useBatched("blob", position, [r, r, r], color);
  if (batched) return null;
  return <mesh geometry={ico} position={position} scale={r} castShadow receiveShadow material={mat(color)} />;
}
