import type { Terminal } from "@xterm/xterm";

// Live xterm.js instances by agent id: the invisible input terminal registers
// here, and the 3D monitor paints from it.
const terminals = new Map<string, Terminal>();

export function registerTerminal(agentId: string, term: Terminal) {
  terminals.set(agentId, term);
  return () => {
    if (terminals.get(agentId) === term) terminals.delete(agentId);
  };
}

export function terminalFor(agentId: string): Terminal | undefined {
  return terminals.get(agentId);
}
