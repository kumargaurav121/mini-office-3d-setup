import { ICON_COLORS, ICONS } from "@/lib/office/icons";
import type { IconName } from "@/lib/office/layout";

/** The 7x7 bubble icons as crisp SVG, for HTML overlays. */
export function PixelIcon({ name, size = 21 }: { name: IconName; size?: number }) {
  const rows = ICONS[name];
  return (
    <svg viewBox="0 0 7 7" width={size} height={size} shapeRendering="crispEdges" aria-hidden>
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) =>
          ch === "." ? null : <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={ICON_COLORS[ch]} />,
        ),
      )}
    </svg>
  );
}
