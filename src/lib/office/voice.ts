// Push-to-talk: working out who a spoken sentence is for and what they're asked.
// Pure, so it can be tested without a microphone.

import type { Delivery } from "@/server/agents/registry";
import type { Phase } from "./sim";

export interface Addressee {
  id: string;
  name: string;
  roomId: string;
}

export interface VoiceContext {
  agents: Addressee[];
  /** Who you mean when you don't say a name, best first (e.g. the watched agent, then the selected one). */
  preferred: (string | null)[];
  /** Room in focus: breaks ties between agents with the same name. */
  openRoomId: string;
}

export interface VoiceCommand {
  agentId: string | null;
  /** "status": asking what they're up to (answered from what we know). "task": anything else, for Claude. */
  intent: "status" | "task";
  /** What was said, minus the name. */
  text: string;
}

/** Ways of asking what someone's up to, matched against the start of a short sentence (see `normalise`). */
const STATUS = [
  /^$/, // just the name: "Ada?"
  /^(what|whatre|whats) (are |is )?(you|ya|u) (doing|up to|working on)\b/,
  /^whatcha (doing|up to|working on)\b/,
  /^(hows|how is|how are) (it|things|you|everything|the work|your work|the task|your task)\b/,
  /^(whats|what is) (your |the )?(status|progress|update|eta)\b/,
  /^(status|progress|update)\b/,
  /^(are|r) (you|u) (done|finished|busy|there|ok|okay|working|still working|almost done)\b/,
  /^(you|u) (done|finished|busy|there)\b/,
  /^(did|have) you (finish|finished|get done)\b/,
  /^(any )?(news|progress|updates)\b/,
  /^where are (you|we) (at|with)\b/,
];
/** Longer than this and it's a request that merely starts like a status question. */
const STATUS_MAX_WORDS = 8;

/** Lowercase words without punctuation; "what're" becomes "whatre". */
const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

function intentOf(text: string): VoiceCommand["intent"] {
  const said = normalise(text);
  const short = said.split(" ").length <= STATUS_MAX_WORDS;
  return short && STATUS.some((re) => re.test(said)) ? "status" : "task";
}

/** Words people put before a name ("hey Ada…"). */
const FILLERS = new Set(["hey", "hi", "hello", "ok", "okay", "yo", "so", "um", "uh", "oh"]);

/**
 * Everyday words a few letters off a name ("can"/Ken, "add"/Ada). A misheard
 * name is only accepted if it isn't one of these.
 */
const COMMON = new Set(
  "a an and add are as ask at be but by can could did do does for get give go had has have he her him his how i if in is it let lets look make me my no not now of on or our please run see she show so stop tell than that the then there they this to up us was we were what when where which who why will with would yes you your".split(
    " ",
  ),
);

/** Lowercase letters and digits only, for comparing spoken words. */
const plain = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** Edit distance between two words. */
function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** How many letters `heard` may be off from `name` by: more for longer names; a short one must start right. */
function typosAllowed(name: string, heard: string): number {
  if (name.length <= 3) return name[0] === heard[0] ? 1 : 0;
  return name.length <= 7 ? 1 : 2;
}

/** How far `heard` is from the name `name` (both already plain words), or Infinity if it's no match. */
function nameDistance(name: string[], heard: string[]): number {
  if (heard.length !== name.length) return Infinity;
  let total = 0;
  for (let i = 0; i < name.length; i++) {
    if (name[i] === heard[i]) continue;
    const d = distance(name[i], heard[i]);
    if (d > typosAllowed(name[i], heard[i]) || COMMON.has(heard[i])) return Infinity;
    total += d;
  }
  return total;
}

interface Match {
  agent: Addressee;
  /** Letters off from the real name (0 = heard exactly). */
  misheard: number;
  /** Words the name took up. */
  length: number;
}

/**
 * Agents whose name was said at the start (after any "hey") or at the very end.
 * Only the start forgives mishearing: a request's last word is often just a word ("…on linux").
 */
function namesAt(words: string[], from: number, at: "start" | "end", agents: Addressee[]): Match[] {
  const found: Match[] = [];
  for (const agent of agents) {
    const name = agent.name.split(/\s+/).map(plain);
    const said = at === "start" ? words.slice(from, from + name.length) : words.slice(from).slice(-name.length);
    const d = nameDistance(name, said.map(plain));
    if (d === 0 || (d < Infinity && at === "start")) found.push({ agent, misheard: d, length: name.length });
  }
  return found;
}

/** The closest match; a tie goes to the room in focus, and is otherwise a toss-up (null). */
function closest(found: Match[], openRoomId: string): Match | null {
  found.sort((a, b) => a.misheard - b.misheard || b.length - a.length);
  let best = found.filter((m) => m.misheard === found[0].misheard && m.length === found[0].length);
  if (best.length > 1) best = best.filter((m) => m.agent.roomId === openRoomId);
  return best.length === 1 ? best[0] : null;
}

export function parseCommand(transcript: string, ctx: VoiceContext): VoiceCommand {
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  let from = 0;
  while (from < words.length - 1 && FILLERS.has(plain(words[from]))) from++;
  for (const at of ["start", "end"] as const) {
    const found = namesAt(words, from, at, ctx.agents);
    if (found.length === 0) continue;
    const match = closest(found, ctx.openRoomId);
    const length = match?.length ?? found[0].length;
    const rest = at === "start" ? words.slice(from + length) : words.slice(from, words.length - length);
    return command(match?.agent.id ?? null, rest.join(" "));
  }
  const fallback = ctx.preferred.find((id) => ctx.agents.some((a) => a.id === id)) ?? null;
  return command(fallback, transcript);
}

function command(agentId: string | null, words: string): VoiceCommand {
  const text = tidy(words);
  return { agentId, intent: intentOf(text), text };
}

/** Drop the punctuation left dangling where a name was cut out. */
const tidy = (text: string) => text.trim().replace(/^[\s,.;:!-]+/, "").replace(/[\s,;:-]+$/, "");

/** Markdown as plain prose: no code blocks, headings, tables, emphasis, links or list markers. */
function prose(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/^\s*(#{1,6}\s|\|).*$/gm, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The opening sentences of a reply that fit in `max` characters, for a speech bubble. */
export function shortReply(reply: string, max = 160): string {
  const sentences = prose(reply).split(/(?<=[.!?])\s+/).filter(Boolean);
  let out = "";
  for (const s of sentences) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > max) break;
    out = next;
  }
  if (out || sentences.length === 0) return out;
  // Even the first sentence is too long: cut it at a word.
  for (const word of sentences[0].split(" ")) {
    if (out.length + word.length + 2 > max) break;
    out = out ? `${out} ${word}` : word;
  }
  return `${out}…`;
}

/** What we know about an agent: enough for it to say what it's up to. */
export interface AgentState {
  /** What it was spawned to do. */
  task: string;
  session: {
    phase: Phase;
    activity: string;
    ask: { title: string } | null;
    /** The latest thing it was asked, if any since the task. */
    request: string | null;
    /** Claude's final message for the last thing it finished. */
    lastReply: string | null;
  };
  /** What it's doing on a break, if it's away from its desk ("Grabbing a coffee"). */
  away?: string;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The agent's answer to "what are you doing?", from its live session. */
export function statusReply({ task, session, away }: AgentState): string {
  const topic = shortReply(session.request ?? task, 60);
  switch (session.phase) {
    case "starting":
      return "Just getting set up.";
    case "trust":
      return "Waiting on you. Can I trust this folder?";
    case "permission":
      return `Waiting on you. Can I ${lowerFirst(session.ask?.title ?? "carry on")}?`;
    case "working":
      if (session.activity === "Asking in the terminal") return "I've asked you something in my terminal.";
      return `${session.activity === "Thinking…" ? "Thinking it through" : session.activity}. I'm on “${topic}”.`;
    case "idle":
      if (away) return `${away}. All done, what's next?`;
      return session.lastReply ? `Done! ${shortReply(session.lastReply, 140)}` : "All done. What's next?";
    case "ended":
      return "Heading home.";
  }
}

/** Requests that are really questions: "let me check" rather than "on it". */
const QUESTION = /^(can|could|would|will|what|whats|which|who|whos|when|where|why|how|hows|is|are|do|does|did|check|find|look|see)\b/;

/** The agent's reply the moment it's given something to do: on it now, or when. */
export function ackLine(request: string, when: Delivery, phase: Phase): string {
  if (when === "now") return QUESTION.test(normalise(request)) || request.trim().endsWith("?") ? "Okay, let me check." : "On it!";
  if (phase === "permission" || phase === "trust") return "Sure, once you've answered my question.";
  if (phase === "starting") return "Sure, as soon as I'm set up.";
  return "I'll get to it right after this.";
}
