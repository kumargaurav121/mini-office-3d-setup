import type { AgentInfo } from "@/server/agents/registry";
import type { AgentStatus } from "@/lib/office/sim";

/** One line about what an agent is up to: its session when busy, its break when idle. */
export function agentLabel(info: AgentInfo | undefined, status: AgentStatus | undefined): string {
  if (!info) return status?.label ?? "";
  const { session } = info;
  switch (session.phase) {
    case "permission":
    case "trust":
      return `Waiting for you: ${session.ask?.title ?? ""}`;
    case "idle":
      return status && status.activity !== "working" ? `Done · ${status.label}` : session.activity;
    case "ended":
      return "Leaving";
    default:
      return session.activity;
  }
}
