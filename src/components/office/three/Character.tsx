"use client";

import { useRef, type RefObject } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { shade } from "@/lib/office/iso";
import type { Look } from "@/lib/office/employees";
import { SEAT_Z, type Dir } from "@/lib/office/layout";
import { agentPose, isSeated, type Agent } from "@/lib/office/sim";
import { K, mat, unitBox } from "./primitives";

// Model faces +z; yaw turns it to the sim's facing.
const YAW: Record<Dir, number> = { SW: 0, SE: Math.PI / 2, NE: Math.PI, NW: -Math.PI / 2 };
const HIP = 0.26;
/** How far a seated character's root sits above the floor. */
export const SEAT_LIFT = SEAT_Z * K - HIP;
const HOVER = "#ffffff";
const SELECT = "#ffd166";
const SHOE = "#2b2430";
const EYE = "#241c2c";
const LENS = "#cfe7f5";
const FRAME = "#2a2633";
const BAND = "#2d2a3a";
const EARCUP = "#e84a5f";
const BLUSH = "#f0a39a";

type V3 = [number, number, number];

/** Box centred at p with size s, in the character's local space. */
function Part({ p, s, color }: { p: V3; s: V3; color: string }) {
  return <mesh geometry={unitBox} material={mat(color)} position={p} scale={s} castShadow />;
}

interface Props {
  agent: Agent;
  hovered: boolean;
  selected: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
}

export function Character({ agent, hovered, selected, onHover, onSelect }: Props) {
  const look = agent.emp.look;
  const root = useRef<THREE.Group>(null);
  const upper = useRef<THREE.Group>(null);
  const hipL = useRef<THREE.Group>(null);
  const hipR = useRef<THREE.Group>(null);
  const kneeL = useRef<THREE.Group>(null);
  const kneeR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const cup = useRef<THREE.Mesh>(null);
  const marker = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const arrow = useRef<THREE.Mesh>(null);
  const yaw = useRef(YAW[agent.dir]);

  useFrame(({ clock }, dt) => {
    if (!root.current || !upper.current || !hipL.current || !hipR.current) return;
    if (!kneeL.current || !kneeR.current || !armL.current || !armR.current) return;
    const a = agent;
    const t = clock.elapsedTime;
    const seated = isSeated(a);
    const { pose } = agentPose(a);

    root.current.position.set(a.pos.x, seated ? SEAT_LIFT : 0, a.pos.y);
    let diff = YAW[a.dir] - yaw.current;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    yaw.current += diff * (1 - Math.exp(-dt * 14));
    root.current.rotation.y = yaw.current;

    let hl = 0;
    let hr = 0;
    let kl = 0;
    let kr = 0;
    let al = 0.05;
    let ar = 0.05;
    let arz = 0;
    let bob = 0;
    if (pose === "walk") {
      const ph = a.walkT * 11;
      const s = Math.sin(ph);
      hl = s * 0.55;
      hr = -s * 0.55;
      kl = Math.max(0, -s) * 0.7;
      kr = Math.max(0, s) * 0.7;
      al = -s * 0.5;
      ar = s * 0.5;
      bob = Math.abs(Math.cos(ph)) * 0.025;
    } else if (seated) {
      hl = hr = -Math.PI / 2;
      kl = kr = Math.PI / 2;
      al = ar = -0.35;
      if (pose === "type") {
        al = -1.1 + Math.sin(t * 16) * 0.1;
        ar = -1.1 + Math.sin(t * 16 + Math.PI) * 0.1;
      }
    } else {
      const sway = Math.sin(t * 1.6 + a.desk.index) * 0.03;
      al = 0.05 + sway;
      ar = 0.05 - sway;
      bob = Math.sin(t * 2 + a.desk.index) * 0.004;
      if (pose === "drink") {
        ar = -2.25;
        arz = -0.35;
      } else if (pose === "write") {
        ar = -2.75 + Math.sin(t * 7) * 0.12;
        arz = Math.sin(t * 5) * 0.12;
      }
    }
    hipL.current.rotation.x = hl;
    hipR.current.rotation.x = hr;
    kneeL.current.rotation.x = kl;
    kneeR.current.rotation.x = kr;
    armL.current.rotation.x = al;
    armR.current.rotation.set(ar, 0, arz);
    upper.current.position.y = bob;
    if (eyes.current) eyes.current.scale.y = a.blinkLeft > 0 ? 0.15 : 1;
    if (cup.current) cup.current.visible = pose === "drink";
    if (marker.current) marker.current.visible = pose === "write";

    if (ring.current) ring.current.scale.setScalar(selected ? 1 + Math.sin(t * 5) * 0.06 : 1);
    if (arrow.current) arrow.current.position.y = 1.36 + Math.sin(t * 5) * 0.04;
  });

  const id = agent.emp.id;
  const skinD = shade(look.skin, -0.2);
  const shirtD = shade(look.shirt, -0.22);
  const pantsD = shade(look.pants, -0.28);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 5) return; // the pointer was dragging the camera
    onSelect(selected ? null : id);
  };

  return (
    <group ref={root} onPointerEnter={() => onHover(id)} onPointerLeave={() => onHover(null)} onClick={onClick}>
      <group ref={upper}>
        {/* Legs: hip and knee joints */}
        {(
          [
            [hipL, kneeL, 0.075, look.pants],
            [hipR, kneeR, -0.075, pantsD],
          ] as const
        ).map(([hip, knee, x, color]) => (
          <group key={x} ref={hip} position={[x, HIP, 0]}>
            <Part p={[0, -0.065, 0]} s={[0.12, 0.13, 0.14]} color={color} />
            <group ref={knee} position={[0, -0.13, 0]}>
              <Part p={[0, -0.05, 0]} s={[0.12, 0.1, 0.14]} color={color} />
              <Part p={[0, -0.112, 0.02]} s={[0.13, 0.036, 0.18]} color={SHOE} />
            </group>
          </group>
        ))}

        {/* Torso */}
        <Part p={[0, 0.43, 0]} s={[0.32, 0.34, 0.2]} color={look.shirt} />
        <Part p={[0, 0.28, 0]} s={[0.325, 0.04, 0.205]} color={pantsD} />
        <Part p={[0, 0.28, 0.104]} s={[0.05, 0.03, 0.01]} color="#d9c27a" />
        <Part p={[0, 0.59, 0.096]} s={[0.1, 0.025, 0.012]} color={skinD} />

        {/* Arms (left is +x when facing +z) */}
        <group ref={armL} position={[0.205, 0.58, 0]}>
          <Part p={[0, -0.12, 0]} s={[0.09, 0.26, 0.11]} color={shirtD} />
          <Part p={[0, -0.27, 0]} s={[0.085, 0.06, 0.1]} color={look.skin} />
        </group>
        <group ref={armR} position={[-0.205, 0.58, 0]}>
          <Part p={[0, -0.12, 0]} s={[0.09, 0.26, 0.11]} color={shirtD} />
          <Part p={[0, -0.27, 0]} s={[0.085, 0.06, 0.1]} color={look.skin} />
          <mesh ref={cup} geometry={unitBox} material={mat("#f3efe6")} position={[0, -0.31, 0.06]} scale={[0.08, 0.1, 0.08]} visible={false} />
          <mesh ref={marker} geometry={unitBox} material={mat("#d94a4a")} position={[0, -0.33, 0.03]} scale={[0.03, 0.08, 0.03]} visible={false} />
        </group>

        <Head look={look} eyes={eyes} skinD={skinD} />
      </group>

      {/* Hover / selection */}
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.045, 0]} visible={hovered || selected}>
        <ringGeometry args={[0.3, 0.37, 32]} />
        <meshBasicMaterial color={selected ? SELECT : HOVER} toneMapped={false} transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <mesh ref={arrow} rotation-x={Math.PI} position={[0, 1.36, 0]} visible={selected}>
        <coneGeometry args={[0.09, 0.16, 4]} />
        <meshBasicMaterial color={SELECT} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Head({ look, eyes, skinD }: { look: Look; eyes: RefObject<THREE.Group | null>; skinD: string }) {
  const hair = look.hair;
  const hairL = shade(hair, 0.25);
  const glasses = look.accessory === "glasses";
  const fz = 0.212;
  return (
    <group position={[0, 0.81, 0]}>
      <Part p={[0, 0, 0]} s={[0.46, 0.42, 0.42]} color={look.skin} />

      {/* Face */}
      <group ref={eyes} position={[0, 0.01, 0]}>
        {[0.09, -0.09].map((x) => (
          <group key={x}>
            <Part p={[x, 0, fz + (glasses ? 0.008 : 0)]} s={[0.05, 0.085, 0.012]} color={EYE} />
            <Part p={[x - 0.012, 0.022, fz + 0.008 + (glasses ? 0.008 : 0)]} s={[0.018, 0.018, 0.006]} color="#ffffff" />
          </group>
        ))}
      </group>
      {!glasses &&
        [0.09, -0.09].map((x) => <Part key={x} p={[x, 0.085, fz]} s={[0.075, 0.02, 0.01]} color={shade(hair, 0.1)} />)}
      {[0.155, -0.155].map((x) => (
        <Part key={x} p={[x, -0.055, fz]} s={[0.06, 0.03, 0.008]} color={BLUSH} />
      ))}
      <Part p={[0, -0.1, fz]} s={[0.07, 0.018, 0.01]} color={shade(look.skin, -0.38)} />
      {/* Ears */}
      {[0.235, -0.235].map((x) => (
        <Part key={x} p={[x, -0.01, 0.0]} s={[0.03, 0.08, 0.07]} color={skinD} />
      ))}

      <Hair look={look} hairL={hairL} />

      {glasses && (
        <>
          {[0.09, -0.09].map((x) => (
            <group key={x}>
              <Part p={[x, 0.01, 0.214]} s={[0.12, 0.1, 0.008]} color={LENS} />
              <Part p={[x, 0.065, 0.217]} s={[0.13, 0.016, 0.01]} color={FRAME} />
              <Part p={[x > 0 ? 0.236 : -0.236, 0.045, 0.08]} s={[0.012, 0.016, 0.26]} color={FRAME} />
            </group>
          ))}
          <Part p={[0, 0.03, 0.217]} s={[0.06, 0.016, 0.01]} color={FRAME} />
        </>
      )}
      {look.accessory === "headphones" && (
        <>
          <Part p={[0, 0.275, 0]} s={[0.5, 0.035, 0.07]} color={BAND} />
          {[0.258, -0.258].map((x) => (
            <group key={x}>
              <Part p={[x, 0.16, 0]} s={[0.03, 0.2, 0.06]} color={BAND} />
              <Part p={[x > 0 ? 0.27 : -0.27, 0.02, 0]} s={[0.07, 0.15, 0.15]} color={EARCUP} />
            </group>
          ))}
        </>
      )}
    </group>
  );
}

function Hair({ look, hairL }: { look: Look; hairL: string }) {
  const c = look.hair;
  const cap = <Part p={[0, 0.2, -0.01]} s={[0.49, 0.1, 0.45]} color={c} />;
  const shine = <Part p={[-0.06, 0.252, 0.08]} s={[0.2, 0.008, 0.1]} color={hairL} />;
  switch (look.hairStyle) {
    case "short":
      return (
        <>
          {cap}
          {shine}
          <Part p={[0, 0.04, -0.2]} s={[0.49, 0.3, 0.07]} color={c} />
          {[0.235, -0.235].map((x) => (
            <Part key={x} p={[x, 0.1, -0.08]} s={[0.03, 0.16, 0.26]} color={c} />
          ))}
          <Part p={[0.06, 0.13, 0.205]} s={[0.26, 0.05, 0.04]} color={c} />
        </>
      );
    case "bob":
      return (
        <>
          {cap}
          {shine}
          <Part p={[0, -0.02, -0.205]} s={[0.5, 0.42, 0.08]} color={c} />
          {[0.245, -0.245].map((x) => (
            <Part key={x} p={[x, -0.02, -0.03]} s={[0.05, 0.38, 0.38]} color={c} />
          ))}
          <Part p={[0.03, 0.13, 0.205]} s={[0.36, 0.06, 0.04]} color={c} />
        </>
      );
    case "long":
      return (
        <>
          {cap}
          {shine}
          <Part p={[0, -0.085, -0.22]} s={[0.5, 0.56, 0.08]} color={c} />
          {[0.245, -0.245].map((x) => (
            <Part key={x} p={[x, -0.06, -0.01]} s={[0.05, 0.44, 0.4]} color={c} />
          ))}
          <Part p={[-0.04, 0.13, 0.205]} s={[0.2, 0.06, 0.04]} color={c} />
          {[-0.1, 0.08].map((x) => (
            <Part key={x} p={[x, -0.15, -0.262]} s={[0.012, 0.3, 0.004]} color={hairL} />
          ))}
        </>
      );
    case "bun":
      return (
        <>
          {cap}
          {shine}
          <Part p={[0, 0.04, -0.2]} s={[0.49, 0.3, 0.07]} color={c} />
          <Part p={[0, 0.31, -0.1]} s={[0.17, 0.15, 0.17]} color={c} />
        </>
      );
    case "curly":
      return (
        <>
          <Part p={[0, 0.21, -0.02]} s={[0.53, 0.14, 0.49]} color={c} />
          <Part p={[0, 0.03, -0.215]} s={[0.52, 0.34, 0.09]} color={c} />
          {[0.25, -0.25].map((x) => (
            <Part key={x} p={[x, 0.08, -0.06]} s={[0.05, 0.22, 0.32]} color={c} />
          ))}
          {(
            [
              [-0.16, 0.3, 0.05],
              [0.02, 0.31, -0.06],
              [0.17, 0.29, 0.08],
              [-0.08, 0.29, -0.17],
              [0.12, 0.28, -0.17],
            ] as V3[]
          ).map((p, i) => (
            <Part key={i} p={p} s={[0.14, 0.12, 0.14]} color={i % 2 ? hairL : c} />
          ))}
        </>
      );
  }
}
