"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

// Hold Space (or the mic button) to talk: the browser's speech recognition
// transcribes while you hold, and the sentence is handed over when you let go.
// In Chrome the audio is transcribed by Google's speech service.

/** The parts of the Web Speech API's SpeechRecognition we use (TypeScript's DOM types lack it). */
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionClass = new () => Recognition;

function recognitionClass(): RecognitionClass | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const PROBLEMS: Record<string, string> = {
  "not-allowed": "The microphone is blocked. Allow it from the icon in the address bar, then try again.",
  "service-not-allowed": "This browser won't transcribe speech here. Try Chrome.",
  network: "Couldn't reach the speech service. Chrome needs an internet connection to transcribe.",
  "audio-capture": "No microphone found.",
};

/** Space in these types a space, not talk. */
const TYPING = "input, textarea, select, [contenteditable]:not([contenteditable='false']), .xterm";
/** Controls Space presses, when reached with the keyboard (a mouse click also focuses them, but then Space talks). */
const PRESSABLE = "button, a[href], summary, [role=button], [role=checkbox], [role=radio], [role=switch], [role=tab]";

function spaceIsTheirs(target: EventTarget | null, keyboardFocus: Element | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(TYPING) !== null || (target === keyboardFocus && target.matches(PRESSABLE));
}

/** Speech recognition support never changes during a visit. */
const unchanging = () => () => {};

export function usePushToTalk({ onHeard, onProblem }: { onHeard: (text: string) => void; onProblem: (message: string) => void }) {
  const supported = useSyncExternalStore(unchanging, () => recognitionClass() !== undefined, () => true);
  const [listening, setListening] = useState(false);
  /** What's been heard so far while you hold. */
  const [caption, setCaption] = useState("");
  const active = useRef<Recognition | null>(null);
  const handlers = useRef({ onHeard, onProblem });
  useLayoutEffect(() => {
    handlers.current = { onHeard, onProblem };
  });

  const start = useCallback(() => {
    if (active.current) return;
    const Recognition = recognitionClass();
    if (!Recognition) {
      handlers.current.onProblem("Talking to agents needs speech recognition: use Chrome, Edge or Safari.");
      return;
    }
    const rec = new Recognition();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true; // keep listening through pauses while the key is held
    rec.interimResults = true;
    let finalText = "";
    let latest = "";
    rec.onresult = (e) => {
      let done = "";
      let pending = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) done += r[0].transcript;
        else pending += r[0].transcript;
      }
      finalText = done;
      latest = (done + pending).trim();
      setCaption(latest);
    };
    rec.onerror = (e) => {
      const problem = PROBLEMS[e.error];
      if (problem) handlers.current.onProblem(problem);
    };
    rec.onend = () => {
      active.current = null;
      setListening(false);
      setCaption("");
      const text = (finalText.trim() || latest).trim();
      if (text) handlers.current.onHeard(text);
    };
    active.current = rec;
    setCaption("");
    setListening(true);
    try {
      rec.start();
    } catch {
      active.current = null;
      setListening(false);
    }
  }, []);

  /** Let go: recognition finishes the last words, then hands the sentence over. */
  const stop = useCallback(() => active.current?.stop(), []);

  useEffect(() => {
    // Whether focus arrived by keyboard, judged as it arrives: Chrome shows focus on any key press,
    // so by the time Space is down a clicked button looks keyboard-focused too.
    let keyboardFocus: Element | null = null;
    const focusIn = (e: FocusEvent) => {
      keyboardFocus = e.target instanceof Element && e.target.matches(":focus-visible") ? e.target : null;
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.ctrlKey || e.metaKey || e.altKey || spaceIsTheirs(e.target, keyboardFocus)) return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault(); // no page scroll, and no "click" on a button focused by the mouse
      if (!e.repeat) start();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !active.current) return;
      e.preventDefault();
      stop();
    };
    window.addEventListener("focusin", focusIn);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    // Switching away mid-sentence would otherwise leave the mic on.
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("focusin", focusIn);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", stop);
      stop();
    };
  }, [start, stop]);

  return { supported, listening, caption, start, stop };
}
