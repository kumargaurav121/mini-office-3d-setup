import { describe, expect, it } from "vitest";
import { applyHook, initialSession, looksLikeTrustPrompt } from "./session";

describe("agent session state from Claude Code hooks", () => {
  it("is working while Claude thinks or runs a tool, with a readable activity", () => {
    let s = initialSession();
    expect(s.phase).toBe("starting");
    s = applyHook(s, { hook_event_name: "UserPromptSubmit" });
    expect(s).toMatchObject({ phase: "working", activity: "Thinking…" });
    s = applyHook(s, { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm test -- --watch=false" } });
    expect(s).toMatchObject({ phase: "working", activity: "Running npm test -- --watch=false" });
    s = applyHook(s, { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: "/repo/src/app/page.tsx" } });
    expect(s.activity).toBe("Editing page.tsx");
  });

  it("goes idle when Claude finishes, and ends with the session", () => {
    let s = applyHook(initialSession(), { hook_event_name: "UserPromptSubmit" });
    s = applyHook(s, { hook_event_name: "Stop" });
    expect(s).toMatchObject({ phase: "idle", activity: "Task done", ask: null });
    s = applyHook(s, { hook_event_name: "Notification", notification_type: "idle_prompt" });
    expect(s.phase).toBe("idle");
    s = applyHook(s, { hook_event_name: "SessionEnd" });
    expect(s).toMatchObject({ phase: "ended", ask: null });
  });

  it("spots Claude Code's trust-this-folder prompt in raw terminal output", () => {
    // As captured from the real CLI: escape codes stand in for the spaces between words.
    const raw = "\x1b[1mQuick\x1b[1Csafety\x1b[1Ccheck\x1b[22m ... \x1b[38;5;153m❯\x1b[39m No,\x1b[1Cexit\r\n  Yes,\x1b[1CI\x1b[1Ctrust\x1b[1Cthis\x1b[1Cfolder";
    expect(looksLikeTrustPrompt(raw)).toBe(true);
    expect(looksLikeTrustPrompt("\x1b[32m✓ Tests passed\x1b[39m — I trust the results")).toBe(false);
  });
});
