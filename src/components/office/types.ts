import type { AgentStatus, OfficeSim } from "@/lib/office/sim";

/** Props shared by the pixel (2D) and 3D office views. The active view ticks the sim. */
export interface OfficeViewProps {
  sim: OfficeSim;
  statuses: AgentStatus[];
  selectedId: string | null;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
}
