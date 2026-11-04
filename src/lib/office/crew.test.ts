import { describe, expect, it } from "vitest";
import { agentCharacter } from "./crew";

describe("agent characters", () => {
  it("uses the name you gave and shows the model as the role", () => {
    const c = agentCharacter({ id: "1b7c…", name: "Ada", model: "sonnet", task: "Fix the login bug" });
    expect(c).toMatchObject({ id: "1b7c…", name: "Ada", role: "Claude Code · Sonnet", focus: "Fix the login bug" });
  });

  it("gives an agent the same look every time, so reloads don't change people", () => {
    const a = agentCharacter({ id: "agent-42", name: "Ada", model: "opus" });
    const b = agentCharacter({ id: "agent-42", name: "Ada", model: "opus" });
    expect(a.look).toEqual(b.look);
    expect(a.deskItems).toEqual(b.deskItems);
    expect(a.deskItems[0]).not.toBe(a.deskItems[1]);
  });
});
