"use client";

import type { Activity } from "@/lib/office/layout";
import { MAIN_ROOM_ID } from "@/lib/office/rooms";
import type { WorldSnapshot } from "@/lib/office/world";
import { Avatar } from "./Avatar";

const DOT: Record<Activity, string> = {
  working: "bg-emerald-400",
  walking: "bg-sky-400",
  coffee: "bg-amber-400",
  water: "bg-amber-400",
  window: "bg-amber-400",
  couch: "bg-amber-400",
  books: "bg-violet-400",
  whiteboard: "bg-violet-400",
};

interface Props {
  snapshot: WorldSnapshot;
  selectedId: string | null;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  onFocusRoom: (roomId: string) => void;
}

export function Roster({ snapshot, selectedId, hoveredId, onHover, onSelect, onFocusRoom }: Props) {
  const statusOf = (id: string) => snapshot.statuses.find((s) => s.id === id);
  return (
    <aside className="flex flex-col gap-4 border-t-2 border-line bg-panel p-4 lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:border-t-0 lg:border-l-2">
      {snapshot.rooms.map((room) => (
        <section key={room.id} aria-label={room.name}>
          <button
            type="button"
            onClick={() => onFocusRoom(room.id)}
            title={`Show ${room.name}`}
            className="group mb-2 block w-full text-left focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="flex items-baseline gap-2">
              <span className="font-pixel text-xs tracking-[0.2em] text-muted uppercase group-hover:text-ink">
                {room.name}
              </span>
              {room.id === MAIN_ROOM_ID && <span className="font-mono text-[10px] text-accent">MAIN</span>}
            </span>
            <span className="block truncate font-mono text-[10px] text-muted/70" title={room.path}>
              {room.path}
            </span>
          </button>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {(snapshot.crews[room.id] ?? []).map((emp) => {
              const status = statusOf(emp.id);
              const selected = emp.id === selectedId;
              const hovered = emp.id === hoveredId;
              return (
                <li key={emp.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelect(selected ? null : emp.id)}
                    onPointerEnter={() => onHover(emp.id)}
                    onPointerLeave={() => onHover(null)}
                    onFocus={() => onHover(emp.id)}
                    onBlur={() => onHover(null)}
                    className={`flex w-full items-center gap-3 border-2 p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      selected
                        ? "border-accent bg-raised shadow-[3px_3px_0_0_var(--accent)]"
                        : hovered
                          ? "border-ink/60 bg-raised"
                          : "border-line bg-bg/40 hover:bg-raised"
                    }`}
                  >
                    <Avatar look={emp.look} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-pixel text-base leading-tight">{emp.name}</span>
                      <span className="block truncate text-xs text-muted">{emp.role}</span>
                      {status && (
                        <span className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-ink/85">
                          <span className={`size-2 shrink-0 ${DOT[status.activity]}`} aria-hidden />
                          <span className="truncate">{status.label}</span>
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="mt-auto pt-2 font-mono text-[11px] leading-relaxed text-muted">
        Click someone to follow them, a room name to fly there, or a <span className="text-accent">+</span> to add a
        room. <kbd className="text-ink">Esc</kbd> clears.
      </p>
    </aside>
  );
}
