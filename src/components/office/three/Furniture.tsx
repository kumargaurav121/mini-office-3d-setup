"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { hash, type Vec } from "@/lib/office/iso";
import type { DeskItem } from "@/lib/office/employees";
import { DESKS, FURNITURE, type DeskSlot, type Dir, type Furniture as FurnitureDef } from "@/lib/office/layout";
import { isBrewing, isTyping, type Agent, type OfficeSim } from "@/lib/office/sim";
import { Blob, Block, glow, K, unitBox } from "./primitives";

const BOOKS = ["#e84a5f", "#4fb3ff", "#ffd166", "#5bbf6a", "#9b7be0", "#f29e4c", "#2f9e8f", "#e6e1d6"];
const CODE = ["#7ee787", "#79c0ff", "#ffa657", "#d2a8ff", "#ff7b72", "#e6edf3"];
const PANEL = "#ecebf2";
const DESKTOP = "#e3c193";
const MONITOR = "#3a3e4f";
const KEYBOARD = "#3f4357";
const CHAIR = "#56648c";
const CHAIR_DARK = "#3a3c4a";
const POT = "#c86c45";
const SOIL = "#5b3b26";

export function Furniture({ sim }: { sim: OfficeSim }) {
  return (
    <>
      {FURNITURE.map((f) => (
        <Piece key={f.id} f={f} sim={sim} />
      ))}
      {DESKS.map((desk) => (
        <Desk key={desk.index} desk={desk} owner={sim.agents.find((a) => a.desk.index === desk.index)} />
      ))}
      {DESKS.map((desk) => (
        <Chair key={desk.index} seat={desk.seat} facing={desk.facing} />
      ))}
    </>
  );
}

function Piece({ f, sim }: { f: FurnitureDef; sim: OfficeSim }) {
  const { x, y, w, d } = f;
  switch (f.kind) {
    case "fridge":
      return (
        <>
          <Block x={x} y={y} w={w} d={d} h={34} color="#eef1f5" />
          <Block x={x + 0.04} y={y + d} z={21} w={w - 0.08} d={0.01} h={1} color="#aab3c0" cast={false} />
          <Block x={x + w - 0.16} y={y + d} z={24} w={0.06} d={0.04} h={7} color="#7d8794" />
          <Block x={x + w - 0.16} y={y + d} z={12} w={0.06} d={0.04} h={6} color="#7d8794" />
          <Block x={x + 0.2} y={y + d} z={27} w={0.1} d={0.015} h={2} color="#e84a5f" cast={false} />
          <Block x={x + 0.38} y={y + d} z={25} w={0.08} d={0.015} h={2} color="#ffd166" cast={false} />
          <Block x={x + 0.25} y={y + d} z={23} w={0.08} d={0.015} h={2} color="#4fb3ff" cast={false} />
        </>
      );
    case "counter": {
      const mx = x + 1.2;
      return (
        <>
          <Block x={x} y={y} w={w} d={d} h={11} color="#7b9aa6" />
          {[0.73, 1.46].map((dx) => (
            <Block key={dx} x={x + dx - 0.01} y={y + d} z={1} w={0.02} d={0.01} h={9} color="#55737f" cast={false} />
          ))}
          {[0.6, 0.86, 1.33, 1.6].map((dx) => (
            <Block key={dx} x={x + dx} y={y + d} z={7} w={0.05} d={0.02} h={1} color="#d8e2e6" cast={false} />
          ))}
          <Block x={x - 0.02} y={y} z={11} w={w + 0.04} d={d + 0.04} h={2} color="#f4efe5" />
          {/* Coffee machine */}
          <Block x={mx} y={y + 0.12} z={13} w={0.46} d={0.44} h={12} color="#4a4458" />
          <Block x={mx + 0.1} y={y + 0.56} z={14} w={0.26} d={0.01} h={6} color="#1c1824" cast={false} />
          <Block x={mx + 0.17} y={y + 0.4} z={14} w={0.12} d={0.12} h={3} color="#ffffff" />
          <Led sim={sim} x={mx + 0.32} y={y + 0.56} z={22} />
          <Steam sim={sim} x={mx + 0.23} y={y + 0.34} z={25} />
          {/* Mugs and a fruit bowl */}
          <Block x={x + 0.25} y={y + 0.35} z={13} w={0.12} d={0.12} h={4} color="#e84a5f" />
          <Block x={x + 0.45} y={y + 0.4} z={13} w={0.12} d={0.12} h={4} color="#ffffff" />
          <Block x={x + 1.8} y={y + 0.3} z={13} w={0.3} d={0.3} h={2} color="#5c7fa8" />
          <Blob x={x + 1.9} y={y + 0.4} z={16.5} r={0.07} color="#f29e4c" />
          <Blob x={x + 2.0} y={y + 0.42} z={17} r={0.07} color="#e84a5f" />
          <Blob x={x + 1.95} y={y + 0.52} z={16} r={0.07} color="#ffd166" />
        </>
      );
    }
    case "bookshelf": {
      // Hollow shelf so the books sit inside it.
      const books: { bx: number; bw: number; bh: number; zs: number; c: string }[] = [];
      let seed = 0;
      for (const zs of [3, 13, 23, 33]) {
        let bx = x + 0.1;
        while (bx < x + w - 0.16) {
          seed++;
          const bw = 0.06 + hash(seed, 1) * 0.05;
          if (hash(seed, 2) >= 0.12) {
            books.push({
              bx,
              bw,
              bh: 5 + Math.floor(hash(seed, 3) * 4),
              zs,
              c: BOOKS[Math.floor(hash(seed, 4) * BOOKS.length)],
            });
            bx += bw + 0.01;
          } else {
            bx += bw + 0.05;
          }
        }
      }
      return (
        <>
          <Block x={x} y={y} w={w} d={0.06} h={42} color="#5e3b26" />
          <Block x={x} y={y} w={0.07} d={d} h={42} color="#9a6844" />
          <Block x={x + w - 0.07} y={y} w={0.07} d={d} h={42} color="#9a6844" />
          <Block x={x} y={y} z={40} w={w} d={d} h={2} color="#9a6844" />
          {[0, 12, 22, 32].map((zs) => (
            <Block key={zs} x={x + 0.07} y={y} z={zs} w={w - 0.14} d={d} h={zs === 0 ? 3 : 1} color="#8a5a3c" />
          ))}
          {books.map((b, i) => (
            <Block key={i} x={b.bx} y={y + 0.1} z={b.zs} w={b.bw} d={d - 0.14} h={b.bh} color={b.c} />
          ))}
          <SmallPlant x={x + w - 0.35} y={y + 0.3} z={42} />
        </>
      );
    }
    case "cooler":
      return (
        <>
          <Block x={x} y={y} w={w} d={d} h={15} color="#e6e9ef" />
          <Block x={x + w} y={y + 0.12} z={6} w={0.01} d={0.36} h={7} color="#c5ccd6" cast={false} />
          <Block x={x + w} y={y + 0.16} z={10} w={0.05} d={0.08} h={2} color="#4fb3ff" />
          <Block x={x + w} y={y + 0.34} z={10} w={0.05} d={0.08} h={2} color="#e84a5f" />
          <Block x={x + 0.1} y={y + 0.1} z={15} w={w - 0.2} d={d - 0.2} h={11} color="#a6dcf7" />
          <Block x={x + 0.22} y={y + 0.22} z={26} w={0.16} d={0.16} h={1} color="#3d8fd0" />
        </>
      );
    case "couch":
      return (
        <>
          <Block x={x} y={y} w={0.32} d={d} h={16} color="#d39a35" />
          <Block x={x} y={y} w={w} d={0.24} h={11} color="#e2a83f" />
          <Block x={x + 0.3} y={y + 0.24} w={w - 0.3} d={d - 0.48} h={7} color="#e2a83f" />
          <Block x={x + 0.3} y={y + d / 2 - 0.01} z={7} w={w - 0.3} d={0.02} h={0.2} color="#b98228" cast={false} />
          <Block x={x + 0.3} y={y + 0.3} z={7} w={0.14} d={0.45} h={6} color="#4fb3ff" />
          <Block x={x + 0.3} y={y + d - 0.75} z={7} w={0.14} d={0.45} h={6} color="#e84a5f" />
          <Block x={x} y={y + d - 0.24} w={w} d={0.24} h={11} color="#e2a83f" />
        </>
      );
    case "coffeeTable":
      return (
        <>
          {[
            [0.04, 0.04],
            [w - 0.1, 0.04],
            [0.04, d - 0.1],
            [w - 0.1, d - 0.1],
          ].map(([lx, ly]) => (
            <Block key={`${lx}-${ly}`} x={x + lx} y={y + ly} w={0.06} d={0.06} h={5} color="#7d5235" />
          ))}
          <Block x={x} y={y} z={5} w={w} d={d} h={2} color={DESKTOP} />
          <Block x={x + 0.12} y={y + 0.2} z={7} w={0.3} d={0.4} h={1} color="#4fb3ff" />
          <Block x={x + 0.12} y={y + 0.22} z={8} w={0.28} d={0.34} h={1} color="#ffd166" />
          <Block x={x + 0.4} y={y + 0.75} z={7} w={0.12} d={0.12} h={4} color="#5bbf6a" />
        </>
      );
    case "printer":
      return (
        <>
          <Block x={x} y={y} w={w} d={d} h={12} color="#9aa3b5" />
          <Block x={x + 0.06} y={y + d} z={6} w={w - 0.12} d={0.01} h={0.4} color="#5d6475" cast={false} />
          <Block x={x + 0.1} y={y + 0.1} z={12} w={w - 0.2} d={d - 0.25} h={7} color="#eef1f5" />
          <Block x={x + 0.25} y={y + d - 0.15} z={14} w={w - 0.55} d={0.01} h={2} color="#2c2f3c" cast={false} />
          <Block x={x + 0.3} y={y + 0.2} z={19} w={0.35} d={0.3} h={0.3} color="#ffffff" />
          <Block x={x + w - 0.25} y={y + d - 0.15} z={16} w={0.07} d={0.015} h={1} color="#5bff8a" lit={false} cast={false} />
        </>
      );
    case "plant":
      return <BigPlant x={x + w / 2} y={y + d / 2} />;
  }
}

function BigPlant({ x, y }: { x: number; y: number }) {
  // A round bush: a wide lower ring of leaves, a smaller crown on top.
  const leaves: [number, number, number, number, string][] = [
    [0, 0, 17, 0.3, "#2f6b3a"],
    [0.2, -0.04, 19, 0.22, "#3d8a46"],
    [-0.18, 0.08, 19, 0.22, "#3d8a46"],
    [0.04, 0.2, 18, 0.21, "#2f6b3a"],
    [-0.04, -0.19, 20, 0.21, "#3d8a46"],
    [0.1, 0.08, 26, 0.22, "#4fa556"],
    [-0.1, -0.07, 27, 0.21, "#4fa556"],
    [0.02, 0.0, 32, 0.17, "#6fcc72"],
  ];
  return (
    <>
      <Block x={x - 0.2} y={y - 0.2} w={0.4} d={0.4} h={10} color={POT} />
      <Block x={x - 0.22} y={y - 0.22} z={8} w={0.44} d={0.44} h={2} color="#e08a5f" />
      <Block x={x - 0.17} y={y - 0.17} z={10} w={0.34} d={0.34} h={0.4} color={SOIL} />
      {leaves.map(([dx, dy, z, r, c], i) => (
        <Blob key={i} x={x + dx} y={y + dy} z={z} r={r} color={c} />
      ))}
    </>
  );
}

function SmallPlant({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <>
      <Block x={x - 0.09} y={y - 0.09} z={z} w={0.18} d={0.18} h={4} color={POT} />
      <Blob x={x} y={y} z={z + 7} r={0.12} color="#3d8a46" />
      <Blob x={x + 0.05} y={y - 0.03} z={z + 10} r={0.08} color="#5dbb63" />
    </>
  );
}

/** Coffee machine status light: green while someone's brewing. */
function Led({ sim, x, y, z }: { sim: OfficeSim; x: number; y: number; z: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (ref.current) ref.current.material = glow(sim.agents.some(isBrewing) ? "#5bff8a" : "#ff6b6b");
  });
  return (
    <mesh
      ref={ref}
      geometry={unitBox}
      material={glow("#ff6b6b")}
      position={[x + 0.04, (z + 0.5) * K, y + 0.01]}
      scale={[0.08, K, 0.02]}
    />
  );
}

const steamMaterial = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, depthWrite: false });

function Steam({ sim, x, y, z }: { sim: OfficeSim; x: number; y: number; z: number }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    g.visible = sim.agents.some(isBrewing);
    if (!g.visible) return;
    const t = clock.elapsedTime;
    g.children.forEach((puff, k) => {
      const phase = (t * 0.5 + k / g.children.length) % 1;
      puff.position.set(Math.sin(t * 3 + k * 2) * 0.04, phase * 0.6, Math.cos(t * 2 + k) * 0.03);
      puff.scale.setScalar(0.07 * (1 - phase * 0.7));
    });
  });
  return (
    <group ref={group} position={[x, z * K, y]} visible={false}>
      {[0, 1, 2, 3].map((k) => (
        <mesh key={k} geometry={unitBox} material={steamMaterial} />
      ))}
    </group>
  );
}

function Desk({ desk, owner }: { desk: DeskSlot; owner: Agent | undefined }) {
  const { x, y, w, d, seat } = desk;
  const towardViewer = desk.facing === "SW";
  const monitorY = towardViewer ? y + d - 0.32 : y + 0.22;
  const keyboardY = towardViewer ? y + 0.16 : y + d - 0.34;
  const items = owner?.emp.deskItems ?? ["notes", "mug"];
  const accent = owner?.emp.look.shirt ?? "#9aa1ad";
  return (
    <>
      <Block x={x + 0.04} y={y + 0.06} w={0.1} d={d - 0.12} h={9} color={PANEL} />
      <Block x={x + w - 0.14} y={y + 0.06} w={0.1} d={d - 0.12} h={9} color={PANEL} />
      <Block x={x + 0.14} y={towardViewer ? y + d - 0.14 : y + 0.08} z={2} w={w - 0.28} d={0.06} h={7} color={PANEL} />
      <Block x={x} y={y} z={9} w={w} d={d} h={2} color={DESKTOP} />
      <Block x={seat.x - 0.26} y={keyboardY} z={11} w={0.52} d={0.17} h={1} color={KEYBOARD} />
      <Block x={seat.x + 0.36} y={keyboardY + 0.03} z={11} w={0.08} d={0.11} h={1} color={KEYBOARD} />
      <Block x={seat.x - 0.17} y={monitorY - 0.08} z={11} w={0.34} d={0.24} h={1} color="#50566c" />
      <Block x={seat.x - 0.04} y={monitorY - 0.02} z={12} w={0.08} d={0.08} h={4} color="#50566c" />
      <Block x={seat.x - 0.42} y={monitorY} z={15} w={0.84} d={0.07} h={11} color={MONITOR} />
      <Screen desk={desk} owner={owner} faceY={towardViewer ? monitorY - 0.002 : monitorY + 0.072} flipped={towardViewer} />
      <DeskItemModel item={items[0]} at={{ x: x + 0.32, y: y + 0.5 }} accent={accent} />
      <DeskItemModel item={items[1]} at={{ x: x + w - 0.32, y: y + 0.5 }} accent={accent} />
    </>
  );
}

/** Small canvas texture with scrolling code; redrawn only when its content changes. */
class ScreenTexture {
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private key = "";

  constructor(private readonly seed: number) {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 58;
    this.ctx = canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.magFilter = THREE.NearestFilter;
  }

  draw(present: boolean, typing: boolean, t: number, accent: string) {
    const scroll = typing ? Math.floor(t * 2.5) : 0;
    const cursor = typing && Math.floor(t * 3) % 2 === 0;
    const key = present ? `on-${scroll}-${cursor}` : `off-${Math.floor(t * 6)}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.ctx;
    if (!present) {
      g.fillStyle = "#0f141d";
      g.fillRect(0, 0, 96, 58);
      g.fillStyle = accent;
      g.fillRect(14 + ((Math.sin(t * 0.7) + 1) / 2) * 60, 14 + ((Math.cos(t * 0.9) + 1) / 2) * 26, 8, 6);
    } else {
      g.fillStyle = "#18202e";
      g.fillRect(0, 0, 96, 58);
      for (let row = 0; row < 7; row++) {
        const n = row + scroll + this.seed * 17;
        const indent = Math.floor(hash(n, 7) * 3) * 8;
        const len = 14 + hash(n, 8) * 52;
        g.fillStyle = CODE[Math.floor(hash(n, 9) * CODE.length)];
        g.fillRect(6 + indent, 5 + row * 7, Math.min(len, 84 - indent), 3);
      }
      if (cursor) {
        g.fillStyle = "#e6edf3";
        g.fillRect(6, 50, 6, 3);
      }
    }
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
  }
}

function Screen({ desk, owner, faceY, flipped }: { desk: DeskSlot; owner: Agent | undefined; faceY: number; flipped: boolean }) {
  const [screen] = useState(() => new ScreenTexture(desk.index));
  useEffect(() => () => screen.dispose(), [screen]);
  useFrame(({ clock }) => {
    const present = owner?.mode === "desk";
    screen.draw(present, owner ? isTyping(owner) : false, owner?.t ?? clock.elapsedTime, owner?.emp.look.shirt ?? "#9aa1ad");
  });
  return (
    <mesh position={[desk.seat.x, 20.5 * K, faceY]} rotation={[0, flipped ? Math.PI : 0, 0]}>
      <planeGeometry args={[0.74, 0.45]} />
      <meshBasicMaterial map={screen.texture} toneMapped={false} />
    </mesh>
  );
}

function DeskItemModel({ item, at, accent }: { item: DeskItem; at: Vec; accent: string }) {
  const { x, y } = at;
  switch (item) {
    case "mug":
      return (
        <>
          <Block x={x - 0.06} y={y - 0.06} z={11} w={0.12} d={0.12} h={4} color={accent} />
          <Block x={x + 0.06} y={y - 0.02} z={12} w={0.04} d={0.04} h={2} color={accent} />
        </>
      );
    case "plant":
      return <SmallPlant x={x} y={y} z={11} />;
    case "books":
      return (
        <>
          <Block x={x - 0.15} y={y - 0.12} z={11} w={0.3} d={0.24} h={2} color="#e84a5f" />
          <Block x={x - 0.13} y={y - 0.1} z={13} w={0.26} d={0.2} h={2} color="#4fb3ff" />
        </>
      );
    case "notes":
      return (
        <>
          <Block x={x - 0.14} y={y - 0.12} z={11} w={0.26} d={0.22} h={0.2} color="#ffffff" cast={false} />
          <Block x={x - 0.04} y={y - 0.04} z={11.2} w={0.16} d={0.14} h={0.2} color="#ffd166" cast={false} />
        </>
      );
  }
}

function Chair({ seat, facing }: { seat: Vec; facing: Dir }) {
  const { x, y } = seat;
  const back = facing === "SW" ? -1 : 1;
  return (
    <>
      <Block x={x - 0.17} y={y - 0.17} w={0.34} d={0.34} h={1} color={CHAIR_DARK} />
      <Block x={x - 0.035} y={y - 0.035} z={1} w={0.07} d={0.07} h={4} color={CHAIR_DARK} />
      <Block x={x - 0.24} y={y - 0.24} z={5} w={0.48} d={0.48} h={2} color={CHAIR} />
      <Block x={x - 0.03} y={back < 0 ? y - 0.29 : y + 0.24} z={5} w={0.06} d={0.05} h={4} color={CHAIR_DARK} />
      {/* Lower backrest on the away-facing side so we can still see their shoulders. */}
      <Block x={x - 0.22} y={back < 0 ? y - 0.31 : y + 0.24} z={9} w={0.44} d={0.07} h={back < 0 ? 10 : 6} color={CHAIR} />
    </>
  );
}
