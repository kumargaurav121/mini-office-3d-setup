import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentRegistry, type Pty, type SpawnRequest } from "./registry";

/** Fake terminal: records what was spawned and written, lets tests emit output/exit. */
function fakeSpawner() {
  const spawned: { req: SpawnRequest; pty: FakePty }[] = [];
  class FakePty implements Pty {
    written: string[] = [];
    killed = false;
    signals: string[] = [];
    /** When true the fake ignores signals other than SIGKILL (like a busy claude). */
    stubborn = false;
    private dataCbs: ((d: string) => void)[] = [];
    private exitCbs: ((e: { exitCode: number }) => void)[] = [];
    onData(cb: (d: string) => void) {
      this.dataCbs.push(cb);
    }
    onExit(cb: (e: { exitCode: number }) => void) {
      this.exitCbs.push(cb);
    }
    write(d: string) {
      this.written.push(d);
    }
    kill(signal = "SIGHUP") {
      this.signals.push(signal);
      if (this.stubborn && signal !== "SIGKILL") return;
      this.killed = true;
      this.exit(0);
    }
    emit(d: string) {
      for (const cb of this.dataCbs) cb(d);
    }
    exit(code: number) {
      for (const cb of this.exitCbs) cb({ exitCode: code });
    }
  }
  const spawn = (req: SpawnRequest) => {
    const pty = new FakePty();
    spawned.push({ req, pty });
    return pty;
  };
  return { spawn, spawned };
}

const room = { id: "api-1", path: "/Users/me/Repo/api" };
const form = { task: "Fix the failing test", name: "Ada", model: "sonnet", mode: "auto" } as const;
const registry = (spawn: (req: SpawnRequest) => Pty) =>
  new AgentRegistry({ spawn, hookCommand: "node /app/scripts/office-hook.mjs", hookSocket: "/tmp/mini-office-test.sock" });

afterEach(() => {
  vi.useRealTimers();
});

describe("agent registry", () => {
  it("seats each new agent at the lowest free desk and refuses a fifth", () => {
    const { spawn } = fakeSpawner();
    const reg = registry(spawn);
    const desks = [0, 1, 2, 3].map((i) => reg.spawnAgent(room, { ...form, name: `A${i}` }).deskIndex);
    expect(desks).toEqual([0, 1, 2, 3]);
    expect(() => reg.spawnAgent(room, form)).toThrow(/desks/i);
    // Another room has its own desks.
    expect(reg.spawnAgent({ id: "web-1", path: "/Users/me/Repo/web" }, form).deskIndex).toBe(0);
  });

  it("starts claude in the room's folder with the task, options, a fixed session id and our hooks", () => {
    const { spawn, spawned } = fakeSpawner();
    const reg = registry(spawn);
    const agent = reg.spawnAgent(room, form);
    const { req } = spawned[0];
    expect(req.cwd).toBe(room.path);
    const flag = (name: string) => req.args[req.args.indexOf(name) + 1];
    expect(req.args.at(-1)).toBe("Fix the failing test");
    expect(flag("--model")).toBe("sonnet");
    expect(flag("--permission-mode")).toBe("auto");
    expect(flag("--name")).toBe("Ada");
    expect(flag("--session-id")).toBe(agent.id);
    const hooks = JSON.parse(flag("--settings")).hooks;
    for (const event of ["UserPromptSubmit", "PreToolUse", "PostToolUse", "PermissionRequest", "Stop", "SessionEnd"]) {
      expect(hooks[event][0].hooks[0].command).toBe("node /app/scripts/office-hook.mjs");
    }
    expect(hooks.PermissionRequest[0].hooks[0].timeout).toBeGreaterThanOrEqual(300);
    expect(req.env.MINI_OFFICE_AGENT_ID).toBe(agent.id);
    expect(req.env.MINI_OFFICE_HOOK_SOCKET).toBe("/tmp/mini-office-test.sock");
    expect(req.env.MINI_OFFICE_AGENT_TOKEN).toMatch(/^[0-9a-f-]{20,}$/);

    // "default" model means: let Claude Code pick.
    reg.spawnAgent(room, { ...form, model: "default" });
    expect(spawned[1].req.args).not.toContain("--model");
    expect(() => reg.spawnAgent(room, { ...form, task: "   " })).toThrow(/task/i);
  });

  it("turns a permission request into a question for the user and hands their answer back to Claude", async () => {
    const { spawn, spawned } = fakeSpawner();
    const reg = registry(spawn);
    const agent = reg.spawnAgent(room, form);
    const token = spawned[0].req.env.MINI_OFFICE_AGENT_TOKEN;

    await reg.handleHook(agent.id, token, { hook_event_name: "UserPromptSubmit" });
    expect(reg.list()[0].session.phase).toBe("working");

    const answer = reg.handleHook(agent.id, token, {
      hook_event_name: "PermissionRequest",
      tool_name: "Bash",
      tool_input: { command: "rm -rf build" },
    });
    const { session } = reg.list()[0];
    expect(session.phase).toBe("permission");
    expect(session.ask).toMatchObject({ kind: "permission", title: "Run rm -rf build" });

    reg.answer(agent.id, session.ask!.id, true);
    expect(await answer).toEqual({
      hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } },
    });
    expect(reg.list()[0].session).toMatchObject({ phase: "working", ask: null });
  });

  it("tells Claude when the user denies, and ignores hook calls with the wrong token", async () => {
    const { spawn, spawned } = fakeSpawner();
    const reg = registry(spawn);
    const agent = reg.spawnAgent(room, form);
    const token = spawned[0].req.env.MINI_OFFICE_AGENT_TOKEN;
    await expect(reg.handleHook(agent.id, "nope", { hook_event_name: "Stop" })).rejects.toThrow(/token/i);

    const answer = reg.handleHook(agent.id, token, { hook_event_name: "PermissionRequest", tool_name: "Write", tool_input: { file_path: "/x/a.ts" } });
    reg.answer(agent.id, reg.list()[0].session.ask!.id, false);
    expect(await answer).toMatchObject({
      hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "deny" } },
    });
  });

  it("asks the user to trust an unfamiliar folder, then answers the terminal prompt for them", () => {
    vi.useFakeTimers();
    const { spawn, spawned } = fakeSpawner();
    const reg = registry(spawn);
    const agent = reg.spawnAgent(room, form);
    const pty = spawned[0].pty;
    pty.emit("Quick safety check ... ❯ No, exit\r\n  Yes, I trust this folder");
    const { session } = reg.list()[0];
    expect(session).toMatchObject({ phase: "trust", ask: { kind: "trust", title: "Trust api?" } });

    reg.answer(agent.id, session.ask!.id, true);
    vi.runAllTimers();
    expect(pty.written.join("")).toBe("\x1b[B\r"); // move to "Yes, I trust this folder", confirm
    expect(reg.list()[0].session.ask).toBeNull();
  });

  it("replays terminal output to late viewers and streams what comes next", () => {
    const { spawn, spawned } = fakeSpawner();
    const reg = registry(spawn);
    const agent = reg.spawnAgent(room, form);
    spawned[0].pty.emit("hello ");
    const term = reg.terminal(agent.id)!;
    expect(term.replay()).toBe("hello ");
    const seen: string[] = [];
    term.subscribe((chunk) => seen.push(chunk));
    spawned[0].pty.emit("world");
    expect(seen).toEqual(["world"]);
  });

  it("frees the desk shortly after the session ends, and can end a session on request", () => {
    vi.useFakeTimers();
    const { spawn, spawned } = fakeSpawner();
    const reg = registry(spawn);
    const agent = reg.spawnAgent(room, form);
    reg.end(agent.id);
    expect(reg.list()[0].session.phase).toBe("ended");
    vi.advanceTimersByTime(60_000);
    expect(spawned[0].pty.killed).toBe(true);
    expect(reg.list()).toHaveLength(0);
    expect(reg.spawnAgent(room, form).deskIndex).toBe(0);
  });

  it("accepts an answer given the moment the question appears", async () => {
    const { spawn, spawned } = fakeSpawner();
    const reg = registry(spawn);
    const agent = reg.spawnAgent(room, form);
    reg.subscribe(() => {
      const ask = reg.list()[0].session.ask;
      if (ask) reg.answer(agent.id, ask.id, true);
    });
    const answer = reg.handleHook(agent.id, spawned[0].req.env.MINI_OFFICE_AGENT_TOKEN, {
      hook_event_name: "PermissionRequest",
      tool_name: "Bash",
      tool_input: { command: "date" },
    });
    expect(await answer).toMatchObject({ hookSpecificOutput: { decision: { behavior: "allow" } } });
  });

  it("never lets the task or name be read as command-line flags", () => {
    const { spawn, spawned } = fakeSpawner();
    const reg = registry(spawn);
    reg.spawnAgent(room, { ...form, name: "--dangerously-skip-permissions" });
    const { args } = spawned[0].req;
    // Options end with "--"; the task is the only thing after it.
    expect(args.slice(-2)).toEqual(["--", "Fix the failing test"]);
    expect(args[args.indexOf("--name") + 1]).toBe("dangerously-skip-permissions");
    expect(() => reg.spawnAgent(room, { ...form, task: "--dangerously-skip-permissions and delete stuff" })).toThrow(/task/i);
  });

  it("ends a session at once in the office, and makes sure the process is really gone", () => {
    vi.useFakeTimers();
    const { spawn, spawned } = fakeSpawner();
    const reg = registry(spawn);
    const agent = reg.spawnAgent(room, form);
    const pty = spawned[0].pty;
    pty.stubborn = true;

    reg.end(agent.id);
    expect(reg.list()[0].session.phase).toBe("ended"); // walks out right away
    expect(pty.written.join("")).toBe("\x03\x03"); // politely: Ctrl+C twice
    vi.advanceTimersByTime(10_000);
    expect(pty.signals).toEqual(["SIGTERM", "SIGKILL"]); // then firmly
    expect(pty.killed).toBe(true);
  });

  it("kills every agent when the server shuts down", () => {
    const { spawn, spawned } = fakeSpawner();
    const reg = registry(spawn);
    reg.spawnAgent(room, form);
    reg.spawnAgent(room, form);
    reg.killAll();
    expect(spawned.map((s) => s.pty.signals)).toEqual([["SIGKILL"], ["SIGKILL"]]);
  });

  it("passes what you type to the agent's terminal, until its session ends", () => {
    const { spawn, spawned } = fakeSpawner();
    const reg = registry(spawn);
    const agent = reg.spawnAgent(room, form);
    reg.input(agent.id, "also add a test\r");
    expect(spawned[0].pty.written).toEqual(["also add a test\r"]);
    reg.end(agent.id);
    spawned[0].pty.written.length = 0;
    reg.input(agent.id, "hello?");
    expect(spawned[0].pty.written).toEqual([]);
  });

  it("carries running agents over to new code when dev mode reloads it", () => {
    const { spawn } = fakeSpawner();
    const old = registry(spawn);
    const agent = old.spawnAgent(room, form);
    // A registry made by an earlier version of this file: another class, and agents without newer fields.
    Object.setPrototypeOf(old, class Earlier {}.prototype);
    const raw = (old as unknown as { agents: Map<string, Record<string, unknown>> }).agents.get(agent.id)!;
    delete raw.queue;
    delete raw.said;

    const reg = AgentRegistry.adopt(old);
    expect(reg).toBe(old);
    expect(reg.list()[0].said).toBeNull();
    expect(reg.tell(agent.id, "also check the docs")).toBe("queued");
  });

  describe("talking to an agent", () => {
    /** An agent whose first task is done, so it's free. */
    async function idleAgent() {
      const { spawn, spawned } = fakeSpawner();
      const reg = registry(spawn);
      const agent = reg.spawnAgent(room, form);
      const token = spawned[0].req.env.MINI_OFFICE_AGENT_TOKEN;
      const hook = (event: Parameters<AgentRegistry["handleHook"]>[2]) => reg.handleHook(agent.id, token, event);
      await hook({ hook_event_name: "UserPromptSubmit", prompt: form.task });
      await hook({ hook_event_name: "Stop", last_assistant_message: "Fixed it." });
      return { reg, agent, pty: spawned[0].pty, hook };
    }

    it("types what you said into a free agent's session, then presses Enter", async () => {
      vi.useFakeTimers();
      const { reg, agent, pty } = await idleAgent();
      expect(reg.tell(agent.id, "check today's best-selling stock")).toBe("now");
      // Separate writes: text arriving with its Enter looks like a paste, and the Enter becomes a newline.
      expect(pty.written).toEqual(["check today's best-selling stock"]);
      vi.runAllTimers();
      expect(pty.written).toEqual(["check today's best-selling stock", "\r"]);
      // Busy right away (back to the desk), before Claude's own hook says so.
      expect(reg.list()[0].session).toMatchObject({ phase: "working", request: "check today's best-selling stock" });
    });

    it("holds what you said while the agent is busy or waiting on you, and types it once it's done", async () => {
      vi.useFakeTimers();
      const { reg, agent, pty, hook } = await idleAgent();
      await hook({ hook_event_name: "UserPromptSubmit", prompt: "add a test" });
      expect(reg.tell(agent.id, "then update the docs")).toBe("queued");
      void hook({ hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command: "npm test" } });
      expect(reg.tell(agent.id, "and the changelog")).toBe("queued");
      // Nothing typed: it would land in Claude's permission menu.
      expect(pty.written).toEqual([]);

      reg.answer(agent.id, reg.list()[0].session.ask!.id, true);
      await hook({ hook_event_name: "Stop", last_assistant_message: "Test added." });
      vi.runAllTimers();
      expect(pty.written).toEqual(["then update the docs", "\r"]); // one at a time
      await hook({ hook_event_name: "UserPromptSubmit", prompt: "then update the docs" });
      await hook({ hook_event_name: "Stop", last_assistant_message: "Docs updated." });
      vi.runAllTimers();
      expect(pty.written.slice(2)).toEqual(["and the changelog", "\r"]);
    });

    it("says Claude's answer to what you said, and only that", async () => {
      const { reg, agent, hook } = await idleAgent();
      // Finishing the spawn task wasn't an answer to anything you said.
      expect(reg.list()[0].said).toBeNull();

      reg.tell(agent.id, "check today's best-selling stock");
      await hook({ hook_event_name: "UserPromptSubmit", prompt: "check today's best-selling stock" });
      await hook({ hook_event_name: "Stop", last_assistant_message: "NVDA, up 4% today." });
      const said = reg.list()[0].said;
      expect(said).toMatchObject({ text: "NVDA, up 4% today." });

      // A prompt typed in the terminal isn't one you said; its answer stays on the screen.
      await hook({ hook_event_name: "UserPromptSubmit", prompt: "thanks" });
      await hook({ hook_event_name: "Stop", last_assistant_message: "You're welcome!" });
      expect(reg.list()[0].said).toEqual(said);
    });

    it("doesn't mistake the answer to some other prompt for its answer to you", async () => {
      const { reg, agent, hook } = await idleAgent();
      reg.tell(agent.id, "check the stock");
      // Claude never got that prompt (say the input box wasn't ready); you typed something else in the terminal.
      await hook({ hook_event_name: "UserPromptSubmit", prompt: "thanks" });
      await hook({ hook_event_name: "Stop", last_assistant_message: "You're welcome!" });
      expect(reg.list()[0].said).toBeNull();
    });

    it("keeps a long answer to a size the browser can be sent on every update", async () => {
      const { reg, agent, hook } = await idleAgent();
      reg.tell(agent.id, "explain everything");
      await hook({ hook_event_name: "UserPromptSubmit", prompt: "explain everything" });
      await hook({ hook_event_name: "Stop", last_assistant_message: "word ".repeat(10_000) });
      expect(reg.list()[0].said!.text.length).toBeLessThanOrEqual(4000);
    });

    it("types only plain words: no control keys, and no leading ! or / that would switch Claude Code's mode", async () => {
      const { reg, agent, pty } = await idleAgent();
      expect(reg.tell(agent.id, "  !rm -rf / \x1b[A\x03 please  ")).toBe("now");
      expect(pty.written[0]).toBe("rm -rf / [A please");
      expect(reg.tell(agent.id, " \n ")).toBeNull();
      reg.end(agent.id);
      expect(reg.tell(agent.id, "hello?")).toBeNull();
    });

    it("holds what you said while Claude Code is still starting up", () => {
      const { spawn, spawned } = fakeSpawner();
      const reg = registry(spawn);
      const agent = reg.spawnAgent(room, form);
      expect(reg.tell(agent.id, "also check the docs")).toBe("queued");
      expect(spawned[0].pty.written).toEqual([]);
    });
  });
});
