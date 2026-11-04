import type { Accessory, DeskItem, Employee, HairStyle } from "./employees";
import { hashString } from "./util";

const SKIN = ["#f2c9a0", "#eab98c", "#d9a074", "#c68642", "#a86f4c", "#7a4a32", "#5c3a26"];
const HAIR = ["#2b1c24", "#4a2a1c", "#1e1b26", "#7a4b2a", "#c58b4a", "#e0c27a", "#8a3324", "#2e221f", "#6b6b7a"];
const STYLES: HairStyle[] = ["short", "bob", "long", "bun", "curly"];
const SHIRTS = ["#e8705a", "#3a9d8f", "#7b6fd0", "#f2b33d", "#4f8fd9", "#d9577e", "#5bbf6a", "#ef8f3c", "#6c7a89", "#b5654a"];
const PANTS = ["#2e3a59", "#3b3f58", "#2b2f45", "#39465e", "#4a3b32", "#3f4a3c"];
const ITEMS: DeskItem[] = ["mug", "plant", "books", "notes"];

/** Small seeded PRNG (mulberry32) so an agent keeps the same look. */
function seeded(text: string): () => number {
  let a = hashString(text) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MODEL_ROLE: Record<string, string> = {
  default: "Claude Code",
  opus: "Claude Code · Opus",
  sonnet: "Claude Code · Sonnet",
  haiku: "Claude Code · Haiku",
};

/** The character for an agent: its name, plus a look and desk items that stay the same for its id. */
export function agentCharacter(agent: { id: string; name: string; model: string; task?: string }): Employee {
  const rand = seeded(agent.id);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  const roll = rand();
  const accessory: Accessory | undefined = roll < 0.25 ? "glasses" : roll < 0.4 ? "headphones" : undefined;
  const first = pick(ITEMS);
  const second = pick(ITEMS.filter((it) => it !== first));
  return {
    id: agent.id,
    name: agent.name,
    role: MODEL_ROLE[agent.model] ?? "Claude Code",
    focus: agent.task ?? "Working",
    look: {
      skin: pick(SKIN),
      hair: pick(HAIR),
      hairStyle: pick(STYLES),
      shirt: pick(SHIRTS),
      pants: pick(PANTS),
      accessory,
    },
    deskItems: [first, second],
  };
}
