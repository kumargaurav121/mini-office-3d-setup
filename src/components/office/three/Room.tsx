"use client";

import { useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { hash } from "@/lib/office/util";
import { DOOR_H, EW_DOOR, NS_DOOR, ROOM_D, ROOM_W, SLAB, WALL_H, WALL_T } from "@/lib/office/layout";
import { SIDES, type Side } from "@/lib/office/rooms";
import { Block, K, LeftWallPanel, mat, RightWallPanel, StaticBatch, unitBox } from "./primitives";

const W = ROOM_W;
const D = ROOM_D;
const H = WALL_H;
const T = WALL_T;
const WINDOWS: [number, number][] = [
  [3.9, 5.9],
  [6.9, 8.9],
];
const WINDOW_Z: [number, number] = [17, 45];

/**
 * One room. Closed rooms have four walls; an `open` room (the one in focus)
 * lowers its walls, and everything hung on them, into the floor.
 */
export function Room({ open }: { open: boolean }) {
  return (
    <>
      <Floor />
      <Rugs />
      <Footings />
      <WallShell open={open}>
        <Sunlight />
        {SIDES.map((side) => (
          <Wall key={side} side={side} />
        ))}
        {WINDOWS.map(([x0, x1]) => (
          <Window key={x0} x0={x0} x1={x1} />
        ))}
        <Whiteboard />
        <Picture />
        <UpperCabinet />
        <Clock />
      </WallShell>
    </>
  );
}

/** Scales its children (batched separately) from full height down to nothing as `open` flips. */
function WallShell({ open, children }: { open: boolean; children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const [initialScale] = useState<THREE.Vector3Tuple>(() => [1, open ? 0 : 1, 1]);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const target = open ? 0 : 1;
    const y = g.scale.y + (target - g.scale.y) * (1 - Math.exp(-dt * 8));
    g.scale.y = Math.abs(y - target) < 0.002 ? target : y;
    g.visible = g.scale.y > 0.01;
  });
  return (
    <group ref={group} scale={initialScale} visible={!open}>
      <StaticBatch>{children}</StaticBatch>
    </group>
  );
}

let floorTexture: THREE.CanvasTexture | null = null;

/** Wood planks running along x, painted once into a canvas (64px per tile). */
function getFloorTexture() {
  if (floorTexture) return floorTexture;
  const px = 64;
  const canvas = document.createElement("canvas");
  canvas.width = W * px;
  canvas.height = D * px;
  const g = canvas.getContext("2d")!;
  const tones = ["#c99560", "#c08b57", "#d19d68", "#c4905b"];
  const plank = 1.5;
  for (let r = 0; r < D * 2; r++) {
    const y0 = r * 0.5 * px;
    const offset = ((r * 7) % 3) * 0.5;
    let k = 0;
    for (let x = -offset; x < W; x += plank, k++) {
      const x0 = Math.max(0, x) * px;
      const x1 = Math.min(W, x + plank) * px;
      g.fillStyle = tones[Math.floor(hash(r, k) * tones.length)];
      g.fillRect(x0, y0, x1 - x0, 0.5 * px);
      g.fillStyle = "rgba(120, 70, 30, 0.18)";
      for (let n = 0; n < 3; n++) {
        const gy = y0 + 4 + Math.floor(hash(r, k, n) * (0.5 * px - 8));
        const gx = x0 + Math.floor(hash(k, r, n) * (x1 - x0) * 0.5);
        g.fillRect(gx, gy, (x1 - x0) * (0.25 + hash(n, k, r) * 0.4), 1);
      }
      g.fillStyle = "#ad7845";
      if (x0 > 0) g.fillRect(x0, y0, 2, 0.5 * px);
    }
    g.fillStyle = "#ad7845";
    if (r > 0) g.fillRect(0, y0, W * px, 2);
  }
  floorTexture = new THREE.CanvasTexture(canvas);
  floorTexture.colorSpace = THREE.SRGBColorSpace;
  floorTexture.anisotropy = 8;
  return floorTexture;
}

function Floor() {
  const materials = useMemo(() => {
    const side = mat("#8a5d3b");
    const top = new THREE.MeshStandardMaterial({ map: getFloorTexture(), roughness: 0.8 });
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z
    return [side, side, top, side, side, side];
  }, []);
  return (
    <mesh
      geometry={unitBox}
      material={materials}
      position={[W / 2, (-SLAB * K) / 2, D / 2]}
      scale={[W, SLAB * K, D]}
      receiveShadow
    />
  );
}

function Rugs() {
  return (
    <>
      <Block x={3.1} y={2.3} w={5.8} d={5.4} h={0.3} color="#34406a" cast={false} />
      <Block x={3.25} y={2.45} w={5.5} d={5.1} h={0.4} color="#465789" cast={false} />
      <Block x={3.45} y={2.65} w={5.1} d={4.7} h={0.5} color="#34406a" cast={false} />
      <Block x={3.55} y={2.75} w={4.9} d={4.5} h={0.6} color="#465789" cast={false} />
      <Block x={0.3} y={6.3} w={2.7} d={3.1} h={0.3} color="#b9524a" cast={false} />
      <Block x={0.45} y={6.45} w={2.4} d={2.8} h={0.4} color="#d36c56" cast={false} />
      {[6.9, 7.8, 8.7].map((y) => (
        <Block key={y} x={0.45} y={y} w={2.4} d={0.12} h={0.5} color="#f0c27a" cast={false} />
      ))}
    </>
  );
}

type Span = { from: number; to: number };

/** The parts of [a, b] on either side of a doorway. */
const around = (a: number, b: number, door: Span): [number, number][] => [
  [a, door.from],
  [door.to, b],
];

const STRUCTURE = "#8c7564";
const TRIM = "#7d6553";
const THRESHOLD = "#b98250";
const DECOR = 0.015;

interface WallSpec {
  /** Floor axis the wall runs along. */
  along: "x" | "y";
  /** Coordinate of the wall's inner face on the other axis. */
  face: number;
  /** +1 if the wall's thickness lies on the positive side of `face`. */
  outward: 1 | -1;
  /** Extent of the structure along the wall (corners included once). */
  extent: [number, number];
  /** Extent of the inside finish. */
  inside: [number, number];
  door: Span;
  finish: { wall: string; wainscot: string; line: string; rail: string; base: string };
}

const NS_FINISH = { wall: "#f1e7d6", wainscot: "#9bb59e", line: "#8ca890", rail: "#6e8c74", base: "#5c7562" };
const EW_FINISH = { wall: "#e3d6c0", wainscot: "#88a38c", line: "#7a957e", rail: "#5f7d66", base: "#4f6855" };

// Corners: north takes NW, east takes NE, south takes SW and SE.
const WALLS: Record<Side, WallSpec> = {
  north: { along: "x", face: 0, outward: -1, extent: [-T, W], inside: [0, W], door: NS_DOOR, finish: NS_FINISH },
  south: { along: "x", face: D, outward: 1, extent: [-T, W + T], inside: [0, W], door: NS_DOOR, finish: NS_FINISH },
  west: { along: "y", face: 0, outward: -1, extent: [0, D], inside: [0, D], door: EW_DOOR, finish: EW_FINISH },
  east: { along: "y", face: W, outward: 1, extent: [-T, D], inside: [0, D], door: EW_DOOR, finish: EW_FINISH },
};

/**
 * A box against wall `spec`: [a, b] along it, z0..z0+h tall, and from
 * `depth0` to `depth1` measured outward from the inner face (negative = into the room).
 */
function wallBox(spec: WallSpec, a: number, b: number, z0: number, h: number, depth0: number, depth1: number, color: string, cast = true) {
  const p0 = spec.face + spec.outward * depth0;
  const p1 = spec.face + spec.outward * depth1;
  const lo = Math.min(p0, p1);
  const thick = Math.abs(p1 - p0);
  const k = `${a}-${z0}-${depth0}`;
  return spec.along === "x" ? (
    <Block key={k} x={a} y={lo} z={z0} w={b - a} d={thick} h={h} color={color} cast={cast} />
  ) : (
    <Block key={k} x={lo} y={a} z={z0} w={thick} d={b - a} h={h} color={color} cast={cast} />
  );
}

/** One wall: structure split around its doorway, inside finish, and door trim. */
function Wall({ side }: { side: Side }) {
  const spec = WALLS[side];
  const { door, finish } = spec;
  const panel = (a: number, b: number, z0: number, z1: number, color: string, layer: number) =>
    wallBox(spec, a, b, z0, z1 - z0, -DECOR * layer, 0, color, false);
  const length = spec.inside[1] - spec.inside[0];
  const lines = Array.from({ length: length * 2 - 1 }, (_, i) => spec.inside[0] + (i + 1) * 0.5).filter(
    (v) => v < door.from - 0.05 || v > door.to + 0.05,
  );
  return (
    <>
      {around(spec.extent[0], spec.extent[1], door).map(([a, b]) => wallBox(spec, a, b, 0, H, 0, T, STRUCTURE))}
      {wallBox(spec, door.from, door.to, DOOR_H, H - DOOR_H, 0, T, STRUCTURE)}
      {around(spec.inside[0], spec.inside[1], door).map(([a, b]) => (
        <group key={a}>
          {panel(a, b, 0, H, finish.wall, 0.5)}
          {panel(a, b, 0, 20, finish.wainscot, 1)}
          {panel(a, b, 20, 22, finish.rail, 2)}
          {panel(a, b, 0, 3, finish.base, 2)}
        </group>
      ))}
      {panel(door.from, door.to, DOOR_H, H, finish.wall, 0.5)}
      {lines.map((v) => panel(v - 0.015, v + 0.015, 4, 19, finish.line, 1.5))}
      {panel(door.from - 0.06, door.from, 0, DOOR_H + 1.5, TRIM, 2.5)}
      {panel(door.to, door.to + 0.06, 0, DOOR_H + 1.5, TRIM, 2.5)}
      {panel(door.from - 0.06, door.to + 0.06, DOOR_H, DOOR_H + 1.5, TRIM, 2.5)}
    </>
  );
}

/**
 * The part of every wall below floor level, plus the doorway thresholds. It
 * stays when the walls are lowered, so the floor keeps its rim and bridges stay joined.
 */
function Footings() {
  return (
    <>
      {SIDES.map((side) => {
        const spec = WALLS[side];
        return (
          <group key={side}>
            {around(spec.extent[0], spec.extent[1], spec.door).map(([a, b]) => wallBox(spec, a, b, -SLAB, SLAB, 0, T, STRUCTURE))}
            {wallBox(spec, spec.door.from, spec.door.to, -SLAB, SLAB, 0, T, THRESHOLD)}
          </group>
        );
      })}
    </>
  );
}

function Window({ x0, x1 }: { x0: number; x1: number }) {
  const [z0, z1] = WINDOW_Z;
  const xm = (x0 + x1) / 2;
  const seed = Math.round(x0 * 10);
  const skyline: { a: number; b: number; h: number; c: string }[] = [];
  for (let bx = x0 + 0.08, i = 0; bx < x1 - 0.1; i++) {
    const bw = 0.18 + hash(seed, i) * 0.2;
    skyline.push({
      a: bx,
      b: Math.min(bx + bw, x1 - 0.08),
      h: 4 + Math.floor(hash(seed, i, 3) * 8),
      c: i % 2 ? "#86b7d6" : "#7aa9c9",
    });
    bx += bw + 0.04;
  }
  return (
    <>
      <RightWallPanel x0={x0} x1={x1} z0={z0} z1={z1} color="#f7f5ef" layer={2.5} />
      <RightWallPanel x0={x0 + 0.08} x1={x1 - 0.08} z0={z0 + 2} z1={z1 - 2} color="#8fd0f2" layer={3} lit={false} />
      <RightWallPanel x0={x0 + 0.08} x1={x1 - 0.08} z0={z0 + 2} z1={z0 + 14} color="#b5e2f6" layer={3.2} lit={false} />
      {skyline.map((s) => (
        <RightWallPanel key={s.a} x0={s.a} x1={s.b} z0={z0 + 2} z1={z0 + 2 + s.h} color={s.c} layer={3.5} lit={false} />
      ))}
      <RightWallPanel x0={x0 + 0.3} x1={x0 + 0.85} z0={z1 - 9} z1={z1 - 7} color="#ffffff" layer={3.5} lit={false} />
      <RightWallPanel x0={x0 + 0.42} x1={x0 + 0.7} z0={z1 - 7} z1={z1 - 5} color="#ffffff" layer={3.5} lit={false} />
      <RightWallPanel x0={xm - 0.04} x1={xm + 0.04} z0={z0} z1={z1} color="#f7f5ef" layer={4} />
      <RightWallPanel x0={x0} x1={x1} z0={30} z1={32} color="#f7f5ef" layer={4} />
      <Block x={x0 - 0.06} y={0} z={z0 - 2} w={x1 - x0 + 0.12} d={0.18} h={2} color="#ffffff" />
      <Block x={x0 + 0.25} y={0.04} z={z0} w={0.1} d={0.1} h={3} color="#c86c45" />
      <Block x={x0 + 0.27} y={0.06} z={z0 + 3} w={0.06} d={0.06} h={4} color="#3d8a46" />
    </>
  );
}

/** Warm light patches the windows throw onto the floor. */
function Sunlight() {
  const { geometry, material } = useMemo(() => {
    const [z0, z1] = WINDOW_Z;
    const reach = 0.065;
    const skew = 0.35;
    const near = z0 * reach;
    const far = z1 * reach;
    const y = 0.035;
    const pos: number[] = [];
    for (const [x0, x1] of WINDOWS) {
      const a = [x0 + near * skew, y, near];
      const b = [x1 + near * skew, y, near];
      const c = [x1 + far * skew, y, far];
      const d = [x0 + far * skew, y, far];
      pos.push(...a, ...d, ...c, ...a, ...c, ...b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const material = new THREE.MeshBasicMaterial({
      color: "#fff0c8",
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    return { geometry, material };
  }, []);
  return <mesh geometry={geometry} material={material} />;
}

function Whiteboard() {
  const y0 = 1.4;
  const y1 = 4.6;
  const z0 = 18;
  const z1 = 44;
  const bars: [number, string][] = [
    [6, "#4fb3ff"],
    [10, "#4fb3ff"],
    [8, "#5bbf6a"],
    [14, "#5bbf6a"],
    [18, "#e84a5f"],
  ];
  return (
    <>
      <LeftWallPanel y0={y0} y1={y1} z0={z0} z1={z1} color="#9aa1ad" layer={2.5} />
      <LeftWallPanel y0={y0 + 0.07} y1={y1 - 0.07} z0={z0 + 2} z1={z1 - 2} color="#fbfcfe" layer={3} />
      {bars.map(([h, c], i) => {
        const by = y0 + 0.3 + i * 0.22;
        return <LeftWallPanel key={i} y0={by} y1={by + 0.14} z0={z0 + 4} z1={z0 + 4 + h} color={c} layer={3.5} />;
      })}
      <LeftWallPanel y0={y0 + 0.25} y1={y0 + 1.45} z0={z0 + 3.6} z1={z0 + 4} color="#2a2438" layer={3.5} />
      {[0, 1, 2, 3].map((i) => {
        const zz = z1 - 6 - i * 3;
        return (
          <LeftWallPanel
            key={i}
            y0={y0 + 1.75}
            y1={y0 + 1.75 + 0.5 + hash(i, 5) * 0.6}
            z0={zz}
            z1={zz + 0.8}
            color={i === 0 ? "#e84a5f" : "#3a5ba8"}
            layer={3.5}
          />
        );
      })}
      <LeftWallPanel y0={y0 + 2.0} y1={y0 + 2.35} z0={z0 + 4} z1={z0 + 10} color="#ffd166" layer={3.6} />
      <LeftWallPanel y0={y0 + 2.5} y1={y0 + 2.85} z0={z0 + 6} z1={z0 + 12} color="#ff9fb6" layer={3.6} />
      <Block x={0} y={y0 + 0.4} z={z0 - 1} w={0.14} d={y1 - y0 - 0.8} h={1} color="#c6ccd6" />
      <Block x={0.03} y={y0 + 0.7} z={z0} w={0.06} d={0.16} h={1} color="#e84a5f" />
      <Block x={0.03} y={y0 + 1.0} z={z0} w={0.06} d={0.16} h={1} color="#3a5ba8" />
    </>
  );
}

function Picture() {
  const y0 = 7.0;
  const y1 = 8.7;
  const z0 = 28;
  const z1 = 42;
  // Stepped "pixel" mountains
  const mountain = (a: number, b: number, color: string, steps: number) =>
    Array.from({ length: steps }, (_, i) => {
      const inset = ((b - a) / 2) * (i / steps);
      return (
        <LeftWallPanel
          key={`${a}-${i}`}
          y0={a + inset}
          y1={b - inset}
          z0={z0 + 2 + i * 2}
          z1={z0 + 4 + i * 2}
          color={color}
          layer={3.5}
        />
      );
    });
  return (
    <>
      <LeftWallPanel y0={y0} y1={y1} z0={z0} z1={z1} color="#6b4b35" layer={2.5} />
      <LeftWallPanel y0={y0 + 0.08} y1={y1 - 0.08} z0={z0 + 1.5} z1={z1 - 1.5} color="#f6c98a" layer={3} />
      <LeftWallPanel y0={y0 + 0.08} y1={y1 - 0.08} z0={z0 + 1.5} z1={z0 + 6} color="#e9a36a" layer={3.2} />
      <LeftWallPanel y0={y0 + 1.1} y1={y0 + 1.3} z0={z1 - 7} z1={z1 - 4} color="#fff1c9" layer={3.4} />
      {mountain(y0 + 0.1, y0 + 1.0, "#6c5a8e", 4)}
      {mountain(y0 + 0.65, y1 - 0.1, "#4f4373", 3)}
    </>
  );
}

function UpperCabinet() {
  return (
    <>
      <Block x={1.0} y={0} z={34} w={2.2} d={0.38} h={13} color="#7b9aa6" />
      {[0.73, 1.46].map((dx) => (
        <Block key={dx} x={1.0 + dx - 0.01} y={0.38} z={35} w={0.02} d={0.01} h={11} color="#55737f" cast={false} />
      ))}
      {[0.6, 0.86, 1.33, 1.6].map((dx) => (
        <Block key={dx} x={1.0 + dx} y={0.38} z={37} w={0.05} d={0.02} h={1} color="#d8e2e6" cast={false} />
      ))}
    </>
  );
}

/** Analog clock on the left wall, showing the viewer's local time. */
function Clock() {
  const hour = useRef<THREE.Group>(null);
  const minute = useRef<THREE.Group>(null);
  const second = useRef<THREE.Group>(null);
  useFrame(() => {
    const now = new Date();
    const s = now.getSeconds();
    const m = now.getMinutes() + s / 60;
    const h = (now.getHours() % 12) + m / 60;
    // Seen from inside the room, clockwise runs from +y toward -z.
    if (hour.current) hour.current.rotation.x = -(h / 12) * Math.PI * 2;
    if (minute.current) minute.current.rotation.x = -(m / 60) * Math.PI * 2;
    if (second.current) second.current.rotation.x = -(s / 60) * Math.PI * 2;
  });
  const hand = (ref: RefObject<THREE.Group | null>, len: number, width: number, color: string, x: number) => (
    <group ref={ref} position={[x, 0, 0]}>
      <mesh geometry={unitBox} material={mat(color)} position={[0, len / 2, 0]} scale={[0.01, len, width]} />
    </group>
  );
  return (
    <group position={[0, 45 * K, 5.3]}>
      <mesh position={[0.03, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={mat("#2a2438")} castShadow>
        <cylinderGeometry args={[0.32, 0.32, 0.06, 24]} />
      </mesh>
      <mesh position={[0.065, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={mat("#fbfcfe")}>
        <cylinderGeometry args={[0.27, 0.27, 0.02, 24]} />
      </mesh>
      {hand(hour, 0.14, 0.035, "#2a2438", 0.08)}
      {hand(minute, 0.22, 0.025, "#2a2438", 0.085)}
      {hand(second, 0.23, 0.012, "#e84a5f", 0.09)}
    </group>
  );
}
