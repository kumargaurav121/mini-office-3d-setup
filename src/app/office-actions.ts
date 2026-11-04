"use server";

import type { Cell, RoomRecord } from "@/lib/office/rooms";
import { expandHome, getStore, loadConfig } from "@/server/office";
import { findRepos, listFolders, RoomError, type RepoEntry } from "@/server/office-store";

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

// Scanning the home folder takes a moment; reuse the result briefly while the picker is open.
let repoCache: { at: number; repos: RepoEntry[] } | null = null;
const REPO_CACHE_MS = 30_000;

export async function listRepos(): Promise<ActionResult<RepoEntry[]>> {
  return attempt(async () => {
    if (repoCache && Date.now() - repoCache.at < REPO_CACHE_MS) return repoCache.repos;
    const repos = await findRepos((await loadConfig()).repoRoots);
    repoCache = { at: Date.now(), repos };
    return repos;
  });
}

export async function browseFolder(path: string): Promise<ActionResult<RepoEntry[]>> {
  return attempt(async () => listFolders((await loadConfig()).repoRoots, expandHome(path)));
}

export async function addRoom(path: string, cell: Cell): Promise<ActionResult<RoomRecord[]>> {
  return attempt(async () => (await getStore()).addRoom(expandHome(path), cell));
}

export async function removeRoom(id: string): Promise<ActionResult<RoomRecord[]>> {
  return attempt(async () => (await getStore()).removeRoom(id));
}

export async function moveRoom(id: string, cell: Cell): Promise<ActionResult<RoomRecord[]>> {
  return attempt(async () => (await getStore()).moveRoom(id, cell));
}

/** Failures come back as a message for the UI; unexpected ones (permissions, IO) are logged too. */
async function attempt<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if (err instanceof RoomError) return { ok: false, error: err.message };
    console.error("[office]", err);
    return { ok: false, error: "Couldn't read that folder." };
  }
}
