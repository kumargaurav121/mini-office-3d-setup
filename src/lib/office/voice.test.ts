import { describe, expect, it } from "vitest";
import { ackLine, parseCommand, shortReply, statusReply, type AgentState } from "./voice";

const ada = { id: "a1", name: "Ada", roomId: "main" };
const linus = { id: "l1", name: "Linus", roomId: "main" };
const ken = { id: "k1", name: "Ken", roomId: "api" };
const office = { agents: [ada, linus, ken], preferred: [], openRoomId: "main" };

describe("who a spoken command is for", () => {
  it("is the agent named at the start, and the name isn't part of the request", () => {
    expect(parseCommand("Ada, can you check today's best-selling stock?", office)).toMatchObject({
      agentId: "a1",
      text: "can you check today's best-selling stock?",
    });
    expect(parseCommand("hey linus run the tests", office)).toMatchObject({ agentId: "l1", text: "run the tests" });
  });

  it("forgives a slightly misheard name, but not an everyday word that sounds like one", () => {
    expect(parseCommand("Minus, what are you doing?", office).agentId).toBe("l1");
    // "can" is one letter off "Ken", and "add" off "Ada", but they're ordinary words here.
    expect(parseCommand("can you check the build", office).agentId).toBeNull();
    expect(parseCommand("add a test for login", office).agentId).toBeNull();
    // Short names may be one letter off only if they start right.
    expect(parseCommand("Adah, run the tests", office).agentId).toBe("a1");
    expect(parseCommand("Ida, run the tests", office).agentId).toBeNull();
  });

  it("can be named at the end instead", () => {
    expect(parseCommand("what are you doing, Ada?", office)).toMatchObject({ agentId: "a1", text: "what are you doing" });
    // At the end it must be exact: the last word of a request is often just a word.
    expect(parseCommand("run the tests on linux", { ...office, preferred: ["k1"] })).toMatchObject({
      agentId: "k1",
      text: "run the tests on linux",
    });
  });

  it("is the watched or selected agent when no name is said", () => {
    expect(parseCommand("run the tests", { ...office, preferred: [null, "k1"] })).toMatchObject({
      agentId: "k1",
      text: "run the tests",
    });
    expect(parseCommand("run the tests", { ...office, preferred: ["l1", "k1"] }).agentId).toBe("l1");
    // A name beats the selection.
    expect(parseCommand("Ada, run the tests", { ...office, preferred: ["k1"] }).agentId).toBe("a1");
    // Someone who has left can't be talked to.
    expect(parseCommand("run the tests", { ...office, preferred: ["gone"] }).agentId).toBeNull();
  });

  it("prefers the agent in the room you're looking at when two share a name", () => {
    const twin = { id: "a2", name: "Ada", roomId: "api" };
    const agents = [twin, ada];
    expect(parseCommand("Ada, status?", { ...office, agents }).agentId).toBe("a1");
    expect(parseCommand("Ada, status?", { ...office, agents, openRoomId: "web" }).agentId).toBeNull();
  });
});

describe("what a spoken command asks for", () => {
  const intent = (said: string) => parseCommand(said, office).intent;

  it("is a status question when you ask what they're up to", () => {
    for (const said of [
      "Ada, what are you doing?",
      "Ada what're you up to",
      "hey Ada, how's it going",
      "Ada, what's your status?",
      "Ada, are you done yet?",
      "Ada, status",
      "what are you working on right now, Ada?",
      "Ada?",
    ]) {
      expect(intent(said), said).toBe("status");
    }
  });

  it("is a task for anything else, which goes to their Claude Code session", () => {
    for (const said of [
      "Ada, can you check today's best-selling stock?",
      "Ada, what's the best-selling stock today?",
      "Ada, run the tests and tell me what's failing",
      "Ada, how is the auth module structured? Explain it and suggest fixes for anything odd you find",
    ]) {
      expect(intent(said), said).toBe("task");
    }
  });
});

describe("an agent's reply, bubble-sized", () => {
  it("keeps the opening sentences that fit, as plain text", () => {
    const reply =
      "## Result\n\nThe **login test** fails because `auth.ts` returns early. I fixed it in [auth.ts](src/auth.ts) and all tests pass.\n\n- one\n- two";
    expect(shortReply(reply, 80)).toBe("The login test fails because auth.ts returns early.");
    expect(shortReply(reply, 200)).toBe(
      "The login test fails because auth.ts returns early. I fixed it in auth.ts and all tests pass. one two",
    );
  });

  it("cuts a long first sentence at a word, and skips code blocks", () => {
    expect(shortReply("```ts\nconst x = 1;\n```\nHere is a rather long sentence that keeps on going well past the limit", 40)).toBe(
      "Here is a rather long sentence that…",
    );
    expect(shortReply("", 40)).toBe("");
  });
});

describe("what an agent says when asked what it's doing", () => {
  const agent = (session: Partial<AgentState["session"]>, away?: string): AgentState => ({
    task: "Fix the login test",
    session: { phase: "working", activity: "Thinking…", ask: null, request: null, lastReply: null, ...session },
    away,
  });

  it("describes the work in progress and what it's for", () => {
    expect(statusReply(agent({ activity: "Running npm test" }))).toBe("Running npm test. I'm on “Fix the login test”.");
    expect(statusReply(agent({ request: "Check today's best-selling stock" }))).toBe(
      "Thinking it through. I'm on “Check today's best-selling stock”.",
    );
  });

  it("says when it's waiting on you", () => {
    const ask = { title: "Run rm -rf build" };
    expect(statusReply(agent({ phase: "permission", ask }))).toBe("Waiting on you. Can I run rm -rf build?");
  });

  it("shares how the last task went once it's done, or what it's doing on its break", () => {
    const done = { phase: "idle", activity: "Task done", lastReply: "Fixed! The login test passes now. Details below…" } as const;
    expect(statusReply(agent(done))).toBe("Done! Fixed! The login test passes now. Details below…");
    expect(statusReply(agent(done, "Grabbing a coffee"))).toBe("Grabbing a coffee. All done, what's next?");
    expect(statusReply(agent({ phase: "idle" }))).toBe("All done. What's next?");
  });
});

describe("what an agent says when you give it something to do", () => {
  it("gets on with it if free, checking for questions and doing for tasks", () => {
    expect(ackLine("can you check today's best-selling stock?", "now", "idle")).toBe("Okay, let me check.");
    expect(ackLine("run the tests", "now", "idle")).toBe("On it!");
  });

  it("says when it'll get to it if busy", () => {
    expect(ackLine("run the tests", "queued", "working")).toBe("I'll get to it right after this.");
    expect(ackLine("run the tests", "queued", "permission")).toBe("Sure, once you've answered my question.");
    expect(ackLine("run the tests", "queued", "starting")).toBe("Sure, as soon as I'm set up.");
  });
});
