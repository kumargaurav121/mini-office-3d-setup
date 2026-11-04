"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** How long a bubble stays up: long enough to read it. */
const readingTime = (text: string) => Math.min(12_000, Math.max(3500, 1500 + text.length * 55));

/** What agents are saying, as speech bubbles over their heads. */
export function useSpeechBubbles() {
  const [lines, setLines] = useState<Partial<Record<string, string>>>({});
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((agentId: string) => {
    window.clearTimeout(timers.current.get(agentId));
    timers.current.delete(agentId);
    setLines((current) => {
      const next = { ...current };
      delete next[agentId];
      return next;
    });
  }, []);

  const say = useCallback(
    (agentId: string, text: string) => {
      window.clearTimeout(timers.current.get(agentId));
      timers.current.set(agentId, window.setTimeout(() => dismiss(agentId), readingTime(text)));
      setLines((current) => ({ ...current, [agentId]: text }));
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending.values()) window.clearTimeout(t);
    };
  }, []);

  return { lines, say, dismiss };
}
