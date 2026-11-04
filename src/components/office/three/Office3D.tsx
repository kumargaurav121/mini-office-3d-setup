"use client";

import { memo, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { ROOM_D, ROOM_W, roomOrigin, SLAB, WALL_H, WALL_T, type IconName } from "@/lib/office/layout";
import { bridges, MAIN_ROOM_ID, openSides, type OpenSide, type RoomRecord, type Side } from "@/lib/office/rooms";
import { isSeated, type OfficeSim } from "@/lib/office/sim";
import type { OfficeWorld, WorldRoom, WorldSnapshot } from "@/lib/office/world";
import { PixelIcon } from "../PixelIcon";
import { BRIDGE, STUB, stubAnchor, Walkway } from "./Bridges";
import { Character, SEAT_LIFT } from "./Character";
import { Furniture } from "./Furniture";
import { K, StaticBatch } from "./primitives";
import { Room } from "./Room";

const deg = THREE.MathUtils.degToRad;
// Default view: 45° around, 30° down, like the original pixel diorama.
const AZIMUTH = deg(45);
const ELEVATION = deg(30);
const VIEW_DIR = new THREE.Vector3(
  Math.sin(AZIMUTH) * Math.cos(ELEVATION),
  Math.sin(ELEVATION),
  Math.cos(AZIMUTH) * Math.cos(ELEVATION),
);

/** Which room the camera should frame; `roomId` null frames the whole office. `n` re-triggers. */
export interface Focus {
  roomId: string | null;
  n: number;
}

interface Props {
  world: OfficeWorld;
  snapshot: WorldSnapshot;
  selectedId: string | null;
  hoveredId: string | null;
  focus: Focus;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  onFocusRoom: (roomId: string | null) => void;
  onAddRoom: (side: OpenSide) => void;
}

export default function Office3D(props: Props) {
  const { world, snapshot, selectedId, hoveredId, focus, onHover, onSelect, onFocusRoom, onAddRoom } = props;
  const down = useRef({ x: 0, y: 0 });
  const overlays = useRef(new Map<string, HTMLElement>());
  const [bubbles, setBubbles] = useState<Partial<Record<string, IconName>>>({});
  const open = useMemo(() => openSides(snapshot.rooms), [snapshot.rooms]);
  const links = useMemo(() => bridges(snapshot.rooms), [snapshot.rooms]);
  const label = (id: string) => snapshot.statuses.find((s) => s.id === id)?.label;
  const nameOf = (roomId: string) => snapshot.rooms.find((r) => r.id === roomId)?.name ?? "";
  const track = (key: string) => (el: HTMLElement | null) => {
    if (el) overlays.current.set(key, el);
    else overlays.current.delete(key);
  };

  return (
    <div
      className="stage relative aspect-[4/3] w-full overflow-hidden lg:aspect-auto lg:min-h-0 lg:flex-1"
      role="img"
      aria-label={`3D office with ${snapshot.rooms.length} rooms`}
      style={{ cursor: hoveredId ? "pointer" : "grab" }}
      onPointerDown={(e) => {
        down.current = { x: e.clientX, y: e.clientY };
      }}
    >
      <Canvas
        shadows="percentage"
        flat
        orthographic
        dpr={[1, 2]}
        camera={{ position: VIEW_DIR.clone().multiplyScalar(60).toArray(), zoom: 30, near: 0.1, far: 400 }}
        onPointerMissed={(e) => {
          // Ignore the click that ends a camera drag.
          if (Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) < 5) onSelect(null);
        }}
      >
        <SimDriver world={world} />
        <Lights rooms={snapshot.rooms} />
        {world.rooms.map((room) => (
          <group key={room.record.id} position={roomPosition(room.record)}>
            <RoomStatics
              sim={room.sim}
              bridgeSides={links
                .filter((b) => b.from === room.record.id)
                .map((b) => b.side)
                .join(",")}
              stubSides={open
                .filter((s) => s.roomId === room.record.id)
                .map((s) => s.side)
                .join(",")}
            />
            {room.sim.agents.map((a) => (
              <Character
                key={a.emp.id}
                agent={a}
                hovered={a.emp.id === hoveredId}
                selected={a.emp.id === selectedId}
                onHover={onHover}
                onSelect={onSelect}
              />
            ))}
          </group>
        ))}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.12}
          rotateSpeed={0.6}
          screenSpacePanning
          minAzimuthAngle={deg(8)}
          maxAzimuthAngle={deg(82)}
          minPolarAngle={deg(38)}
          maxPolarAngle={deg(72)}
        />
        <CameraRig rooms={snapshot.rooms} focus={focus} />
        <OverlayTracker world={world} open={open} overlays={overlays} onBubbles={setBubbles} />
      </Canvas>

      {/* Name tags, room plates and + buttons: plain DOM, positioned every frame by OverlayTracker. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {snapshot.rooms.map((r) => (
          <div key={r.id} ref={track(`room:${r.id}`)} className="invisible absolute top-0 left-0">
            <button
              type="button"
              title={r.path}
              onClick={() => onFocusRoom(r.id)}
              className="pointer-events-auto -translate-x-1/2 -translate-y-full border-2 border-[#1d1a2b] bg-panel px-2 py-0.5 font-pixel text-sm whitespace-nowrap text-ink shadow-[3px_3px_0_0_rgba(0,0,0,0.35)] hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent"
            >
              {r.name}
              {r.id === MAIN_ROOM_ID && <span className="ml-1.5 font-mono text-[10px] text-accent">MAIN</span>}
            </button>
          </div>
        ))}
        {open.map((s) => (
          <div
            key={`${s.roomId}:${s.side}`}
            ref={track(`add:${s.roomId}:${s.side}`)}
            className="invisible absolute top-0 left-0"
          >
            <button
              type="button"
              aria-label={`Add a room ${s.side} of ${nameOf(s.roomId)}`}
              title={`Add a room ${s.side} of ${nameOf(s.roomId)}`}
              onClick={() => onAddRoom(s)}
              className="pointer-events-auto flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center border-2 border-[#1d1a2b] bg-accent font-pixel text-xl leading-none text-[#1d1a2b] shadow-[3px_3px_0_0_rgba(0,0,0,0.35)] transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-ink"
            >
              +
            </button>
          </div>
        ))}
        {snapshot.rooms.flatMap((r) =>
          (snapshot.crews[r.id] ?? []).map((emp) => {
            const icon = bubbles[emp.id];
            const tagged = emp.id === hoveredId || emp.id === selectedId;
            return (
              <div key={emp.id} ref={track(`agent:${emp.id}`)} className="invisible absolute top-0 left-0" aria-hidden>
                <div className="flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1">
                  {tagged && (
                    <div className="border-2 border-[#1d1a2b] bg-ink px-2 py-1 text-center whitespace-nowrap text-[#1d1a2b] shadow-[3px_3px_0_0_rgba(0,0,0,0.35)]">
                      <div className="font-pixel text-sm leading-none">{emp.name}</div>
                      <div className="mt-1 font-mono text-[10px] leading-none text-[#4b4766]">{label(emp.id)}</div>
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
          }),
        )}
      </div>

      <div className="pointer-events-none absolute right-0 bottom-0 flex items-center gap-3 p-3">
        <span className="hidden font-mono text-[11px] text-muted sm:inline">
          Drag to rotate · right-drag to pan · scroll to zoom
        </span>
        <button
          type="button"
          onClick={() => onFocusRoom(null)}
          className="pointer-events-auto border-2 border-line bg-panel px-2 py-1 font-mono text-[11px] text-ink hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent"
        >
          Show all
        </button>
      </div>
    </div>
  );
}

function roomPosition(record: RoomRecord): THREE.Vector3Tuple {
  const o = roomOrigin(record.cell);
  return [o.x, 0, o.y];
}

/** Everything in a room that doesn't move, batched; memoised so hover changes don't re-render it. */
const RoomStatics = memo(function RoomStatics({
  sim,
  bridgeSides,
  stubSides,
}: {
  sim: OfficeSim;
  /** Comma-separated sides with a bridge leaving this room (strings keep the memo comparison cheap). */
  bridgeSides: string;
  stubSides: string;
}) {
  const sides = (list: string) => (list ? (list.split(",") as Side[]) : []);
  return (
    <StaticBatch>
      <Room />
      <Furniture sim={sim} />
      {sides(bridgeSides).map((side) => (
        <Walkway key={`b-${side}`} side={side} length={BRIDGE} />
      ))}
      {sides(stubSides).map((side) => (
        <Walkway key={`s-${side}`} side={side} length={STUB} />
      ))}
    </StaticBatch>
  );
});

/** Advances every room's simulation once per frame, before anything reads it. */
function SimDriver({ world }: { world: OfficeWorld }) {
  useFrame((_, dt) => world.update(Math.min(dt, 0.1)), -1);
  return null;
}

interface Box {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

/** World-space bounds of a room, optionally including the stubs around it. */
function roomBox(record: RoomRecord, margin = 0): Box {
  const o = roomOrigin(record.cell);
  return {
    min: new THREE.Vector3(o.x - WALL_T - margin, -SLAB * K, o.y - WALL_T - margin),
    max: new THREE.Vector3(o.x + ROOM_W + margin, WALL_H * K, o.y + ROOM_D + margin),
  };
}

function officeBox(rooms: RoomRecord[]): Box {
  const box = roomBox(rooms[0], STUB);
  for (const r of rooms) {
    const b = roomBox(r, STUB);
    box.min.min(b.min);
    box.max.max(b.max);
  }
  return box;
}

function Lights({ rooms }: { rooms: RoomRecord[] }) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const box = officeBox(rooms);
  const reach = box.max.clone().sub(box.min).length() / 2 + 2;
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  useLayoutEffect(() => {
    const light = sun.current;
    if (!light) return;
    light.target.position.set(cx, 0, cz);
    light.target.updateMatrixWorld();
    light.shadow.camera.updateProjectionMatrix();
  }, [cx, cz, reach]);
  // Same sun direction as the single room, pulled back far enough to cover everything.
  const s = reach / 8;
  return (
    <>
      <hemisphereLight args={["#fff4e0", "#6b5a48", 1.1]} />
      <ambientLight intensity={0.45} />
      <directionalLight
        ref={sun}
        position={[cx + 4 * s, 13 * s, cz + 10 * s]}
        intensity={1.9}
        color="#fff1dc"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-reach}
        shadow-camera-right={reach}
        shadow-camera-top={reach}
        shadow-camera-bottom={-reach}
        shadow-camera-near={1}
        shadow-camera-far={reach * 5}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
    </>
  );
}

interface Framing {
  target: THREE.Vector3;
  position: THREE.Vector3;
  zoom: number;
}

/** Camera placement that fits `box` on screen when looking along `dir`. */
function frame(box: Box, dir: THREE.Vector3, width: number, height: number, padding = 0.92): Framing {
  const center = box.min.clone().add(box.max).multiplyScalar(0.5);
  const cam = new THREE.OrthographicCamera();
  cam.position.copy(center).addScaledVector(dir, 100);
  cam.lookAt(center);
  cam.updateMatrixWorld();
  const v = new THREE.Vector3();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        v.set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
    }
  }
  // Re-centre on the projected bounds.
  const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
  const target = center.add(right.multiplyScalar((minX + maxX) / 2)).add(up.multiplyScalar((minY + maxY) / 2));
  return {
    target,
    position: target.clone().addScaledVector(dir, 100),
    zoom: Math.min(width / (maxX - minX), height / (maxY - minY)) * padding,
  };
}

/**
 * Frames the whole office on first paint, then glides to whatever `focus`
 * asks for (a room, or everything). Grabbing the camera cancels a glide.
 */
function CameraRig({ rooms, focus }: { rooms: RoomRecord[]; focus: Focus }) {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const goal = useRef<Framing | null>(null);
  const placed = useRef(false);

  // Zoom limits: from a bit wider than the whole office down to a close-up of one room.
  useLayoutEffect(() => {
    if (!controls || width === 0 || height === 0) return;
    const all = frame(officeBox(rooms), VIEW_DIR, width, height);
    const one = frame(roomBox(rooms[0]), VIEW_DIR, width, height);
    setZoomLimits(controls, Math.min(all.zoom, one.zoom) * 0.6, one.zoom * 3);
    if (!placed.current && camera instanceof THREE.OrthographicCamera) {
      placed.current = true;
      applyFraming(camera, controls, all);
    }
  }, [camera, controls, rooms, width, height]);

  // Glide when a new focus is requested.
  const latest = useRef({ rooms, width, height });
  useLayoutEffect(() => {
    latest.current = { rooms, width, height };
  });
  useLayoutEffect(() => {
    const { rooms: list, width: w, height: h } = latest.current;
    if (!controls || w === 0 || focus.n === 0) return;
    const room = list.find((r) => r.id === focus.roomId);
    const dir = room ? camera.position.clone().sub(controls.target).normalize() : VIEW_DIR;
    goal.current = frame(room ? roomBox(room) : officeBox(list), dir, w, h, room ? 0.85 : 0.92);
  }, [camera, controls, focus]);

  useLayoutEffect(() => {
    if (!controls) return;
    const cancel = () => {
      goal.current = null;
    };
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [controls]);

  useFrame((_, dt) => {
    const g = goal.current;
    if (!g || !controls || !(camera instanceof THREE.OrthographicCamera)) return;
    if (glideToward(camera, controls, g, 1 - Math.exp(-dt * 6))) goal.current = null;
  });
  return null;
}

// Camera and controls are three.js objects we drive imperatively; these helpers
// keep those writes out of React's render/hook analysis.

function setZoomLimits(controls: OrbitControlsImpl, min: number, max: number) {
  controls.minZoom = min;
  controls.maxZoom = max;
}

/** Ease one step toward `f`; returns true (and snaps) once there. */
function glideToward(camera: THREE.OrthographicCamera, controls: OrbitControlsImpl, f: Framing, t: number) {
  camera.zoom += (f.zoom - camera.zoom) * t;
  controls.target.lerp(f.target, t);
  camera.position.lerp(f.position, t);
  camera.updateProjectionMatrix();
  controls.update();
  const arrived = Math.abs(f.zoom - camera.zoom) < f.zoom * 0.002 && controls.target.distanceTo(f.target) < 0.01;
  if (arrived) applyFraming(camera, controls, f);
  return arrived;
}

function applyFraming(camera: THREE.OrthographicCamera, controls: OrbitControlsImpl, f: Framing) {
  camera.position.copy(f.position);
  camera.zoom = f.zoom;
  camera.updateProjectionMatrix();
  controls.target.copy(f.target);
  controls.update();
}

const point = new THREE.Vector3();

/** Projects tags, room plates and + buttons to screen space each frame; reports bubble changes. */
function OverlayTracker({
  world,
  open,
  overlays,
  onBubbles,
}: {
  world: OfficeWorld;
  open: OpenSide[];
  overlays: RefObject<Map<string, HTMLElement>>;
  onBubbles: (bubbles: Partial<Record<string, IconName>>) => void;
}) {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const shown = useRef("");

  useFrame(() => {
    const place = (key: string, x: number, y: number, z: number) => {
      const el = overlays.current.get(key);
      if (!el) return;
      point.set(x, y, z).project(camera);
      const sx = ((point.x + 1) / 2) * width;
      const sy = ((1 - point.y) / 2) * height;
      el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
      el.style.visibility = "visible";
    };
    const byId = new Map<string, WorldRoom>();
    for (const room of world.rooms) {
      byId.set(room.record.id, room);
      const o = roomOrigin(room.record.cell);
      place(`room:${room.record.id}`, o.x - WALL_T, WALL_H * K + 0.35, o.y - WALL_T);
      for (const a of room.sim.agents) {
        place(`agent:${a.emp.id}`, o.x + a.pos.x, (isSeated(a) ? SEAT_LIFT : 0) + 1.5, o.y + a.pos.y);
      }
    }
    for (const s of open) {
      const room = byId.get(s.roomId);
      if (!room) continue;
      const o = roomOrigin(room.record.cell);
      const [x, y, z] = stubAnchor(s.side);
      place(`add:${s.roomId}:${s.side}`, o.x + x, y, o.y + z);
    }

    const key = world.rooms.map((r) => r.sim.agents.map((a) => a.bubble?.icon ?? "").join(",")).join("|");
    if (key !== shown.current) {
      shown.current = key;
      const next: Partial<Record<string, IconName>> = {};
      for (const room of world.rooms) for (const a of room.sim.agents) if (a.bubble) next[a.emp.id] = a.bubble.icon;
      onBubbles(next);
    }
  });
  return null;
}
