"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { browseFolder, listRepos } from "@/app/office-actions";
import type { RepoEntry } from "@/server/office-store";

interface Props {
  title: string;
  hint: string;
  /** Label of the button that uses a pasted path. */
  pickLabel: string;
  /** Shown while a pick is being saved. */
  pendingText: string;
  /** Folders that already have a room. */
  usedPaths: Set<string>;
  /** Resolves to an error message, or null once the folder is in use. */
  onPick: (path: string) => Promise<string | null>;
  /** Leave out to make the picker one you can't dismiss (choosing the first room). */
  onClose?: () => void;
}

interface Crumb {
  name: string;
  path: string;
  folders: RepoEntry[] | null;
}

/**
 * Modal for choosing the folder behind a room: search local git repos, step
 * into one to pick a subfolder, or paste a path. Mount it fresh per use.
 */
export function RepoPicker({ title, hint, pickLabel, pendingText, usedPaths, onPick, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [repos, setRepos] = useState<RepoEntry[] | null>(null);
  const [trail, setTrail] = useState<Crumb[]>([]);
  const [query, setQuery] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    dialog.current?.showModal();
    let live = true;
    listRepos()
      .then((res) => {
        if (!live) return;
        setRepos(res.ok ? res.value : []);
        if (!res.ok) setError(res.error);
      })
      .catch(() => {
        if (!live) return;
        setRepos([]);
        setError("Couldn't reach the server.");
      });
    return () => {
      live = false;
    };
  }, []);

  const here = trail.at(-1);
  const source = here ? here.folders : repos;
  const q = query.trim().toLowerCase();
  const rows = source?.filter((r) => !q || r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q));

  const pick = (path: string) => {
    setError(null);
    startTransition(async () => {
      const problem = await onPick(path);
      if (problem) setError(problem);
    });
  };

  const open = (entry: RepoEntry) => {
    setQuery("");
    setTrail((t) => [...t, { ...entry, folders: null }]);
    const settle = (folders: RepoEntry[], problem?: string) => {
      setTrail((t) => t.map((c) => (c.path === entry.path ? { ...c, folders } : c)));
      if (problem) setError(problem);
    };
    browseFolder(entry.path)
      .then((res) => (res.ok ? settle(res.value) : settle([], res.error)))
      .catch(() => settle([], "Couldn't reach the server."));
  };

  return (
    <dialog
      ref={dialog}
      // Esc closes a dialog even when told not to if pressed twice; a picker you can't dismiss just reopens.
      onCancel={(e) => !onClose && e.preventDefault()}
      onClose={() => (onClose ? onClose() : dialog.current?.showModal())}
      aria-labelledby="repo-picker-title"
      className="m-auto w-[min(640px,calc(100vw-32px))] border-2 border-line bg-panel p-0 text-ink shadow-[6px_6px_0_0_rgba(0,0,0,0.45)] backdrop:bg-black/60"
    >
      <div className="flex max-h-[min(640px,calc(100dvh-64px))] flex-col">
        <header className="border-b-2 border-line px-4 pt-4 pb-3">
          <h2 id="repo-picker-title" className="font-pixel text-lg leading-none">
            {title}
          </h2>
          <p className="mt-1.5 font-mono text-[11px] text-muted">{hint}</p>
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={here ? `Filter folders in ${here.name}…` : "Search repos…"}
            aria-label="Filter"
            className="mt-3 w-full border-2 border-line bg-bg px-2.5 py-1.5 font-mono text-sm outline-none placeholder:text-muted focus:border-accent"
          />
          {trail.length > 0 && (
            <nav aria-label="Folder" className="mt-2 flex flex-wrap items-center gap-1 font-mono text-[11px]">
              <button type="button" className="text-muted hover:text-ink" onClick={() => setTrail([])}>
                All repos
              </button>
              {trail.map((c, i) => (
                <span key={c.path} className="flex items-center gap-1">
                  <span className="text-muted">/</span>
                  <button type="button" className="hover:text-accent" onClick={() => setTrail((t) => t.slice(0, i + 1))}>
                    {c.name}
                  </button>
                </span>
              ))}
              {here && (
                <button
                  type="button"
                  disabled={pending || usedPaths.has(here.path)}
                  onClick={() => pick(here.path)}
                  className="ml-auto border-2 border-[#1d1a2b] bg-accent px-2 py-0.5 text-[#1d1a2b] disabled:opacity-40"
                >
                  {usedPaths.has(here.path) ? "Already a room" : `Use ${here.name}`}
                </button>
              )}
            </nav>
          )}
        </header>

        <ul className="min-h-40 flex-1 overflow-y-auto p-2" aria-busy={!rows}>
          {!rows && <li className="animate-pulse p-3 font-mono text-xs text-muted">Looking for repos…</li>}
          {rows?.length === 0 && <li className="p-3 font-mono text-xs text-muted">Nothing here.</li>}
          {rows?.map((r) => {
            const used = usedPaths.has(r.path);
            return (
              <li key={r.path} className="flex items-center gap-2 border-2 border-transparent px-2 py-1.5 hover:border-line">
                <button
                  type="button"
                  disabled={pending || used}
                  onClick={() => pick(r.path)}
                  className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="block truncate font-pixel text-sm">{r.name}</span>
                  <span className="block truncate font-mono text-[10px] text-muted">{used ? "Already in the office" : r.path}</span>
                </button>
                <button
                  type="button"
                  onClick={() => open(r)}
                  aria-label={`Show folders in ${r.name}`}
                  className="shrink-0 border-2 border-line px-2 font-mono text-sm text-muted hover:border-ink hover:text-ink"
                >
                  ›
                </button>
              </li>
            );
          })}
        </ul>

        <footer className="border-t-2 border-line p-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (typed.trim()) pick(typed.trim());
            }}
          >
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="…or paste a folder path"
              aria-label="Folder path"
              className="min-w-0 flex-1 border-2 border-line bg-bg px-2.5 py-1.5 font-mono text-xs outline-none placeholder:text-muted focus:border-accent"
            />
            <button
              type="submit"
              disabled={pending || !typed.trim()}
              className="border-2 border-[#1d1a2b] bg-accent px-3 font-mono text-xs text-[#1d1a2b] disabled:opacity-40"
            >
              {pickLabel}
            </button>
            {onClose && (
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                className="border-2 border-line px-3 font-mono text-xs text-muted hover:text-ink"
              >
                Cancel
              </button>
            )}
          </form>
          <p role="status" className="mt-2 min-h-4 font-mono text-[11px]">
            {pending ? <span className="text-muted">{pendingText}</span> : error && <span className="text-red-400">{error}</span>}
          </p>
        </footer>
      </div>
    </dialog>
  );
}
