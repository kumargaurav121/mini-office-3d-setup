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
