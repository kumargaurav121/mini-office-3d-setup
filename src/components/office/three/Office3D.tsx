"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { DESKS, monitorScreen, PORTAL, ROOM_D, ROOM_W, roomOrigin, WALL_H, WALL_T, type IconName } from "@/lib/office/layout";
import {
  bridges,
  canRemoveRoom,
  MAIN_ROOM_ID,
  moveTargets,
  openSides,
  SIDES,
  type Cell,
  type OpenSide,
  type RoomRecord,
  type Side,
} from "@/lib/office/rooms";
import { isSeated, type OfficeSim } from "@/lib/office/sim";
import type { OfficeWorld, WorldSnapshot } from "@/lib/office/world";
import type { AgentInfo } from "@/server/agents/registry";
import { agentLabel } from "../agent-label";
import { AgentTerminal } from "../AgentTerminal";
import { PixelIcon } from "../PixelIcon";
import { BRIDGE, STUB, stubAnchor, Walkway } from "./Bridges";
import { CameraRig, officeBox, VIEW_DIR, type Focus } from "./CameraRig";
import { Character, SEAT_LIFT } from "./Character";
import { Furniture } from "./Furniture";
import { Portal } from "./Portal";
import { TerminalScreen } from "./TerminalScreen";
import { K, StaticBatch } from "./primitives";
import { Room } from "./Room";

const deg = THREE.MathUtils.degToRad;
const PLATE =
  "border-2 border-[#1d1a2b] bg-panel px-2 py-0.5 font-mono text-[11px] whitespace-nowrap text-ink shadow-[3px_3px_0_0_rgba(0,0,0,0.35)] hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent";

interface Props {
  world: OfficeWorld;
  snapshot: WorldSnapshot;
  selectedId: string | null;
  hoveredId: string | null;
  focus: Focus;
  /** The room in focus: its walls are lowered. */
  openRoomId: string;
  /** Room being moved, if any: + buttons give way to move targets. */
  movingId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  onFocusRoom: (roomId: string | null) => void;
  onAddRoom: (side: OpenSide) => void;
  onStartMove: (roomId: string) => void;
  onMoveTo: (cell: Cell) => void;
  onCancelMove: () => void;
  onRemoveRoom: (roomId: string) => void;
  /** Live Claude Code agents, from the server. */
  agents: AgentInfo[];
  /** Agent being watched: no arrow, ring or tag on it, so they don't cover its screen. */
  watchingId: string | null;
  onSpawn: (roomId: string) => void;
  onAnswer: (agentId: string, askId: string, yes: boolean) => void;
  onWatch: (agentId: string) => void;
  onEndAgent: (agentId: string) => void;
}

export default function Office3D(props: Props) {
  const { world, snapshot, selectedId, hoveredId, focus, openRoomId, movingId } = props;
  const down = useRef({ x: 0, y: 0 });
  const overlays = useRef(new Map<string, HTMLElement>());
  const [bubbles, setBubbles] = useState<Partial<Record<string, IconName>>>({});
  const freeSides = useMemo(() => (movingId ? [] : openSides(snapshot.rooms)), [snapshot.rooms, movingId]);
  const links = useMemo(() => bridges(snapshot.rooms), [snapshot.rooms]);
  const targets = useMemo(() => (movingId ? moveTargets(snapshot.rooms, movingId) : []), [snapshot.rooms, movingId]);
  const moving = snapshot.rooms.find((r) => r.id === movingId);
  const [portalHover, setPortalHover] = useState(false);
  const infoOf = (id: string) => props.agents.find((a) => a.id === id);
  const label = (id: string) => agentLabel(infoOf(id), snapshot.statuses.find((s) => s.id === id));
  const roomFull = (roomId: string) => props.agents.filter((a) => a.roomId === roomId).length >= DESKS.length;
  const watched = props.agents.filter((a) => a.roomId === openRoomId);
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
      style={{ cursor: hoveredId || portalHover ? "pointer" : "grab" }}
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
          if (Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) < 5) props.onSelect(null);
        }}
      >
        <SimDriver world={world} />
        <Lights rooms={snapshot.rooms} />
        {world.rooms.map((room) => (
          <group key={room.record.id} position={roomPosition(room.record)}>
            <RoomStatics
              sim={room.sim}
              open={room.record.id === openRoomId}
              bridgeSides={sideKey(links.filter((b) => b.from === room.record.id).map((b) => b.side))}
              stubSides={sideKey(freeSides.filter((s) => s.roomId === room.record.id).map((s) => s.side))}
            />
            <Portal full={roomFull(room.record.id)} onOpen={() => props.onSpawn(room.record.id)} onHover={setPortalHover} />
            {room.record.id === openRoomId &&
              watched.map((a) => <TerminalScreen key={a.id} agentId={a.id} desk={DESKS[a.deskIndex]} />)}
            {room.sim.agents.map((a) => (
              <Character
                key={a.emp.id}
                agent={a}
                hovered={a.emp.id === hoveredId && a.emp.id !== props.watchingId}
                selected={a.emp.id === selectedId && a.emp.id !== props.watchingId}
                onHover={props.onHover}
                onSelect={props.onSelect}
              />
            ))}
          </group>
        ))}
        {targets.map((cell) => (
          <MoveGhost key={`${cell.x},${cell.z}`} cell={cell} />
        ))}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.12}
          rotateSpeed={0.6}
          screenSpacePanning
          minPolarAngle={deg(30)}
          maxPolarAngle={deg(72)}
        />
        <CameraRig rooms={snapshot.rooms} focus={focus} />
        <OverlayTracker
          world={world}
          agents={watched}
          openRoomId={openRoomId}
          freeSides={freeSides}
          targets={targets}
          overlays={overlays}
          onBubbles={setBubbles}
        />
      </Canvas>

      {/* Plates, + buttons, move targets and tags: plain DOM, positioned every frame by OverlayTracker. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {snapshot.rooms.map((r) => (
          <div key={r.id} ref={track(`room:${r.id}`)} className="invisible absolute top-0 left-0 will-change-transform">
            <div className="pointer-events-auto flex -translate-x-1/2 -translate-y-full items-center gap-1">
              <button type="button" title={r.path} onClick={() => props.onFocusRoom(r.id)} className={`${PLATE} font-pixel text-sm`}>
                {r.name}
                {r.id === MAIN_ROOM_ID && <span className="ml-1.5 font-mono text-[10px] text-accent">MAIN</span>}
              </button>
              {r.id === openRoomId && r.id !== MAIN_ROOM_ID && !movingId && (
                <RoomActions
                  // Re-keyed per room so a half-finished "Remove room?" never carries over.
                  key={r.id}
                  canMove={moveTargets(snapshot.rooms, r.id).length > 0}
                  canRemove={canRemoveRoom(snapshot.rooms, r.id)}
                  onMove={() => props.onStartMove(r.id)}
                  onRemove={() => props.onRemoveRoom(r.id)}
                />
              )}
            </div>
          </div>
        ))}
        {snapshot.rooms
          .filter((r) => r.id === openRoomId)
          .map((r) => (
            <div key={`portal:${r.id}`} ref={track(`portal:${r.id}`)} className="invisible absolute top-0 left-0 will-change-transform">
              <button
                type="button"
                disabled={roomFull(r.id)}
                onClick={() => props.onSpawn(r.id)}
                className="pointer-events-auto -translate-x-1/2 -translate-y-full border-2 border-[#1d1a2b] bg-[#5ee7ff] px-2 py-1 font-pixel text-sm whitespace-nowrap text-[#1d1a2b] shadow-[3px_3px_0_0_rgba(0,0,0,0.35)] hover:brightness-110 disabled:bg-panel disabled:text-muted"
              >
                {roomFull(r.id) ? "Desks full" : "+ Spawn agent"}
              </button>
            </div>
          ))}
        {/*
          Input terminals: invisible, laid exactly over the open room's monitors by
          OverlayTracker, so clicks, typing and scrolling reach them. What you see is
          the TerminalScreen texture in the 3D scene, which objects in front can hide.
        */}
        {watched.map((a) => (
          <div
            key={`term:${a.id}`}
            ref={track(`term:${a.id}`)}
            className="pointer-events-auto invisible absolute top-0 left-0 origin-top-left opacity-0"
            aria-label={`${a.name}'s terminal`}
          >
            <AgentTerminal agentId={a.id} />
          </div>
        ))}
        {freeSides.map((s) => (
          <div
            key={`${s.roomId}:${s.side}`}
            ref={track(`add:${s.roomId}:${s.side}`)}
            className="invisible absolute top-0 left-0 will-change-transform"
          >
            <button
              type="button"
              aria-label={`Add a room ${s.side} of ${nameOf(s.roomId)}`}
              title={`Add a room ${s.side} of ${nameOf(s.roomId)}`}
              onClick={() => props.onAddRoom(s)}
              className="pointer-events-auto flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center border-2 border-[#1d1a2b] bg-accent font-pixel text-xl leading-none text-[#1d1a2b] shadow-[3px_3px_0_0_rgba(0,0,0,0.35)] transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-ink"
            >
              +
            </button>
          </div>
        ))}
        {targets.map((cell) => (
          <div
            key={`${cell.x},${cell.z}`}
            ref={track(`move:${cell.x},${cell.z}`)}
            className="invisible absolute top-0 left-0 will-change-transform"
          >
            <button
              type="button"
              onClick={() => props.onMoveTo(cell)}
              className="pointer-events-auto -translate-x-1/2 -translate-y-1/2 border-2 border-[#1d1a2b] bg-accent px-3 py-1.5 font-pixel text-sm text-[#1d1a2b] shadow-[3px_3px_0_0_rgba(0,0,0,0.35)] hover:scale-105 focus-visible:outline-2 focus-visible:outline-ink"
            >
              Move here
            </button>
          </div>
        ))}
        {snapshot.rooms.flatMap((r) =>
          (snapshot.crews[r.id] ?? []).map((emp) => {
            const icon = bubbles[emp.id];
            const selected = emp.id === selectedId;
            const tagged = (emp.id === hoveredId || selected) && emp.id !== props.watchingId;
            const info = infoOf(emp.id);
            const ask = info?.session.ask;
            return (
              <div
                key={emp.id}
                ref={track(`agent:${emp.id}`)}
                className="invisible absolute top-0 left-0 will-change-transform"
              >
                <div className="flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1">
                  {ask && (
                    <div className="pointer-events-auto relative max-w-72 border-2 border-[#1d1a2b] bg-white px-2.5 py-2 text-[#1d1a2b] shadow-[3px_3px_0_0_rgba(0,0,0,0.35)]">
                      <div className="font-pixel text-sm leading-tight">{ask.title}</div>
                      {ask.detail && <div className="mt-1 font-mono text-[10px] leading-snug text-[#4b4766]">{ask.detail}</div>}
                      <div className="mt-2 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => props.onAnswer(emp.id, ask.id, true)}
                          className="border-2 border-[#1d1a2b] bg-emerald-300 px-2 py-0.5 font-mono text-[11px] hover:bg-emerald-200"
                        >
                          {ask.kind === "trust" ? "Trust" : "Allow"}
                        </button>
                        <button
                          type="button"
                          onClick={() => props.onAnswer(emp.id, ask.id, false)}
                          className="border-2 border-[#1d1a2b] bg-red-300 px-2 py-0.5 font-mono text-[11px] hover:bg-red-200"
                        >
                          {ask.kind === "trust" ? "Exit" : "Deny"}
                        </button>
                      </div>
                      <div className="absolute -bottom-[7px] left-1/2 size-3 -translate-x-1/2 rotate-45 border-r-2 border-b-2 border-[#1d1a2b] bg-white" />
                    </div>
                  )}
                  {tagged && !ask && (
                    <div className="border-2 border-[#1d1a2b] bg-ink px-2 py-1 text-center whitespace-nowrap text-[#1d1a2b] shadow-[3px_3px_0_0_rgba(0,0,0,0.35)]">
                      <div className="font-pixel text-sm leading-none">{emp.name}</div>
                      <div className="mt-1 max-w-64 truncate font-mono text-[10px] leading-none text-[#4b4766]">{label(emp.id)}</div>
                      {selected && info && info.session.phase !== "ended" && (
                        <div className="pointer-events-auto mt-1.5 flex justify-center gap-1">
                          <button type="button" onClick={() => props.onWatch(emp.id)} className="border-2 border-[#1d1a2b] bg-accent px-1.5 font-mono text-[10px]">
                            Watch
                          </button>
                          <button type="button" onClick={() => props.onEndAgent(emp.id)} className="border-2 border-[#1d1a2b] bg-red-300 px-1.5 font-mono text-[10px]">
                            End
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {icon && !ask && (
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

      {moving && (
        <div className="absolute inset-x-0 top-0 flex justify-center p-3">
          <div className="flex items-center gap-3 border-2 border-[#1d1a2b] bg-accent px-3 py-1.5 font-mono text-xs text-[#1d1a2b] shadow-[3px_3px_0_0_rgba(0,0,0,0.35)]">
            <span>
              {targets.length > 0
                ? `Moving ${moving.name}: pick a glowing spot`
                : `${moving.name} can't move without cutting another room off`}
            </span>
            <button type="button" onClick={props.onCancelMove} className="border-2 border-[#1d1a2b] bg-ink px-2 py-0.5">
              Cancel (Esc)
            </button>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute right-0 bottom-0 flex items-center gap-3 p-3">
        <span className="hidden font-mono text-[11px] text-muted sm:inline">
          Drag to rotate · right-drag to pan · scroll to zoom
        </span>
        <button
          type="button"
          onClick={() => props.onFocusRoom(null)}
          className="pointer-events-auto border-2 border-line bg-panel px-2 py-1 font-mono text-[11px] text-ink hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent"
        >
          Show all
        </button>
      </div>
    </div>
  );
}

const BLOCKED = "Other rooms connect to the main room through this one";

/** Move / Remove for the room in focus; Remove asks first, and Esc backs out. */
function RoomActions(p: { canMove: boolean; canRemove: boolean; onMove: () => void; onRemove: () => void }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inTerminal = e.target instanceof Element && e.target.closest(".xterm") !== null;
      if (e.key === "Escape" && !inTerminal) setConfirming(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (confirming) {
    return (
      <>
        <span className={`${PLATE} hover:bg-panel`}>Remove room?</span>
        <button type="button" onClick={p.onRemove} className={`${PLATE} bg-red-500/80 hover:bg-red-500`}>
          Yes
        </button>
        <button type="button" onClick={() => setConfirming(false)} className={PLATE}>
          No
        </button>
      </>
    );
  }
  return (
    <>
      <button type="button" disabled={!p.canMove} title={p.canMove ? undefined : BLOCKED} onClick={p.onMove} className={`${PLATE} disabled:opacity-50`}>
        Move
      </button>
      <button
        type="button"
        disabled={!p.canRemove}
        title={p.canRemove ? "Remove this room (the folder on disk is untouched)" : BLOCKED}
        onClick={() => setConfirming(true)}
        className={`${PLATE} disabled:opacity-50`}
      >
        Remove
      </button>
    </>
  );
}

function roomPosition(record: RoomRecord): THREE.Vector3Tuple {
  const o = roomOrigin(record.cell);
  return [o.x, 0, o.y];
}

/** Sides as a string, so the memoised room only re-renders when they actually change. */
const sideKey = (sides: Side[]) => sides.join(",");
const parseSides = (key: string) => SIDES.filter((s) => key.split(",").includes(s));

/** Everything in a room that doesn't move, batched; memoised so hover changes don't re-render it. */
const RoomStatics = memo(function RoomStatics({
  sim,
  open,
  bridgeSides,
  stubSides,
}: {
  sim: OfficeSim;
  open: boolean;
  bridgeSides: string;
  stubSides: string;
}) {
  return (
    <StaticBatch>
      <Room open={open} />
      <Furniture sim={sim} />
      {parseSides(bridgeSides).map((side) => (
        <Walkway key={`b-${side}`} side={side} length={BRIDGE} />
      ))}
      {parseSides(stubSides).map((side) => (
        <Walkway key={`s-${side}`} side={side} length={STUB} />
      ))}
    </StaticBatch>
  );
});

const ghostMaterial = new THREE.MeshBasicMaterial({
  color: "#ffd166",
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
  toneMapped: false,
});

/** Glowing footprint where a room being moved could go. */
function MoveGhost({ cell }: { cell: Cell }) {
  const o = roomOrigin(cell);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.y = 1 + Math.sin(clock.elapsedTime * 4) * 0.5;
  });
  return (
    <mesh ref={ref} position={[o.x + ROOM_W / 2, 0.02, o.y + ROOM_D / 2]} material={ghostMaterial}>
      <boxGeometry args={[ROOM_W, 0.04, ROOM_D]} />
    </mesh>
  );
}

/** Advances every room's simulation once per frame, before anything reads it. */
function SimDriver({ world }: { world: OfficeWorld }) {
  useFrame((_, dt) => world.update(Math.min(dt, 0.1)), -1);
  return null;
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
  // Same sun direction as a single room, pulled back far enough to cover everything.
  const pullBack = reach / 8;
  return (
    <>
      <hemisphereLight args={["#fff4e0", "#6b5a48", 1.1]} />
      <ambientLight intensity={0.45} />
      <directionalLight
        ref={sun}
        position={[cx + 4 * pullBack, 13 * pullBack, cz + 10 * pullBack]}
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

const point = new THREE.Vector3();
const look = new THREE.Vector3();

/** Projects plates, + buttons, move targets and tags to screen space each frame; reports bubble changes. */
function OverlayTracker({
  world,
  agents,
  openRoomId,
  freeSides,
  targets,
  overlays,
  onBubbles,
}: {
  world: OfficeWorld;
  /** Agents in the open room, whose terminals sit on their monitors. */
  agents: AgentInfo[];
  openRoomId: string;
  freeSides: OpenSide[];
  targets: Cell[];
  overlays: RefObject<Map<string, HTMLElement>>;
  onBubbles: (bubbles: Partial<Record<string, IconName>>) => void;
}) {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const shown = useRef("");

  useFrame(() => {
    // The controls moved the camera earlier this frame, but its matrices only refresh at
    // render time; update them now so overlays don't trail a frame behind (seen as jitter).
    camera.updateMatrixWorld();
    const toScreen = (x: number, y: number, z: number) => {
      point.set(x, y, z).project(camera);
      return { x: ((point.x + 1) / 2) * width, y: ((1 - point.y) / 2) * height };
    };
    // Stretch a terminal over its desk's monitor. The camera is orthographic, so the
    // screen's outline is a parallelogram and a 2D affine transform maps it exactly.
    const mapTerminal = (el: HTMLElement | undefined, o: { x: number; y: number }, deskIndex: number) => {
      if (!el) return;
      const s = monitorScreen(DESKS[deskIndex]);
      const cx = o.x + s.x;
      const cz = o.y + s.y;
      const top = (s.z + s.height / 2) * K;
      const bottom = (s.z - s.height / 2) * K;
      // Viewer's left/right depend on which way the screen faces.
      const left = cx - (s.facing * s.width) / 2;
      const right = cx + (s.facing * s.width) / 2;
      camera.getWorldDirection(look);
      // Only when the screen faces us enough to read (and type into) without heavy skew.
      const facingUs = -look.z * s.facing > 0.45;
      const tl = toScreen(left, top, cz);
      const tr = toScreen(right, top, cz);
      const bl = toScreen(left, bottom, cz);
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const visible = facingUs && w > 0 && Math.hypot(tr.x - tl.x, tr.y - tl.y) > 60;
      el.style.visibility = visible ? "visible" : "hidden";
      if (!visible) return;
      const m = [(tr.x - tl.x) / w, (tr.y - tl.y) / w, (bl.x - tl.x) / h, (bl.y - tl.y) / h, tl.x, tl.y];
      el.style.transform = `matrix(${m.map((v) => v.toFixed(5)).join(",")})`;
    };
    const place = (key: string, x: number, y: number, z: number) => {
      const el = overlays.current.get(key);
      if (!el) return;
      point.set(x, y, z).project(camera);
      const sx = ((point.x + 1) / 2) * width;
      const sy = ((1 - point.y) / 2) * height;
      el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
      el.style.visibility = "visible";
    };
    for (const room of world.rooms) {
      const o = roomOrigin(room.record.cell);
      // An open room has no walls to sit on, so its plate comes down to the floor.
      const plateHeight = room.record.id === openRoomId ? 0.5 : WALL_H * K + 0.35;
      place(`room:${room.record.id}`, o.x - WALL_T, plateHeight, o.y - WALL_T);
      for (const a of room.sim.agents) {
        place(`agent:${a.emp.id}`, o.x + a.pos.x, (isSeated(a) ? SEAT_LIFT : 0) + 1.5, o.y + a.pos.y);
      }
    }
    const byId = new Map(world.rooms.map((r) => [r.record.id, r.record]));
    const open = byId.get(openRoomId);
    if (open) {
      const o = roomOrigin(open.cell);
      place(`portal:${openRoomId}`, o.x + PORTAL.x, 1.1, o.y + PORTAL.y);
      for (const a of agents) mapTerminal(overlays.current.get(`term:${a.id}`), o, a.deskIndex);
    }
    for (const s of freeSides) {
      const record = byId.get(s.roomId);
      if (!record) continue;
      const o = roomOrigin(record.cell);
      const [x, y, z] = stubAnchor(s.side);
      place(`add:${s.roomId}:${s.side}`, o.x + x, y, o.y + z);
    }
    for (const cell of targets) {
      const o = roomOrigin(cell);
      place(`move:${cell.x},${cell.z}`, o.x + ROOM_W / 2, 0.3, o.y + ROOM_D / 2);
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
