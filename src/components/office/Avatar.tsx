"use client";

import { useEffect, useRef } from "react";
import { drawCharacter } from "@/lib/office/character";
import { RES } from "@/lib/office/iso";
import type { Look } from "@/lib/office/employees";

/** Head-and-shoulders portrait using the same sprite as the office. */
export function Avatar({ look }: { look: Look }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawCharacter(ctx, 9 * RES, 26 * RES, look, { dir: "SE", pose: "stand", frame: 0 });
  }, [look]);

  return (
    <canvas
      ref={ref}
      width={18 * RES}
      height={18 * RES}
      aria-hidden
      className="size-[54px] shrink-0 border-2 border-line bg-raised [image-rendering:pixelated]"
    />
  );
}
