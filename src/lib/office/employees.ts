export type HairStyle = "short" | "bob" | "long" | "bun" | "curly";
export type Accessory = "glasses" | "headphones";
export type DeskItem = "mug" | "plant" | "books" | "notes";

export interface Look {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  shirt: string;
  pants: string;
  accessory?: Accessory;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  /** What their status says while they're heads-down at their desk. */
  focus: string;
  look: Look;
  deskItems: [DeskItem, DeskItem];
}

// Each employee takes the desk at the same index in DESKS (see layout.ts).
export const EMPLOYEES: Employee[] = [
  {
    id: "ava",
    name: "Ava Moreno",
    role: "Product Designer",
    focus: "Pushing pixels",
    look: { skin: "#f2c9a0", hair: "#4a2a1c", hairStyle: "bob", shirt: "#e8705a", pants: "#2e3a59" },
    deskItems: ["plant", "notes"],
  },
  {
    id: "kenji",
    name: "Kenji Watanabe",
    role: "Frontend Engineer",
    focus: "Shipping UI",
    look: {
      skin: "#eab98c",
      hair: "#1e1b26",
      hairStyle: "short",
      shirt: "#3a9d8f",
      pants: "#3b3f58",
      accessory: "headphones",
    },
    deskItems: ["mug", "books"],
  },
  {
    id: "priya",
    name: "Priya Nair",
    role: "Backend Engineer",
    focus: "Tuning queries",
    look: {
      skin: "#a86f4c",
      hair: "#2b1c24",
      hairStyle: "long",
      shirt: "#7b6fd0",
      pants: "#2b2f45",
      accessory: "glasses",
    },
    deskItems: ["notes", "mug"],
  },
  {
    id: "marcus",
    name: "Marcus Bell",
    role: "Product Manager",
    focus: "Planning the sprint",
    look: { skin: "#7a4a32", hair: "#2e221f", hairStyle: "curly", shirt: "#f2b33d", pants: "#39465e" },
    deskItems: ["books", "plant"],
  },
];
