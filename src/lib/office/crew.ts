import { EMPLOYEES, type Accessory, type DeskItem, type Employee, type HairStyle } from "./employees";
import { DESKS } from "./layout";
import type { RoomRecord } from "./rooms";
import { hashString } from "./util";

const FIRST = [
  "Noah", "Mei", "Omar", "Lena", "Diego", "Sofia", "Arjun", "Yuki", "Tomas", "Amara", "Felix", "Zara",
  "Hugo", "Ines", "Kofi", "Nadia", "Ravi", "Elena", "Jonas", "Aisha", "Mateo", "Hana", "Liam", "Rosa",
];
const LAST = [
  "Kim", "Okafor", "Silva", "Novak", "Haddad", "Lindqvist", "Rao", "Costa", "Tanaka", "Mensah",
  "Petrov", "Duarte", "Byrne", "Sato", "Adeyemi", "Fischer", "Ortiz", "Larsen",
];
const ROLES: [role: string, focus: string][] = [
  ["Product Designer", "Pushing pixels"],
  ["Frontend Engineer", "Shipping UI"],
  ["Backend Engineer", "Tuning queries"],
  ["Product Manager", "Planning the sprint"],
];
const SKIN = ["#f2c9a0", "#eab98c", "#d9a074", "#c68642", "#a86f4c", "#7a4a32", "#5c3a26"];
const HAIR = ["#2b1c24", "#4a2a1c", "#1e1b26", "#7a4b2a", "#c58b4a", "#e0c27a", "#8a3324", "#2e221f", "#6b6b7a"];
const STYLES: HairStyle[] = ["short", "bob", "long", "bun", "curly"];
const SHIRTS = ["#e8705a", "#3a9d8f", "#7b6fd0", "#f2b33d", "#4f8fd9", "#d9577e", "#5bbf6a", "#ef8f3c", "#6c7a89", "#b5654a"];
const PANTS = ["#2e3a59", "#3b3f58", "#2b2f45", "#39465e", "#4a3b32", "#3f4a3c"];
const ITEMS: DeskItem[] = ["mug", "plant", "books", "notes"];

/** Small seeded PRNG (mulberry32) so a repo always gets the same crew. */
function seeded(text: string): () => number {
  let a = hashString(text) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Agent ids are `<roomId>/<person>`, so they never clash across rooms. */
const agentId = (roomId: string, person: string) => `${roomId}/${person}`;

/** The room an agent belongs to, from its id. */
export function roomIdOfAgent(id: string): string {
  return id.slice(0, id.indexOf("/"));
}

/** The four people working in a room. Ids are scoped to the room so they never clash. */
export function crewForRoom(room: RoomRecord, opts: { main?: boolean } = {}): Employee[] {
  if (opts.main) return EMPLOYEES.map((e) => ({ ...e, id: agentId(room.id, e.id) }));
  const rand = seeded(room.path);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  const firstNames = [...FIRST];
  return DESKS.map((desk, i) => {
    const [role, focus] = ROLES[i % ROLES.length];
    const roll = rand();
    const accessory: Accessory | undefined = roll < 0.25 ? "glasses" : roll < 0.4 ? "headphones" : undefined;
    const first = pick(ITEMS);
    const second = pick(ITEMS.filter((it) => it !== first));
    return {
      id: agentId(room.id, `agent-${desk.index + 1}`),
      name: `${firstNames.splice(Math.floor(rand() * firstNames.length), 1)[0]} ${pick(LAST)}`,
      role,
      focus,
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
  });
}
