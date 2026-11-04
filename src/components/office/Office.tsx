"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { addRoom } from "@/app/office-actions";
import { roomIdOfAgent } from "@/lib/office/crew";
import type { OpenSide, RoomRecord } from "@/lib/office/rooms";
import { OfficeWorld } from "@/lib/office/world";
import { RepoPicker } from "./RepoPicker";
import { Roster } from "./Roster";
import type { Focus } from "./three/Office3D";

// three.js only loads in the browser, in its own chunk.
const Office3D = dynamic(() => import("./three/Office3D"), { ssr: false, loading: () => <StageLoading /> });

export function Office({ initialRooms }: { initialRooms: RoomRecord[] }) {
  const [world] = useState(() => new OfficeWorld(initialRooms));
  const snapshot = useSyncExternalStore(world.subscribe, world.getSnapshot, world.getSnapshot);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus>({ roomId: null, n: 0 });
  const [adding, setAdding] = useState<OpenSide | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => world.setCalm(reduce.matches);
    apply();
    reduce.addEventListener("change", apply);
    return () => reduce.removeEventListener("change", apply);
  }, [world]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const focusRoom = (roomId: string | null) => setFocus((f) => ({ roomId, n: f.n + 1 }));

  const selectFromRoster = (id: string | null) => {
    setSelectedId(id);
    if (id) focusRoom(roomIdOfAgent(id));
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

  const working = snapshot.statuses.filter((s) => s.activity === "working").length;
  const anchorRoom = adding ? snapshot.rooms.find((r) => r.id === adding.roomId) : undefined;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-line bg-panel px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <h1 className="font-pixel text-xl leading-none">Mini Office</h1>
            <p className="mt-1 font-mono text-[11px] text-muted">
              {snapshot.rooms.length} {snapshot.rooms.length === 1 ? "room" : "rooms"} · {snapshot.statuses.length} agents
            </p>
          </div>
        </div>
        <div className="flex gap-2 font-mono text-[11px]" aria-live="polite">
          <Chip dot="bg-emerald-400">{working} working</Chip>
          <Chip dot="bg-amber-400">{snapshot.statuses.length - working} away from desk</Chip>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <Office3D
          world={world}
          snapshot={snapshot}
          selectedId={selectedId}
          hoveredId={hoveredId}
          focus={focus}
          onHover={setHoveredId}
          onSelect={setSelectedId}
          onFocusRoom={focusRoom}
          onAddRoom={setAdding}
        />
        <Roster
          snapshot={snapshot}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onHover={setHoveredId}
          onSelect={selectFromRoster}
          onFocusRoom={focusRoom}
        />
      </main>
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
