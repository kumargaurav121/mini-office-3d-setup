"use client";

import { useEffect, useState } from "react";
import { DESKS } from "@/lib/office/layout";
import { MAIN_ROOM_ID } from "@/lib/office/rooms";
import type { WorldSnapshot } from "@/lib/office/world";
import type { AgentInfo } from "@/server/agents/registry";
import { agentLabel } from "./agent-label";
import { Avatar } from "./Avatar";

const DOT: Record<AgentInfo["session"]["phase"], string> = {
  starting: "bg-sky-400",
  trust: "bg-amber-400",
  working: "bg-emerald-400",
  permission: "bg-amber-400",
  idle: "bg-violet-400",
  ended: "bg-zinc-500",
};

interface Props {
  snapshot: WorldSnapshot;
  agents: AgentInfo[];
  selectedId: string | null;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  onFocusRoom: (roomId: string) => void;
  onSpawn: (roomId: string) => void;
  onWatch: (agentId: string) => void;
  onEndAgent: (agentId: string) => void;
}

export function Roster(props: Props) {
  const { snapshot, agents, selectedId, hoveredId, onHover, onSelect, onFocusRoom, onSpawn, onWatch, onEndAgent } = props;
  return (
    <aside className="flex flex-col gap-4 border-t-2 border-line bg-panel p-4 lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:border-t-0 lg:border-l-2">
      {snapshot.rooms.map((room) => {
        const people = (snapshot.crews[room.id] ?? []).filter((emp) => agents.some((a) => a.id === emp.id));
        const count = agents.filter((a) => a.roomId === room.id).length;
        return (
          <section key={room.id} aria-label={room.name}>
            <div className="mb-2 flex items-start gap-2">
              <button
                type="button"
                onClick={() => onFocusRoom(room.id)}
                title={`Show ${room.name}`}
                className="group block min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-accent"
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
              <button
                type="button"
                disabled={count >= DESKS.length}
                onClick={() => onSpawn(room.id)}
                title={count >= DESKS.length ? "All desks are taken" : "Spawn a Claude Code agent here"}
                className="shrink-0 border-2 border-line px-1.5 font-mono text-[11px] text-[#5ee7ff] hover:border-[#5ee7ff] disabled:text-muted disabled:hover:border-line"
              >
                + agent
              </button>
            </div>
            {people.length === 0 && (
              <p className="border-2 border-dashed border-line px-2 py-3 text-center font-mono text-[11px] text-muted">
                No agents yet. Click the glowing portal in the room to spawn one.
              </p>
            )}
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {people.map((emp) => {
                const info = agents.find((a) => a.id === emp.id);
                const status = snapshot.statuses.find((s) => s.id === emp.id);
                const selected = emp.id === selectedId;
                const hovered = emp.id === hoveredId;
                return (
                  <li key={emp.id} className="relative">
                    <button
                      type="button"
                      aria-pressed={selected}
                      title={`Claude Code session ${emp.id}. Resume it later with: claude --resume ${emp.id}`}
                      onClick={() => onSelect(selected ? null : emp.id)}
                      onPointerEnter={() => onHover(emp.id)}
                      onPointerLeave={() => onHover(null)}
                      onFocus={() => onHover(emp.id)}
                      onBlur={() => onHover(null)}
                      className={`flex w-full items-center gap-3 border-2 p-2 pr-24 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
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
                        {info && (
                          <span className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-ink/85">
                            <span className={`size-2 shrink-0 ${DOT[info.session.phase]}`} aria-hidden />
                            <span className="truncate">{agentLabel(info, status)}</span>
                          </span>
                        )}
                      </span>
                    </button>
                    <div className="absolute top-2 right-2 flex gap-1">
                      <button
                        type="button"
                        onClick={() => onWatch(emp.id)}
                        className="border-2 border-line bg-bg px-1.5 font-mono text-[10px] text-ink hover:border-accent"
                      >
                        Watch
                      </button>
                      {info && info.session.phase !== "ended" && <EndButton onEnd={() => onEndAgent(emp.id)} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <p className="mt-auto pt-2 font-mono text-[11px] leading-relaxed text-muted">
        Spawn agents at a room&apos;s portal. Watch zooms into an agent&apos;s screen; answer its questions in the speech
        bubble. Hold <kbd className="text-ink">Space</kbd> and say a name to talk to an agent: &ldquo;Ada, what are you
        doing?&rdquo; <kbd className="text-ink">Esc</kbd> clears.
      </p>
    </aside>
  );
}

/** Ends a session on the second click (within a few seconds), so a stray click can't. */
function EndButton({ onEnd }: { onEnd: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      onClick={() => (armed ? onEnd() : setArmed(true))}
      title="End this Claude Code session"
      className={`border-2 px-1.5 font-mono text-[10px] ${
        armed ? "border-[#1d1a2b] bg-red-400 text-[#1d1a2b]" : "border-line bg-bg text-ink hover:border-red-400"
      }`}
    >
      {armed ? "Sure?" : "End"}
    </button>
  );
}
