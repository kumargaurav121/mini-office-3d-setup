import { randomUUID } from "node:crypto";
import { DESKS } from "@/lib/office/layout";
import { basename } from "node:path";
import {
  applyHook,
  initialSession,
  looksLikeTrustPrompt,
  permissionTitle,
  type Ask,
  type HookEvent,
  type SessionView,
} from "./session";

/** The bits of a node-pty terminal the registry uses (so tests can fake it). */
export interface Pty {
  onData(cb: (data: string) => void): void;
  onExit(cb: (e: { exitCode: number }) => void): void;
  write(data: string): void;
  kill(signal?: string): void;
}

export interface SpawnRequest {
  cwd: string;
  args: string[];
  env: Record<string, string>;
}

export type Model = "default" | "opus" | "sonnet" | "haiku";
export type PermissionMode = "auto" | "default" | "plan";

export interface SpawnForm {
  task: string;
  name: string;
  model: Model;
  mode: PermissionMode;
}

/** What the browser sees about an agent. */
export interface AgentInfo {
  id: string;
  roomId: string;
  name: string;
  model: Model;
  task: string;
  deskIndex: number;
  session: SessionView;
}

/** A user-fixable problem (room full, empty task…); the message is shown in the UI. */
export class AgentError extends Error {}

interface Agent extends AgentInfo {
  pty: Pty;
  /** Shared secret the agent's hook script sends back, so nothing else can pose as it. */
  token: string;
  /** Recent raw terminal output, replayed to anyone who starts watching. */
  output: string;
  viewers: Set<(chunk: string) => void>;
  /** The claude process has actually exited. */
  exited: boolean;
  removing: boolean;
}

/** Enough scrollback to redraw the screen for a late viewer. */
const REPLAY_BYTES = 512 * 1024;
/** How long an ended agent stays listed, so the browser can walk it out through the portal. */
const ENDED_LINGER_MS = 20_000;
/** Claude Code can take a while to quit; escalate from Ctrl+C to SIGTERM to SIGKILL. */
const TERM_AFTER_MS = 1500;
const KILL_AFTER_MS = 5000;

/** Hook events we listen to; each runs our hook script, which reports to the server. */
const HOOK_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PermissionRequest", "Stop", "SessionEnd"];
/** How long Claude Code waits for you to answer a permission bubble before asking in the terminal. */
const PERMISSION_WAIT_S = 600;

/** Per-session settings: merged over the user's own, so their config is untouched. */
function sessionSettings(hookCommand: string) {
  const entry = (event: string) => [
    { matcher: "", hooks: [{ type: "command", command: hookCommand, timeout: event === "PermissionRequest" ? PERMISSION_WAIT_S : 15 }] },
  ];
  return { hooks: Object.fromEntries(HOOK_EVENTS.map((e) => [e, entry(e)])) };
}

/** What a PermissionRequest hook prints for Claude Code: allow or deny. */
function decision(allow: boolean) {
  return {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: allow ? { behavior: "allow" } : { behavior: "deny", message: "The user denied this in Mini Office." },
    },
  };
}

export type HookReply = ReturnType<typeof decision> | null;

interface Pending {
  agentId: string;
  ask: Ask;
  /** Settles the hook call that's waiting (permission), or null for questions answered in the terminal (trust). */
  resolve: ((reply: HookReply) => void) | null;
}

export class AgentRegistry {
  private agents = new Map<string, Agent>();
  private pending = new Map<string, Pending>();
  private listeners = new Set<() => void>();

  /** Called whenever any agent changes (for the browser's live stream). */
  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private changed() {
    for (const l of this.listeners) l();
  }

  private update(agent: Agent, session: SessionView) {
    agent.session = session;
    this.changed();
  }

  constructor(
    private readonly deps: {
      spawn: (req: SpawnRequest) => Pty;
      hookCommand: string;
      /** Unix socket the hook script reports to (private to this user, no port to clash with). */
      hookSocket: string;
    },
  ) {}

  list(): AgentInfo[] {
    return [...this.agents.values()].map(
      (a): AgentInfo => ({
        id: a.id,
        roomId: a.roomId,
        name: a.name,
        model: a.model,
        task: a.task,
        deskIndex: a.deskIndex,
        session: a.session,
      }),
    );
  }

  /** Start a Claude Code session for `room` at its lowest free desk. */
  spawnAgent(room: { id: string; path: string }, form: SpawnForm): AgentInfo {
    const used = new Set([...this.agents.values()].filter((a) => a.roomId === room.id).map((a) => a.deskIndex));
    const deskIndex = DESKS.findIndex((d) => !used.has(d.index));
    if (deskIndex < 0) throw new AgentError("All desks in this room are taken.");
    const task = form.task.trim();
    if (!task) throw new AgentError("Give the agent a task.");
    // Never let user text be read as a CLI flag (e.g. a task of "--dangerously-skip-permissions").
    if (task.startsWith("-")) throw new AgentError("The task can't start with “-”.");
    const name = form.name.replace(/^[-\s]+/, "").trim() || "Agent";
    const id = randomUUID();
    const token = randomUUID();
    const args = [
      ...(form.model === "default" ? [] : ["--model", form.model]),
      "--permission-mode",
      form.mode,
      "--name",
      name,
      "--session-id",
      id,
      "--settings",
      JSON.stringify(sessionSettings(this.deps.hookCommand)),
      // End of options: the task is only ever the prompt.
      "--",
      task,
    ];
    const env = {
      MINI_OFFICE_AGENT_ID: id,
      MINI_OFFICE_AGENT_TOKEN: token,
      MINI_OFFICE_HOOK_SOCKET: this.deps.hookSocket,
    };
    const pty = this.deps.spawn({ cwd: room.path, args, env });
    const agent: Agent = {
      id,
      roomId: room.id,
      name,
      model: form.model,
      task,
      deskIndex,
      session: initialSession(),
      pty,
      token,
      output: "",
      viewers: new Set(),
      exited: false,
      removing: false,
    };
    this.agents.set(id, agent);
    pty.onData((chunk) => this.onOutput(agent, room.path, chunk));
    pty.onExit(() => this.onExit(agent));
    this.changed();
    return this.list().find((a) => a.id === id)!;
  }

  /**
   * A hook event from an agent's Claude Code. Resolves to what the hook should
   * print: a decision for permission requests (once the user answers), else null.
   */
  handleHook(agentId: string, token: string, event: HookEvent): Promise<HookReply> {
    const agent = this.agents.get(agentId);
    if (!agent || agent.token !== token) return Promise.reject(new AgentError("Unknown agent or bad token."));
    if (event.hook_event_name !== "PermissionRequest") {
      this.update(agent, applyHook(agent.session, event));
      return Promise.resolve(null);
    }
    const ask: Ask = { id: randomUUID(), kind: "permission", title: permissionTitle(event.tool_name, event.tool_input) };
    // Register the question before announcing it, so even an instant answer finds it.
    const reply = new Promise<HookReply>((resolve) => {
      this.pending.set(ask.id, { agentId, ask, resolve });
      // Give up a little before Claude Code's own hook timeout; it then asks in the terminal instead.
      setTimeout(() => this.settle(ask.id, null), (PERMISSION_WAIT_S - 15) * 1000).unref?.();
    });
    this.update(agent, { phase: "permission", activity: "Waiting for you", ask });
    return reply;
  }

  /** The user's answer to an agent's question. */
  answer(agentId: string, askId: string, yes: boolean) {
    const pending = this.pending.get(askId);
    const agent = this.agents.get(agentId);
    if (!pending || pending.agentId !== agentId || !agent) return;
    if (pending.ask.kind === "trust") {
      // The prompt lists "No, exit" first: Down + Enter trusts, Enter alone exits.
      if (yes) {
        agent.pty.write("\x1b[B");
        setTimeout(() => agent.pty.write("\r"), 150);
      } else {
        agent.pty.write("\r");
      }
      this.settle(askId, null, initialSession());
      return;
    }
    this.settle(askId, decision(yes), { phase: "working", activity: "Thinking…", ask: null });
  }

  /** Stop an agent's session. It leaves through the portal right away; the process is made sure to exit. */
  end(agentId: string) {
    const agent = this.agents.get(agentId);
    if (!agent || agent.session.phase === "ended") return;
    this.finish(agent);
    agent.pty.write("\x03\x03"); // Ctrl+C twice: Claude Code's own way out
    setTimeout(() => !agent.exited && agent.pty.kill("SIGTERM"), TERM_AFTER_MS).unref?.();
    setTimeout(() => !agent.exited && agent.pty.kill("SIGKILL"), KILL_AFTER_MS).unref?.();
  }

  /** Keystrokes from the office, typed into the agent's terminal. */
  input(agentId: string, data: string) {
    const agent = this.agents.get(agentId);
    if (!agent || agent.session.phase === "ended") return;
    agent.pty.write(data);
  }

  /** On server shutdown: don't leave agents running on their own. */
  killAll() {
    for (const agent of this.agents.values()) if (!agent.exited) agent.pty.kill("SIGKILL");
  }

  /** Live terminal of an agent: what's been printed so far, plus new output as it arrives. */
  terminal(agentId: string) {
    const agent = this.agents.get(agentId);
    if (!agent) return undefined;
    return {
      replay: () => agent.output,
      subscribe: (cb: (chunk: string) => void) => {
        agent.viewers.add(cb);
        return () => {
          agent.viewers.delete(cb);
        };
      },
    };
  }

  private onOutput(agent: Agent, folder: string, chunk: string) {
    agent.output = (agent.output + chunk).slice(-REPLAY_BYTES);
    for (const v of agent.viewers) v(chunk);
    // Before hooks can run, Claude Code may ask whether to trust the folder.
    if (agent.session.phase === "starting" && looksLikeTrustPrompt(agent.output.slice(-8192))) {
      const ask: Ask = {
        id: randomUUID(),
        kind: "trust",
        title: `Trust ${basename(folder)}?`,
        detail: `Claude Code will be able to read, edit and run files in ${folder}.`,
      };
      this.pending.set(ask.id, { agentId: agent.id, ask, resolve: null });
      this.update(agent, { phase: "trust", activity: "Waiting for you", ask });
    }
  }

  private onExit(agent: Agent) {
    agent.exited = true;
    this.finish(agent);
  }

  /** Mark an agent's session over (once): drop its questions, list it as ended, then remove it. */
  private finish(agent: Agent) {
    if (agent.removing) return;
    agent.removing = true;
    for (const [id, p] of this.pending) if (p.agentId === agent.id) this.settle(id, null, null);
    this.update(agent, { phase: "ended", activity: "Session ended", ask: null });
    setTimeout(() => {
      this.agents.delete(agent.id);
      this.changed();
    }, ENDED_LINGER_MS).unref?.();
  }

  /** Close out a pending question; `next` (if given) becomes the agent's session state. */
  private settle(askId: string, reply: HookReply, next: SessionView | null = { phase: "working", activity: "Asking in the terminal", ask: null }) {
    const pending = this.pending.get(askId);
    if (!pending) return;
    this.pending.delete(askId);
    pending.resolve?.(reply);
    const agent = this.agents.get(pending.agentId);
    if (next && agent && agent.session.ask?.id === askId) this.update(agent, next);
  }
}
