"use server";

import { headers } from "next/headers";
import { agents, existingAgents, isLocalHost } from "@/server/agents";
import { AgentError, type AgentInfo, type Delivery, type Model, type PermissionMode } from "@/server/agents/registry";
import { getStore } from "@/server/office";
import type { ActionResult } from "./office-actions";

const MODELS: Model[] = ["default", "opus", "sonnet", "haiku"];
const MODES: PermissionMode[] = ["auto", "default", "plan"];

export interface SpawnInput {
  task: string;
  name: string;
  model: Model;
  mode: PermissionMode;
}

/** Spawn a Claude Code agent in a room. Only for requests addressed to localhost. */
export async function spawnAgent(roomId: string, input: SpawnInput): Promise<ActionResult<AgentInfo>> {
  const host = (await headers()).get("host");
  if (!isLocalHost(host)) return { ok: false, error: "Agents can only be started from this computer (localhost)." };
  const room = (await (await getStore()).rooms()).find((r) => r.id === roomId);
  if (!room) return { ok: false, error: "That room no longer exists." };
  const task = typeof input?.task === "string" ? input.task.slice(0, 4000) : "";
  const name = (typeof input?.name === "string" ? input.name.trim().slice(0, 40) : "") || "Agent";
  const model = MODELS.includes(input?.model) ? input.model : "default";
  const mode = MODES.includes(input?.mode) ? input.mode : "auto";
  try {
    const registry = await agents();
    return { ok: true, value: registry.spawnAgent(room, { task, name, model, mode }) };
  } catch (err) {
    if (err instanceof AgentError) return { ok: false, error: err.message };
    console.error("[office] spawn failed", err);
    return { ok: false, error: "Couldn't start Claude Code. Is the `claude` CLI installed and on your PATH?" };
  }
}

/** Answer an agent's question (permission request or trusting its folder). */
export async function answerAsk(agentId: string, askId: string, yes: boolean): Promise<void> {
  if (!isLocalHost((await headers()).get("host"))) return;
  existingAgents()?.answer(String(agentId), String(askId), yes === true);
}

/** End an agent's session; it walks back into the portal. */
export async function endAgent(agentId: string): Promise<void> {
  if (!isLocalHost((await headers()).get("host"))) return;
  existingAgents()?.end(String(agentId));
}

/** Keystrokes typed into an agent's terminal in the office. */
export async function sendInput(agentId: string, data: string): Promise<void> {
  if (!isLocalHost((await headers()).get("host"))) return;
  if (typeof data !== "string" || data.length === 0 || data.length > 64 * 1024) return;
  existingAgents()?.input(String(agentId), data);
}

/** Something said to an agent with push-to-talk: typed into its session now, or once it's free. */
export async function tellAgent(agentId: string, words: string): Promise<Delivery | null> {
  if (!isLocalHost((await headers()).get("host"))) return null;
  if (typeof words !== "string") return null;
  return existingAgents()?.tell(String(agentId), words) ?? null;
}
