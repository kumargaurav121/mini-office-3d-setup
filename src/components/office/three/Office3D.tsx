"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { EMPLOYEES } from "@/lib/office/employees";
import { ROOM_D, ROOM_W, SLAB, WALL_H, WALL_T, type IconName } from "@/lib/office/layout";
import { isSeated, type OfficeSim } from "@/lib/office/sim";
import { PixelIcon } from "../PixelIcon";
import type { OfficeViewProps } from "../types";
import { Character, SEAT_LIFT } from "./Character";
import { Furniture } from "./Furniture";
import { K } from "./primitives";
import { Room } from "./Room";

const deg = THREE.MathUtils.degToRad;
// Default view matches the pixel version: 45° around, 30° down.
const AZIMUTH = deg(45);
const ELEVATION = deg(30);
const VIEW_DIR = new THREE.Vector3(
  Math.sin(AZIMUTH) * Math.cos(ELEVATION),
  Math.sin(ELEVATION),
  Math.cos(AZIMUTH) * Math.cos(ELEVATION),
);
const ROOM_CENTER = new THREE.Vector3(ROOM_W / 2, 1, ROOM_D / 2);
const CORNERS: THREE.Vector3[] = [];
for (const x of [-WALL_T, ROOM_W]) {
  for (const y of [-SLAB * K, WALL_H * K]) {
    for (const z of [-WALL_T, ROOM_D]) CORNERS.push(new THREE.Vector3(x, y, z));
  }
}

export default function Office3D({ sim, statuses, selectedId, hoveredId, onHover, onSelect }: OfficeViewProps) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const down = useRef({ x: 0, y: 0 });
  const overlays = useRef(new Map<string, HTMLDivElement>());
  const [bubbles, setBubbles] = useState<Partial<Record<string, IconName>>>({});

  return (
    <div
      className="stage relative aspect-[384/268] w-full overflow-hidden lg:aspect-auto lg:min-h-0 lg:flex-1"
      role="img"
      aria-label={`3D office with ${EMPLOYEES.length} employees at work`}
      style={{ cursor: hoveredId ? "pointer" : "grab" }}
      onPointerDown={(e) => {
        down.current = { x: e.clientX, y: e.clientY };
      }}
    >
      <Canvas
        shadows
        flat
        orthographic
        dpr={[1, 2]}
        camera={{ position: ROOM_CENTER.clone().addScaledVector(VIEW_DIR, 40).toArray(), zoom: 50, near: 0.1, far: 200 }}
        onPointerMissed={(e) => {
          // Ignore the click that ends a camera drag.
          if (Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) < 5) onSelect(null);
        }}
      >
        <SimDriver sim={sim} />
        <Lights />
        <Room />
        <Furniture sim={sim} />
        {sim.agents.map((a) => (
          <Character
            key={a.emp.id}
            agent={a}
            hovered={a.emp.id === hoveredId}
            selected={a.emp.id === selectedId}
            onHover={onHover}
            onSelect={onSelect}
          />
        ))}
        <OrbitControls
          ref={controls}
          makeDefault
          enablePan={false}
          enableDamping
          dampingFactor={0.12}
          rotateSpeed={0.6}
          minAzimuthAngle={deg(8)}
          maxAzimuthAngle={deg(82)}
          minPolarAngle={deg(38)}
          maxPolarAngle={deg(72)}
        />
        <CameraRig />
        <OverlayTracker sim={sim} overlays={overlays} onBubbles={setBubbles} />
      </Canvas>
      {/* Name tags and speech bubbles: plain DOM, positioned every frame by OverlayTracker. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {sim.agents.map((a) => {
          const id = a.emp.id;
          const icon = bubbles[id];
          return (
            <div
              key={id}
              ref={(el) => {
                if (el) overlays.current.set(id, el);
                else overlays.current.delete(id);
              }}
              className="invisible absolute top-0 left-0"
            >
              <div className="flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1">
                {(id === hoveredId || id === selectedId) && (
                  <div className="border-2 border-[#1d1a2b] bg-ink px-2 py-1 text-center whitespace-nowrap text-[#1d1a2b] shadow-[3px_3px_0_0_rgba(0,0,0,0.35)]">
                    <div className="font-pixel text-sm leading-none">{a.emp.name}</div>
                    <div className="mt-1 font-mono text-[10px] leading-none text-[#4b4766]">
                      {statuses.find((s) => s.id === id)?.label}
                    </div>
                  </div>
                )}
                {icon && (
                  <div className="relative border-2 border-[#1d1a2b] bg-white p-1">
                    <PixelIcon name={icon} size={21} />
                    <div className="absolute -bottom-[7px] left-1/2 size-3 -translate-x-1/2 rotate-45 border-r-2 border-b-2 border-[#1d1a2b] bg-white" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="pointer-events-none absolute right-0 bottom-0 flex items-center gap-3 p-3">
        <span className="hidden font-mono text-[11px] text-muted sm:inline">Drag to rotate · scroll to zoom</span>
        <button
          type="button"
          onClick={() => controls.current?.reset()}
          className="pointer-events-auto border-2 border-line bg-panel px-2 py-1 font-mono text-[11px] text-ink hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent"
        >
          Reset view
        </button>
      </div>
    </div>
  );
}

const headPoint = new THREE.Vector3();

/** Projects each employee's head to screen space for the DOM overlay; reports bubble changes. */
function OverlayTracker({
  sim,
  overlays,
  onBubbles,
}: {
  sim: OfficeSim;
  overlays: RefObject<Map<string, HTMLDivElement>>;
  onBubbles: (bubbles: Partial<Record<string, IconName>>) => void;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const shown = useRef("");
  useFrame(() => {
    for (const a of sim.agents) {
      const el = overlays.current.get(a.emp.id);
      if (!el) continue;
      headPoint.set(a.pos.x, (isSeated(a) ? SEAT_LIFT : 0) + 1.5, a.pos.y).project(camera);
      const x = ((headPoint.x + 1) / 2) * size.width;
      const y = ((1 - headPoint.y) / 2) * size.height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.style.visibility = "visible";
    }
    const key = sim.agents.map((a) => a.bubble?.icon ?? "").join("|");
    if (key !== shown.current) {
      shown.current = key;
      const next: Partial<Record<string, IconName>> = {};
      for (const a of sim.agents) if (a.bubble) next[a.emp.id] = a.bubble.icon;
      onBubbles(next);
    }
  });
  return null;
}

/** Advances the simulation once per frame, before anything reads it. */
function SimDriver({ sim }: { sim: OfficeSim }) {
  useFrame((_, dt) => sim.update(Math.min(dt, 0.1)), -1);
  return null;
}

function Lights() {
  const sun = useRef<THREE.DirectionalLight>(null);
  useLayoutEffect(() => {
    const light = sun.current;
    if (!light) return;
    light.target.position.set(ROOM_W / 2, 0, ROOM_D / 2);
    light.target.updateMatrixWorld();
  }, []);
  return (
    <>
      <hemisphereLight args={["#fff4e0", "#6b5a48", 1.1]} />
      <ambientLight intensity={0.45} />
      <directionalLight
        ref={sun}
        position={[ROOM_W / 2 + 4, 13, ROOM_D / 2 + 10]}
        intensity={1.9}
        color="#fff1dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-11}
        shadow-camera-right={11}
        shadow-camera-top={11}
        shadow-camera-bottom={-11}
        shadow-camera-near={1}
        shadow-camera-far={45}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
    </>
  );
}

/** Frames the whole room in the default view whenever the canvas resizes. */
function CameraRig() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  useLayoutEffect(() => {
    if (camera instanceof THREE.OrthographicCamera) frameRoom(camera, controls, size.width, size.height);
  }, [camera, controls, size.width, size.height]);
  return null;
}

function frameRoom(camera: THREE.OrthographicCamera, controls: OrbitControlsImpl | null, width: number, height: number) {
  camera.position.copy(ROOM_CENTER).addScaledVector(VIEW_DIR, 40);
  camera.up.set(0, 1, 0);
  camera.lookAt(ROOM_CENTER);
  camera.updateMatrixWorld();

  const v = new THREE.Vector3();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of CORNERS) {
    v.copy(c).applyMatrix4(camera.matrixWorldInverse);
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }
  // Re-centre on the room's projected bounds, then zoom to fit.
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const shift = right.multiplyScalar((minX + maxX) / 2).add(up.multiplyScalar((minY + maxY) / 2));
  camera.position.add(shift);
  const zoom = Math.min(width / (maxX - minX), height / (maxY - minY)) * 0.92;
  camera.zoom = zoom;
  camera.updateProjectionMatrix();

  if (controls) {
    controls.target.copy(ROOM_CENTER).add(shift);
    controls.minZoom = zoom * 0.7;
    controls.maxZoom = zoom * 4;
    controls.update();
    controls.saveState();
  }
}
