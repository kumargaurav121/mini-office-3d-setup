import type { Vec } from "./iso";
import type { Pose } from "./character";
import { EMPLOYEES, type Employee } from "./employees";
import { DESKS, POIS, type Activity, type DeskSlot, type Dir, type IconName, type Poi } from "./layout";
import { findPath } from "./pathfinding";

/** Walking speed in tiles per second. */
const SPEED = 1.7;

export interface AgentStatus {
  id: string;
  activity: Activity;
  label: string;
}

export interface Agent {
  emp: Employee;
  desk: DeskSlot;
  pos: Vec;
  dir: Dir;
  mode: "desk" | "walk" | "poi";
  heading: "poi" | "desk";
  poi: Poi | null;
  lastActivity: Activity | null;
  path: Vec[];
  /** Seconds left at the desk or at the current spot. */
  timer: number;
  duration: number;
  t: number;
  walkT: number;
  nextBlink: number;
  blinkLeft: number;
  bubble: { icon: IconName; age: number; life: number } | null;
  status: AgentStatus;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function dirFor(dx: number, dy: number): Dir {
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "SE" : "NW";
  return dy > 0 ? "SW" : "NE";
}

function pickWeighted(pois: Poi[]): Poi {
  const total = pois.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of pois) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return pois[pois.length - 1];
}

/**
 * Drives the employees: work at the desk for a while, wander to a point of
 * interest, hang out, walk back. Construction is deterministic (it also runs
 * during SSR); all randomness starts on the first update().
 */
export class OfficeSim {
  readonly agents: Agent[];
  /** When true nobody leaves their desk (prefers-reduced-motion). */
  private calm = false;
  private occupied = new Set<string>();
  private listeners = new Set<() => void>();
  private snapshot: AgentStatus[];
  private dirty = false;
  private started = false;

  constructor(employees: Employee[] = EMPLOYEES) {
    if (employees.length > DESKS.length) {
      throw new Error(`OfficeSim: ${employees.length} employees but only ${DESKS.length} desks in layout.ts`);
    }
    this.agents = employees.map((emp, i) => {
      const desk = DESKS[i];
      return {
        emp,
        desk,
        pos: { ...desk.seat },
        dir: desk.facing,
        mode: "desk",
        heading: "desk",
        poi: null,
        lastActivity: null,
        path: [],
        timer: 0,
        duration: 0,
        t: i * 1.7,
        walkT: 0,
        nextBlink: 2 + i,
        blinkLeft: 0,
        bubble: null,
        status: { id: emp.id, activity: "working", label: emp.focus },
      };
    });
    this.snapshot = this.agents.map((a) => a.status);
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  getSnapshot = () => this.snapshot;

  setCalm(calm: boolean) {
    this.calm = calm;
  }

  update(dt: number) {
    if (!this.started) {
      this.started = true;
      for (const a of this.agents) a.timer = rand(3, 16);
    }
    for (const a of this.agents) this.step(a, dt);
    if (this.dirty) {
      this.dirty = false;
      this.snapshot = this.agents.map((a) => a.status);
      for (const l of this.listeners) l();
    }
  }

  private step(a: Agent, dt: number) {
    a.t += dt;
    if (a.blinkLeft > 0) {
      a.blinkLeft -= dt;
    } else if ((a.nextBlink -= dt) <= 0) {
      a.blinkLeft = 0.14;
      a.nextBlink = rand(2.5, 5.5);
    }
    if (a.bubble && (a.bubble.age += dt) >= a.bubble.life) a.bubble = null;

    switch (a.mode) {
      case "desk":
        a.timer -= dt;
        if (!a.bubble && Math.random() < dt / 35) this.say(a, this.deskEmote(a));
        if (a.timer <= 0 && !this.calm) this.leaveDesk(a);
        break;
      case "poi":
        a.timer -= dt;
        if (a.timer <= 0) this.leavePoi(a);
        break;
      case "walk":
        this.walk(a, dt);
        break;
    }
  }

  private deskEmote(a: Agent): IconName {
    if (a.emp.look.accessory === "headphones" && Math.random() < 0.6) return "music";
    return Math.random() < 0.65 ? "idea" : "heart";
  }

  private leaveDesk(a: Agent) {
    const options = POIS.filter((p) => !this.occupied.has(p.id) && p.activity !== a.lastActivity);
    if (options.length === 0) {
      a.timer = rand(4, 8);
      return;
    }
    const poi = pickWeighted(options);
    this.occupied.add(poi.id);
    a.poi = poi;
    a.lastActivity = poi.activity;
    a.heading = "poi";
    a.path = [a.desk.approach, ...findPath(a.desk.approach, poi.stand), ...poi.enter];
    a.mode = "walk";
    this.setStatus(a, "walking", `Heading to ${poi.place}`);
  }

  private leavePoi(a: Agent) {
    const poi = a.poi!;
    this.occupied.delete(poi.id);
    const back = [...poi.enter].reverse().slice(1);
    a.path = [...back, poi.stand, ...findPath(poi.stand, a.desk.approach), { ...a.desk.seat }];
    a.poi = null;
    a.heading = "desk";
    a.mode = "walk";
    this.setStatus(a, "walking", "Heading back to desk");
  }

  private walk(a: Agent, dt: number) {
    let remaining = SPEED * dt;
    a.walkT += dt;
    while (remaining > 0 && a.path.length > 0) {
      const target = a.path[0];
      const dx = target.x - a.pos.x;
      const dy = target.y - a.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1e-6) a.dir = dirFor(dx, dy);
      if (dist <= remaining) {
        a.pos = { x: target.x, y: target.y };
        a.path.shift();
        remaining -= dist;
      } else {
        a.pos = { x: a.pos.x + (dx / dist) * remaining, y: a.pos.y + (dy / dist) * remaining };
        remaining = 0;
      }
    }
    if (a.path.length === 0) this.arrive(a);
  }

  private arrive(a: Agent) {
    if (a.heading === "poi" && a.poi) {
      a.mode = "poi";
      a.dir = a.poi.facing;
      a.duration = a.timer = rand(...a.poi.duration);
      this.say(a, a.poi.icon, 2.6);
      this.setStatus(a, a.poi.activity, a.poi.label);
    } else {
      a.mode = "desk";
      a.dir = a.desk.facing;
      a.timer = rand(14, 30);
      this.setStatus(a, "working", a.emp.focus);
    }
  }

  private say(a: Agent, icon: IconName, life = 2.2) {
    a.bubble = { icon, age: 0, life };
  }

  private setStatus(a: Agent, activity: Activity, label: string) {
    a.status = { id: a.emp.id, activity, label };
    this.dirty = true;
  }
}

export function isSeated(a: Agent): boolean {
  return a.mode === "desk" || (a.mode === "poi" && a.poi?.activity === "couch");
}

export function isTyping(a: Agent): boolean {
  return a.mode === "desk" && a.t % 9 < 6.5;
}

/** 0..1 through the current activity at a point of interest. */
function progress(a: Agent): number {
  return a.duration > 0 ? 1 - a.timer / a.duration : 0;
}

export function isBrewing(a: Agent): boolean {
  return a.mode === "poi" && a.poi?.id === "coffee" && progress(a) < 0.45;
}

export function agentPose(a: Agent): { pose: Pose; frame: number } {
  if (a.mode === "walk") return { pose: "walk", frame: Math.floor(a.walkT * 8) % 4 };
  if (a.mode === "desk") {
    return isTyping(a) ? { pose: "type", frame: Math.floor(a.t * 7) % 2 } : { pose: "sit", frame: 0 };
  }
  const p = progress(a);
  const sip = a.t % 2.6 < 1.3;
  switch (a.poi?.activity) {
    case "coffee":
      return { pose: p > 0.45 && sip ? "drink" : "stand", frame: 0 };
    case "water":
      return { pose: p > 0.2 && sip ? "drink" : "stand", frame: 0 };
    case "whiteboard":
      return { pose: "write", frame: Math.floor(a.t * 3) % 2 };
    case "books":
      return { pose: p < 0.3 ? "write" : "stand", frame: 0 };
    case "couch":
      return { pose: "sit", frame: 0 };
    default:
      return { pose: "stand", frame: 0 };
  }
}
