"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import { renderBackground } from "@/lib/office/background";
import { HEAD_TOP } from "@/lib/office/character";
import { EMPLOYEES } from "@/lib/office/employees";
import { RES } from "@/lib/office/iso";
import { BUFFER_H, BUFFER_W } from "@/lib/office/layout";
import { hitTest, renderScene, type Anchors, type View } from "@/lib/office/render";
import type { OfficeViewProps } from "./types";

export function OfficeCanvas({ sim, statuses, selectedId, hoveredId, onHover, onSelect }: OfficeViewProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tagRefs = useRef(new Map<string, HTMLDivElement>());
  const viewRef = useRef<View>({ hoveredId: null, selectedId: null });
  const anchorsRef = useRef<Anchors>(new Map());
  /** CSS pixels per buffer pixel. */
  const scaleRef = useRef(1);

  useEffect(() => {
    viewRef.current = { hoveredId, selectedId };
  }, [hoveredId, selectedId]);

  // Size the canvas to the stage. Prefer whole device-pixel multiples so every
  // art pixel is the same size; otherwise oversample and let the browser
  // smooth the final downscale (crisper than uneven nearest-neighbour).
  useEffect(() => {
    const stage = stageRef.current!;
    const frame = frameRef.current!;
    const canvas = canvasRef.current!;
    const fit = () => {
      const cs = getComputedStyle(stage);
      const availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const availH = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const dpr = window.devicePixelRatio || 1;
      const fitScale = Math.max(0.25, Math.min(availW / BUFFER_W, availH / BUFFER_H));
      const device = fitScale * dpr;
      let k: number;
      let css: number;
      if (device >= 1 && device - Math.floor(device) < 0.2) {
        k = Math.floor(device);
        css = k / dpr;
      } else {
        k = Math.max(1, Math.ceil(device));
        css = fitScale;
      }
      canvas.width = BUFFER_W * k;
      canvas.height = BUFFER_H * k;
      canvas.style.imageRendering = css * dpr === k ? "pixelated" : "auto";
      frame.style.width = `${BUFFER_W * css}px`;
      frame.style.height = `${BUFFER_H * css}px`;
      scaleRef.current = css;
    };
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    window.addEventListener("resize", fit);
    fit();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const buffer = document.createElement("canvas");
    buffer.width = BUFFER_W;
    buffer.height = BUFFER_H;
    const bctx = buffer.getContext("2d")!;
    const background = renderBackground();

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      sim.update(dt);
      const anchors = renderScene(bctx, background, sim, viewRef.current, now / 1000, new Date());
      anchorsRef.current = anchors;

      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(buffer, 0, 0, canvas.width, canvas.height);

      const s = scaleRef.current;
      for (const [id, el] of tagRefs.current) {
        const p = anchors.get(id);
        if (!p) continue;
        const x = Math.round(p.x * s);
        const y = Math.round((p.y + HEAD_TOP - 16 * RES) * s);
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sim]);

  const pick = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const bx = ((e.clientX - rect.left) / rect.width) * BUFFER_W;
    const by = ((e.clientY - rect.top) / rect.height) * BUFFER_H;
    return hitTest(anchorsRef.current, bx, by);
  };

  return (
    <div
      ref={stageRef}
      className="stage relative flex aspect-[384/268] w-full items-center justify-center overflow-hidden p-3 lg:aspect-auto lg:min-h-0 lg:flex-1 lg:p-6"
    >
      <div ref={frameRef} className="relative">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Isometric pixel-art office with ${EMPLOYEES.length} employees at work`}
          className="absolute inset-0 h-full w-full"
          style={{ cursor: hoveredId ? "pointer" : "default" }}
          onPointerMove={(e) => {
            const id = pick(e);
            if (id !== hoveredId) onHover(id);
          }}
          onPointerLeave={() => onHover(null)}
          onClick={(e) => {
            const id = pick(e);
            onSelect(id === selectedId ? null : id);
          }}
        />
        {statuses.map((s) => {
          const emp = EMPLOYEES.find((e) => e.id === s.id)!;
          const visible = s.id === hoveredId || s.id === selectedId;
          return (
            <div
              key={s.id}
              ref={(el) => {
                if (el) tagRefs.current.set(s.id, el);
                else tagRefs.current.delete(s.id);
              }}
              aria-hidden
              className={`pointer-events-none absolute left-0 top-0 whitespace-nowrap border-2 border-[#1d1a2b] bg-ink px-2 py-1 text-center text-[#1d1a2b] shadow-[3px_3px_0_0_rgba(0,0,0,0.35)] transition-opacity duration-150 ${
                visible ? "opacity-100" : "opacity-0"
              }`}
            >
              <div className="font-pixel text-sm leading-none">{emp.name}</div>
              <div className="mt-1 font-mono text-[10px] leading-none text-[#4b4766]">{s.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
