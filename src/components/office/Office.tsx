"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { EMPLOYEES } from "@/lib/office/employees";
import { OfficeSim } from "@/lib/office/sim";
import { OfficeCanvas } from "./OfficeCanvas";
import { Roster } from "./Roster";

// three.js only loads in the browser, in its own chunk.
const Office3D = dynamic(() => import("./three/Office3D"), { ssr: false, loading: () => <StageLoading /> });

type View = "3d" | "pixel";

export function Office() {
  const [sim] = useState(() => new OfficeSim(EMPLOYEES));
  const statuses = useSyncExternalStore(sim.subscribe, sim.getSnapshot, sim.getSnapshot);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [view, setView] = useState<View>("3d");

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => sim.setCalm(reduce.matches);
    apply();
    reduce.addEventListener("change", apply);
    return () => reduce.removeEventListener("change", apply);
  }, [sim]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const working = statuses.filter((s) => s.activity === "working").length;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-line bg-panel px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <h1 className="font-pixel text-xl leading-none">Mini Office</h1>
            <p className="mt-1 font-mono text-[11px] text-muted">
              Floor 1 · {EMPLOYEES.length} employees
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <div className="flex gap-2" aria-live="polite">
            <Chip dot="bg-emerald-400">{working} working</Chip>
            <Chip dot="bg-amber-400">{statuses.length - working} away from desk</Chip>
          </div>
          <div role="group" aria-label="View" className="flex border-2 border-line bg-bg">
            {(["3d", "pixel"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`px-2.5 py-1 focus-visible:outline-2 focus-visible:outline-accent ${
                  view === v ? "bg-accent text-[#1d1a2b]" : "text-muted hover:text-ink"
                }`}
              >
                {v === "3d" ? "3D" : "Pixel"}
              </button>
            ))}
          </div>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {view === "3d" ? (
          <Office3D
            sim={sim}
            statuses={statuses}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            onSelect={setSelectedId}
          />
        ) : (
          <OfficeCanvas
            sim={sim}
            statuses={statuses}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            onSelect={setSelectedId}
          />
        )}
        <Roster
          statuses={statuses}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onHover={setHoveredId}
          onSelect={setSelectedId}
        />
      </main>
    </div>
  );
}

function StageLoading() {
  return (
    <div className="stage flex aspect-[384/268] w-full items-center justify-center lg:aspect-auto lg:min-h-0 lg:flex-1">
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
