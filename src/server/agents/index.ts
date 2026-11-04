import { chmodSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistry } from "./registry";
import type { HookEvent } from "./session";

/** Size of every agent terminal; the desk monitors are laid out for it. */
export const TERMINAL = { cols: 100, rows: 30 };

// One registry per server process. It lives on globalThis so dev-mode module
// reloads don't orphan running agents.
const g = globalThis as typeof globalThis & { __miniOfficeAgents?: AgentRegistry; __miniOfficeHooks?: Server };

/**
 * Agents' hook scripts report over a Unix socket rather than HTTP: no port to
 * clash with other dev servers, and only this user can open it.
 */
function listenForHooks(registry: AgentRegistry, socketPath: string) {
  if (existsSync(socketPath)) unlinkSync(socketPath);
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      let event: HookEvent;
      try {
        event = JSON.parse(body) as HookEvent;
      } catch {
        res.writeHead(400).end();
        return;
      }
      registry
        .handleHook(String(req.headers["x-agent-id"] ?? ""), String(req.headers["x-agent-token"] ?? ""), event)
        .then((reply) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(reply ?? {})))
        .catch(() => res.writeHead(403).end());
    });
  });
  // No timeout: a permission request waits for the user to click Allow/Deny.
  server.requestTimeout = 0;
  server.listen(socketPath, () => chmodSync(socketPath, 0o600));
  return server;
}

/** A folder only this user can enter, so the socket inside is private from the moment it exists. */
function privateSocketPath(): string {
  const dir = join(tmpdir(), `mini-office-${process.pid}`);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  return join(dir, "hooks.sock");
}

/**
 * The server's environment minus markers a parent Claude Code session sets (if
 * the dev server was started from one), so each agent is a normal top-level
 * session with its transcript saved and resumable.
 */
function agentEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== "CLAUDECODE" && k !== "CLAUDE_CODE_CHILD_SESSION") env[k] = v;
  }
  return env;
}

/** The registry, created (with its hook socket) on first use. */
export async function agents(): Promise<AgentRegistry> {
  if (!g.__miniOfficeAgents) {
    const pty = await import("node-pty");
    const hookSocket = privateSocketPath();
    const registry = new AgentRegistry({
      spawn: (req) =>
        pty.spawn("claude", req.args, {
          name: "xterm-256color",
          cols: TERMINAL.cols,
          rows: TERMINAL.rows,
          cwd: req.cwd,
          env: { ...agentEnv(), TERM: "xterm-256color", COLORTERM: "truecolor", ...req.env },
        }),
      hookCommand: `node ${JSON.stringify(join(process.cwd(), "scripts", "office-hook.mjs"))}`,
      hookSocket,
    });
    g.__miniOfficeHooks = listenForHooks(registry, hookSocket);
    g.__miniOfficeAgents = registry;
    // Agents die with the server rather than running on unattended.
    process.once("exit", () => registry.killAll());
  }
  return g.__miniOfficeAgents;
}

/** The registry if it already exists (read-only endpoints don't need to create it). */
export function existingAgents(): AgentRegistry | undefined {
  return g.__miniOfficeAgents;
}

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Agents run commands on this machine, so their endpoints only answer requests
 * addressed to localhost (blocks other machines and DNS-rebinding pages).
 */
export function isLocalHost(host: string | null): boolean {
  if (!host) return false;
  const name = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  return LOCAL.has(name);
}
