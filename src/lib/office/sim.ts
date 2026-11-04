import type { Vec } from "./util";
import type { Pose } from "./character";
import type { Employee } from "./employees";
import { DESKS, POIS, PORTAL, type Activity, type DeskSlot, type Dir, type IconName, type Poi } from "./layout";
import { findPath } from "./pathfinding";

/** Walking speed in tiles per second. */
const SPEED = 1.7;

/** What the agent's Claude Code session is doing (mirrors the server's SessionPhase). */
export type Phase = "starting" | "trust" | "working" | "permission" | "idle" | "ended";

/** Busy sessions keep their agent at the desk. */
const isBusy = (phase: Phase) => phase !== "idle" && phase !== "ended";

export interface AgentStatus {
  id: string;
  activity: Activity;
  label: string;
}

export interface Agent {
  emp: Employee;
  desk: DeskSlot;
  phase: Phase;
  pos: Vec;
  dir: Dir;
  mode: "desk" | "walk" | "poi";
  heading: "poi" | "desk" | "portal";
  poi: Poi | null;
  lastActivity: Activity | null;
  path: Vec[];
  /** Re-plan toward `heading` at the next waypoint (the session changed mid-walk). */
  replan: boolean;
  /** Seconds left at the desk (idle) or at the current spot. */
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
const snap = (v: number) => Math.round(v * 2) / 2;

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
 * One room's people. Agents arrive through the portal, sit at their desk while
 * their session is busy, wander off for a break when it's idle, and walk back
 * out through the portal when it ends.
 */
export class OfficeSim {
  readonly agents: Agent[] = [];
  /** When true idle agents stay at their desk (prefers-reduced-motion). */
  private calm = false;
  private occupied = new Set<string>();
  private listeners = new Set<() => void>();
  private snapshot: AgentStatus[] = [];
  private dirty = false;

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

  /** Match the room's agents to the server: new ones arrive, phases update, missing ones leave. */
  syncAgents(people: { emp: Employee; deskIndex: number; phase: Phase }[]) {
    const wanted = new Map(people.map((p) => [p.emp.id, p]));
    for (const a of this.agents) {
      const next = wanted.get(a.emp.id);
      this.setPhase(a, next ? next.phase : "ended");
    }
    for (const p of people) {
      if (p.phase === "ended" || this.agents.some((a) => a.emp.id === p.emp.id)) continue;
      this.arrive(p.emp, DESKS[p.deskIndex] ?? DESKS[0], p.phase);
    }
    this.flush();
  }

  update(dt: number) {
    for (const a of [...this.agents]) this.step(a, dt);
    this.flush();
  }

  private flush() {
    if (!this.dirty) return;
    this.dirty = false;
    this.snapshot = this.agents.map((a) => a.status);
    for (const l of this.listeners) l();
  }

  private arrive(emp: Employee, desk: DeskSlot, phase: Phase) {
    const agent: Agent = {
      emp,
      desk,
      phase,
      pos: { ...PORTAL },
      dir: "NW",
      mode: "walk",
      heading: "desk",
      poi: null,
      lastActivity: null,
      path: [...findPath(PORTAL, desk.approach), { ...desk.seat }],
      replan: false,
      timer: 0,
      duration: 0,
      t: Math.random() * 5,
      walkT: 0,
      nextBlink: rand(1, 4),
      blinkLeft: 0,
      bubble: null,
      status: { id: emp.id, activity: "walking", label: "Arriving" },
    };
    this.agents.push(agent);
    this.dirty = true;
  }

  private setPhase(a: Agent, phase: Phase) {
    if (a.phase === phase) return;
    a.phase = phase;
    if (phase === "ended") {
      this.headFor(a, "portal");
    } else if (isBusy(phase) && a.heading === "poi") {
      this.headFor(a, "desk");
    } else if (phase === "idle" && a.mode === "desk") {
      a.timer = rand(3, 8);
    }
    if (a.mode === "desk") this.setStatus(a, "working", a.emp.focus);
  }

  /** Send an agent to its desk or out through the portal from wherever it is. */
  private headFor(a: Agent, target: "desk" | "portal") {
    if (a.heading === target && a.mode === "walk") return;
    if (a.mode === "walk") {
      // Finish the current leg, then re-plan from that waypoint.
      a.heading = target;
      a.replan = true;
      return;
    }
    const start: Vec[] = [];
    if (a.mode === "desk") start.push(a.desk.approach);
    if (a.mode === "poi" && a.poi) {
      this.occupied.delete(a.poi.id);
      start.push(...[...a.poi.enter].reverse().slice(1), a.poi.stand);
      a.poi = null;
    }
    const from = start.at(-1) ?? { x: snap(a.pos.x), y: snap(a.pos.y) };
    a.path = [...start, ...this.route(from, target, a)];
    a.heading = target;
    a.mode = "walk";
    this.setStatus(a, "walking", target === "portal" ? "Leaving" : "Heading back to desk");
  }

  private route(from: Vec, target: "desk" | "portal", a: Agent): Vec[] {
    return target === "portal" ? findPath(from, PORTAL) : [...findPath(from, a.desk.approach), { ...a.desk.seat }];
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
        if (a.phase === "idle" && !this.calm && (a.timer -= dt) <= 0) this.takeBreak(a);
        break;
      case "poi":
        if ((a.timer -= dt) <= 0) this.headFor(a, "desk");
        break;
      case "walk":
        this.walk(a, dt);
        break;
    }
  }

  private takeBreak(a: Agent) {
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
        if (a.replan) {
          a.replan = false;
          if (a.poi) this.occupied.delete(a.poi.id);
          a.poi = null;
          const target2 = a.heading === "portal" ? "portal" : "desk";
          a.heading = target2;
          a.path = this.route({ x: snap(a.pos.x), y: snap(a.pos.y) }, target2, a);
          this.setStatus(a, "walking", target2 === "portal" ? "Leaving" : "Heading back to desk");
        }
      } else {
        a.pos = { x: a.pos.x + (dx / dist) * remaining, y: a.pos.y + (dy / dist) * remaining };
        remaining = 0;
      }
    }
    if (a.path.length === 0) this.arrived(a);
  }

  private arrived(a: Agent) {
    if (a.heading === "portal") {
      this.agents.splice(this.agents.indexOf(a), 1);
      this.dirty = true;
      return;
    }
    if (a.heading === "poi" && a.poi) {
      a.mode = "poi";
      a.dir = a.poi.facing;
      a.duration = a.timer = rand(...a.poi.duration);
      this.say(a, a.poi.icon, 2.6);
      this.setStatus(a, a.poi.activity, a.poi.label);
      return;
    }
    a.mode = "desk";
    a.dir = a.desk.facing;
    a.timer = rand(6, 14);
    this.setStatus(a, "working", a.emp.focus);
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
  return a.mode === "desk" && a.phase === "working";
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
