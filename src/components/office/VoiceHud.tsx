"use client";

import type { usePushToTalk } from "./push-to-talk";

/** What you last said, and to whom (null: no one could tell). */
export interface Heard {
  to: string | null;
  text: string;
}

interface Props {
  ptt: ReturnType<typeof usePushToTalk>;
  heard: Heard | null;
}

const BOX = "border-2 border-[#1d1a2b] shadow-[3px_3px_0_0_rgba(0,0,0,0.35)]";

/** The push-to-talk button (top left of the stage) and the caption of what you said (top middle). */
export function VoiceHud({ ptt, heard }: Props) {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-12 flex justify-center px-4" aria-live="polite">
        {ptt.listening ? (
          <p className={`${BOX} flex max-w-xl items-center gap-2 bg-panel px-3 py-1.5 font-mono text-xs text-ink`}>
            <span className="size-2 shrink-0 animate-pulse bg-red-400" aria-hidden />
            <span className="truncate">{ptt.caption || "Listening… say an agent's name"}</span>
          </p>
        ) : (
          heard && (
            <p className={`${BOX} max-w-xl truncate px-3 py-1.5 font-mono text-xs ${heard.to ? "bg-panel text-ink" : "bg-accent text-[#1d1a2b]"}`}>
              {heard.to ? (
                <>
                  <span className="text-muted">You → </span>
                  <span className="font-pixel text-sm">{heard.to}</span>: “{heard.text}”
                </>
              ) : (
                <>Who&apos;s that for? Start with a name, like “Ada, what are you doing?”</>
              )}
            </p>
          )
        )}
      </div>
      <div className="pointer-events-none absolute top-0 left-0 p-3">
        <button
          type="button"
          disabled={!ptt.supported}
          title={ptt.supported ? "Hold to talk (or hold Space)" : "Talking to agents needs Chrome, Edge or Safari"}
          aria-pressed={ptt.listening}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            ptt.start();
          }}
          onPointerUp={ptt.stop}
          onPointerCancel={ptt.stop}
          onContextMenu={(e) => e.preventDefault()}
          className={`pointer-events-auto flex touch-none items-center gap-2 px-2 py-1 font-mono text-[11px] select-none disabled:opacity-50 ${BOX} ${
            ptt.listening ? "bg-red-400 text-[#1d1a2b]" : "bg-panel text-ink hover:bg-raised"
          }`}
        >
          <MicIcon />
          {ptt.listening ? "Listening…" : "Hold Space to talk"}
        </button>
      </div>
    </>
  );
}

function MicIcon() {
  // 7x8 pixel microphone
  const px = ["..###..", "..###..", "..###..", "#.###.#", "#.###.#", ".#...#.", "...#...", "..###.."];
  return (
    <svg viewBox="0 0 7 8" className="h-3.5 w-3" shapeRendering="crispEdges" aria-hidden>
      {px.flatMap((row, y) =>
        [...row].map((c, x) => (c === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" /> : null)),
      )}
    </svg>
  );
}
