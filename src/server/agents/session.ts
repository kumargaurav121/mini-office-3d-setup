// What an agent's Claude Code session is doing, derived from its hook events.
// Pure, so it can be tested without a real CLI.

export type SessionPhase = "starting" | "trust" | "working" | "permission" | "idle" | "ended";

/** A question the agent is waiting on you for (permission, or trusting the folder). */
export interface Ask {
  id: string;
  kind: "permission" | "trust";
  /** e.g. "Run npm test" or "Trust ~/Repo/api?" */
  title: string;
  /** Extra detail such as the full command, if any. */
  detail?: string;
}

export interface SessionView {
  phase: SessionPhase;
  /** Short human description of what's happening. */
  activity: string;
  ask: Ask | null;
}

/** The subset of a hook's stdin JSON we look at. */
export interface HookEvent {
  hook_event_name: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  notification_type?: string;
}

export function initialSession(): SessionView {
  return { phase: "starting", activity: "Starting Claude Code…", ask: null };
}

const fileName = (p: unknown) => (typeof p === "string" ? p.split("/").filter(Boolean).pop() ?? p : "a file");

/** "Running npm test", "Editing page.tsx"… */
export function describeTool(tool: string | undefined, input: Record<string, unknown> = {}): string {
  switch (tool) {
    case "Bash":
      return `Running ${String(input.command ?? "a command")}`;
    case "Edit":
    case "MultiEdit":
    case "Write":
    case "NotebookEdit":
      return `Editing ${fileName(input.file_path ?? input.notebook_path)}`;
    case "Read":
      return `Reading ${fileName(input.file_path)}`;
    default:
      return `Using ${tool ?? "a tool"}`;
  }
}

/** The question on a permission bubble: "Run npm test", "Edit page.tsx"… */
export function permissionTitle(tool: string | undefined, input: Record<string, unknown> = {}): string {
  const doing = describeTool(tool, input);
  return doing.replace(/^Running /, "Run ").replace(/^Editing /, "Edit ").replace(/^Reading /, "Read ").replace(/^Using /, "Use ");
}

export function applyHook(view: SessionView, event: HookEvent): SessionView {
  switch (event.hook_event_name) {
    case "UserPromptSubmit":
    case "PostToolUse":
      return { phase: "working", activity: "Thinking…", ask: null };
    case "PreToolUse":
      return { phase: "working", activity: describeTool(event.tool_name, event.tool_input), ask: null };
    case "Stop":
      return { phase: "idle", activity: "Task done", ask: null };
    case "SessionEnd":
      return { phase: "ended", activity: "Session ended", ask: null };
    default:
      return view;
  }
}

/** True if raw terminal output contains Claude Code's "do you trust this folder?" choice. */
export function looksLikeTrustPrompt(output: string): boolean {
  // Strip escape sequences and whitespace: the TUI often moves the cursor instead of printing spaces.
  const plain = output
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[\]P][^\x07\x1b]*(\x07|\x1b\\)/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
  return plain.includes("yes,itrustthisfolder");
}
