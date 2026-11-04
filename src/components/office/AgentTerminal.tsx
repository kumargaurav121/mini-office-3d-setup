"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { sendInput } from "@/app/agent-actions";
import { TERM_BG, TERM_FG } from "./terminal-paint";
import { registerTerminal } from "./terminals";

/** Must match the size the server gives each agent's pseudo-terminal (src/server/agents). */
const COLS = 100;
const ROWS = 30;

/**
 * An agent's real Claude Code terminal: the server streams the raw output into
 * xterm.js; what you type goes back to the agent, and the wheel scrolls history.
 * The office paints it onto the 3D monitor; this element sits invisibly on top
 * of that monitor to take clicks, typing and scrolling.
 */
export function AgentTerminal({ agentId }: { agentId: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const term = new Terminal({
      cols: COLS,
      rows: ROWS,
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "Menlo, Monaco, 'Geist Mono', monospace",
      scrollback: 5000,
      theme: { background: TERM_BG, foreground: TERM_FG },
    });
    term.open(el);
    const unregister = registerTerminal(agentId, term);

    const stream = new EventSource(`/api/agents/${agentId}/terminal`);
    stream.onmessage = (e) => term.write(JSON.parse(e.data) as string);

    // Send each chunk xterm emits on its own, chained so they arrive in the order typed.
    // Don't merge them: Claude Code reads a burst containing Enter as a paste (Enter = newline).
    let sending: Promise<void> = Promise.resolve();
    const typed = term.onData((data) => {
      sending = sending.then(() => sendInput(agentId, data)).catch(() => undefined);
    });

    return () => {
      unregister();
      typed.dispose();
      stream.close();
      term.dispose();
    };
  }, [agentId]);

  // Keep wheel and clicks here (scroll the terminal, focus it) instead of reaching the 3D camera.
  return (
    <div
      ref={host}
      className="overflow-hidden rounded-sm bg-[#0d1117] p-1"
      onWheel={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}
