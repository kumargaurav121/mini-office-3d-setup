"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { spawnAgent } from "@/app/agent-actions";
import type { Model, PermissionMode } from "@/server/agents/registry";

const NAMES = ["Ada", "Linus", "Grace", "Alan", "Margaret", "Dennis", "Barbara", "Ken", "Radia", "Guido", "Frances", "Bjarne"];

const MODELS: { value: Model; label: string }[] = [
  { value: "default", label: "Claude Code default" },
  { value: "opus", label: "Opus" },
  { value: "sonnet", label: "Sonnet" },
  { value: "haiku", label: "Haiku" },
];

const MODES: { value: PermissionMode; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "Your usual mode: Claude asks only about risky actions." },
  { value: "default", label: "Ask before acting", hint: "A speech bubble for every edit or command." },
  { value: "plan", label: "Plan only", hint: "Reads and plans, never changes anything." },
];

const FIELD =
  "w-full border-2 border-line bg-bg px-2.5 py-1.5 font-mono text-sm outline-none placeholder:text-muted focus:border-accent";

interface Props {
  roomId: string;
  roomName: string;
  /** How many agents are already in the room (for a fresh default name). */
  existing: string[];
  onClose: () => void;
}

/** The portal's form: what to work on, who, and with which model. Mount fresh per use. */
export function SpawnDialog({ roomId, roomName, existing, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(() => NAMES.find((n) => !existing.includes(n)) ?? "Agent");
  const [task, setTask] = useState("");
  const [model, setModel] = useState<Model>("default");
  const [mode, setMode] = useState<PermissionMode>("auto");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await spawnAgent(roomId, { task, name, model, mode }).catch(() => null);
      if (!res) setError("Couldn't reach the server.");
      else if (!res.ok) setError(res.error);
      else dialog.current?.close();
    });
  };

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="spawn-title"
      className="m-auto w-[min(560px,calc(100vw-32px))] border-2 border-line bg-panel p-0 text-ink shadow-[6px_6px_0_0_rgba(0,0,0,0.45)] backdrop:bg-black/60"
    >
      <form
        className="flex flex-col gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (task.trim()) submit();
        }}
      >
        <div>
          <h2 id="spawn-title" className="font-pixel text-lg leading-none">
            Spawn an agent in {roomName}
          </h2>
          <p className="mt-1.5 font-mono text-[11px] text-muted">
            Starts Claude Code in this room&apos;s folder with your task. It takes the next free desk.
          </p>
        </div>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[11px] text-muted">Task</span>
          <textarea
            autoFocus
            required
            rows={4}
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="e.g. Find out why the login test fails and fix it"
            className={`${FIELD} resize-y`}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] text-muted">Name</span>
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] text-muted">Model</span>
            <select value={model} onChange={(e) => setModel(e.target.value as Model)} className={FIELD}>
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 font-mono text-[11px] text-muted">Permissions</legend>
          {MODES.map((m) => (
            <label key={m.value} className="flex items-baseline gap-2 font-mono text-xs">
              <input type="radio" name="mode" checked={mode === m.value} onChange={() => setMode(m.value)} />
              <span>
                <span className="text-ink">{m.label}</span> <span className="text-muted">· {m.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex items-center justify-end gap-2 pt-1">
          <p role="status" className="mr-auto font-mono text-[11px]">
            {pending ? <span className="text-muted">Opening the portal…</span> : error && <span className="text-red-400">{error}</span>}
          </p>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="border-2 border-line px-3 py-1.5 font-mono text-xs text-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || !task.trim()}
            className="border-2 border-[#1d1a2b] bg-accent px-3 py-1.5 font-mono text-xs text-[#1d1a2b] disabled:opacity-40"
          >
            Spawn
          </button>
        </div>
      </form>
    </dialog>
  );
}
