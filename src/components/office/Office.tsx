"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { answerAsk, endAgent } from "@/app/agent-actions";
import { addRoom, moveRoom, removeRoom, type ActionResult } from "@/app/office-actions";
import { MAIN_ROOM_ID, type Cell, type OpenSide, type RoomRecord } from "@/lib/office/rooms";
import { OfficeWorld } from "@/lib/office/world";
import type { AgentInfo } from "@/server/agents/registry";
import { RepoPicker } from "./RepoPicker";
import { Roster } from "./Roster";
import { SpawnDialog } from "./SpawnDialog";
import type { Focus } from "./three/CameraRig";

// three.js only loads in the browser, in its own chunk.
const Office3D = dynamic(() => import("./three/Office3D"), { ssr: false, loading: () => <StageLoading /> });

export function Office({ initialRooms }: { initialRooms: RoomRecord[] }) {
  const [world] = useState(() => new OfficeWorld(initialRooms));
  const snapshot = useSyncExternalStore(world.subscribe, world.getSnapshot, world.getSnapshot);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus>({ roomId: null, request: 0 });
  const [openRoomId, setOpenRoomId] = useState(MAIN_ROOM_ID);
  const [adding, setAdding] = useState<OpenSide | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [spawnRoomId, setSpawnRoomId] = useState<string | null>(null);
  /** Agent whose monitor we're watching: its arrow and tag get out of the way. */
  const [watchingId, setWatchingId] = useState<string | null>(null);

  // Live agent list from the server; it survives reloads because the agents run there.
  useEffect(() => {
    const stream = new EventSource("/api/agents");
    stream.onmessage = (e) => setAgents(JSON.parse(e.data) as AgentInfo[]);
    return () => stream.close();
  }, []);

  useEffect(() => {
    world.syncAgents(agents.map((a) => ({ ...a, phase: a.session.phase })));
  }, [world, agents]);

  const roomOfAgent = (id: string) => agents.find((a) => a.id === id)?.roomId;

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => world.setCalm(reduce.matches);
    apply();
    reduce.addEventListener("change", apply);
    return () => reduce.removeEventListener("change", apply);
  }, [world]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || inTerminal(e)) return;
      setWatchingId(null);
      setMovingId(null);
      setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  /** Fly to a room and open it (lower its walls); null flies out to the whole office. */
  const focusRoom = (roomId: string | null) => {
    setWatchingId(null);
    setFocus((f) => ({ roomId, request: f.request + 1 }));
    if (roomId) setOpenRoomId(roomId);
  };

  /** Apply a room-list change from the server, or show why it failed. */
  const applyRooms = (res: ActionResult<RoomRecord[]>): RoomRecord[] | null => {
    if (!res.ok) {
      setNotice(res.error);
      return null;
    }
    world.syncRooms(res.value);
    return res.value;
  };

  const moveTo = async (cell: Cell) => {
    const id = movingId;
    if (!id) return;
    setMovingId(null);
    if (applyRooms(await moveRoom(id, cell))) focusRoom(id);
  };

  const remove = async (id: string) => {
    if (!applyRooms(await removeRoom(id))) return;
    if (selectedId && roomOfAgent(selectedId) === id) setSelectedId(null);
    if (openRoomId === id) focusRoom(MAIN_ROOM_ID);
  };

  const selectInScene = (id: string | null) => {
    if (id !== watchingId) setWatchingId(null);
    setSelectedId(id);
    const room = id && roomOfAgent(id);
    if (room) setOpenRoomId(room);
  };

  const selectFromRoster = (id: string | null) => {
    if (id !== watchingId) setWatchingId(null);
    setSelectedId(id);
    const room = id && roomOfAgent(id);
    if (room) focusRoom(room);
  };

  /** Fly up to an agent's monitor to read its terminal. */
  const watch = (id: string) => {
    const agent = agents.find((a) => a.id === id);
    if (!agent) return;
    setSelectedId(id);
    setWatchingId(id);
    setOpenRoomId(agent.roomId);
    setFocus((f) => ({ roomId: agent.roomId, deskIndex: agent.deskIndex, request: f.request + 1 }));
  };

  const pickFolder = async (path: string): Promise<string | null> => {
    if (!adding) return null;
    const res = await addRoom(path, adding.cell);
    if (!res.ok) return res.error;
    world.syncRooms(res.value);
    const added = res.value.find((r) => r.cell.x === adding.cell.x && r.cell.z === adding.cell.z);
    setAdding(null);
    if (added) focusRoom(added.id);
    return null;
  };

  const working = agents.filter((a) => a.session.phase === "working").length;
  const waiting = agents.filter((a) => a.session.ask).length;
  const spawnRoom = snapshot.rooms.find((r) => r.id === spawnRoomId);
  const anchorRoom = adding ? snapshot.rooms.find((r) => r.id === adding.roomId) : undefined;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-line bg-panel px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <h1 className="font-pixel text-xl leading-none">Mini Office</h1>
            <p className="mt-1 font-mono text-[11px] text-muted">
              {snapshot.rooms.length} {snapshot.rooms.length === 1 ? "room" : "rooms"} · {agents.length}{" "}
              {agents.length === 1 ? "agent" : "agents"}
            </p>
          </div>
        </div>
        <div className="flex gap-2 font-mono text-[11px]" aria-live="polite">
          <Chip dot="bg-emerald-400">{working} working</Chip>
          <Chip dot="bg-amber-400">{waiting} waiting for you</Chip>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <Office3D
          world={world}
          snapshot={snapshot}
          selectedId={selectedId}
          hoveredId={hoveredId}
          focus={focus}
          openRoomId={openRoomId}
          movingId={movingId}
          onHover={setHoveredId}
          onSelect={selectInScene}
          onFocusRoom={focusRoom}
          onAddRoom={setAdding}
          onStartMove={setMovingId}
          onMoveTo={moveTo}
          onCancelMove={() => setMovingId(null)}
          onRemoveRoom={remove}
          agents={agents}
          watchingId={watchingId}
          onSpawn={setSpawnRoomId}
          onAnswer={(agentId, askId, yes) => void answerAsk(agentId, askId, yes)}
          onWatch={watch}
          onEndAgent={(id) => void endAgent(id)}
        />
        <Roster
          snapshot={snapshot}
          agents={agents}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onHover={setHoveredId}
          onSelect={selectFromRoster}
          onFocusRoom={focusRoom}
          onSpawn={setSpawnRoomId}
          onWatch={watch}
          onEndAgent={(id) => void endAgent(id)}
        />
      </main>
      {notice && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 border-2 border-[#1d1a2b] bg-red-400 px-3 py-2 font-mono text-xs text-[#1d1a2b] shadow-[3px_3px_0_0_rgba(0,0,0,0.4)]"
        >
          {notice}
        </div>
      )}
      {spawnRoom && (
        <SpawnDialog
          key={spawnRoom.id}
          roomId={spawnRoom.id}
          roomName={spawnRoom.name}
          existing={agents.map((a) => a.name)}
          onClose={() => setSpawnRoomId(null)}
        />
      )}
      {adding && anchorRoom && (
        <RepoPicker
          key={`${adding.roomId}:${adding.side}`}
          side={adding.side}
          roomName={anchorRoom.name}
          usedPaths={new Set(snapshot.rooms.map((r) => r.path))}
          onPick={pickFolder}
          onClose={() => setAdding(null)}
        />
      )}
    </div>
  );
}

/** True for key events typed into an agent terminal (xterm.js). */
const inTerminal = (e: KeyboardEvent) => e.target instanceof Element && e.target.closest(".xterm") !== null;

function StageLoading() {
  return (
    <div className="stage flex aspect-[4/3] w-full items-center justify-center lg:aspect-auto lg:min-h-0 lg:flex-1">
      <span className="animate-pulse font-pixel text-muted">Building the office…</span>
    </div>
  );
}

function Chip({ dot, children }: { dot: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 border-2 border-line bg-bg px-2 py-1">
      <span className={`size-2 ${dot}`} aria-hidden />
      {children}
    </span>
  );
}

function LogoMark() {
  // 8x8 pixel building
  const px = [
    "..####..",
    ".#....#.",
    "#.#..#.#",
    "#......#",
    "#.#..#.#",
    "#......#",
    "#..##..#",
    "########",
  ];
  return (
    <svg viewBox="0 0 8 8" className="size-8" shapeRendering="crispEdges" aria-hidden>
      <rect width="8" height="8" fill="var(--panel-raised)" />
      {px.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="var(--accent)" /> : null,
        ),
      )}
    </svg>
  );
}
