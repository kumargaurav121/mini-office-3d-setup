"use client";

import { useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { IDisposable, Terminal } from "@xterm/xterm";
import { monitorScreen, type DeskSlot } from "@/lib/office/layout";
import { CELL_H, CELL_W, paintTerminal } from "../terminal-paint";
import { terminalFor } from "../terminals";
import { K } from "./primitives";

const COLS = 100;
const ROWS = 30;
/** Repaint at most this often (seconds); output often arrives in bursts. */
const MIN_INTERVAL = 1 / 15;

/** A canvas texture kept in sync with an agent's xterm.js buffer. */
class TerminalCanvas {
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private term: Terminal | undefined;
  private subs: IDisposable[] = [];
  private dirty = true;
  private last = -Infinity;

  constructor() {
    const canvas = document.createElement("canvas");
    canvas.width = COLS * CELL_W;
    canvas.height = ROWS * CELL_H;
    this.ctx = canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
  }

  /** Follow `term` (it appears once the input terminal mounts, and may be replaced). */
  attach(term: Terminal | undefined) {
    if (term === this.term) return;
    this.detach();
    this.term = term;
    const mark = () => {
      this.dirty = true;
    };
    if (term) this.subs = [term.onWriteParsed(mark), term.onScroll(mark), term.onCursorMove(mark)];
    this.dirty = true;
  }

  paint(now: number) {
    if (!this.dirty || now - this.last < MIN_INTERVAL) return;
    this.dirty = false;
    this.last = now;
    if (this.term) paintTerminal(this.ctx, this.term);
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.detach();
    this.texture.dispose();
  }

  /** Stop listening and forget the terminal, so a later attach() subscribes afresh. */
  private detach() {
    for (const s of this.subs) s.dispose();
    this.subs = [];
    this.term = undefined;
  }
}

/**
 * An agent's live terminal drawn on its desk monitor, as part of the 3D scene,
 * so the agent, chairs and other desks in front of it correctly hide it.
 */
export function TerminalScreen({ agentId, desk }: { agentId: string; desk: DeskSlot }) {
  const [screen] = useState(() => new TerminalCanvas());
  useEffect(() => () => screen.dispose(), [screen]);
  useFrame(({ clock }) => {
    screen.attach(terminalFor(agentId));
    screen.paint(clock.elapsedTime);
  });
  const s = monitorScreen(desk);
  return (
    <mesh position={[s.x, s.z * K, s.y + s.facing * 0.003]} rotation={[0, s.facing < 0 ? Math.PI : 0, 0]}>
      <planeGeometry args={[s.width, s.height * K]} />
      <meshBasicMaterial map={screen.texture} toneMapped={false} />
    </mesh>
  );
}
