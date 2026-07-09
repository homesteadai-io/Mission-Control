import { describe, expect, it } from "vitest";
import { cleanTerminalText } from "./ptyManager";

describe("cleanTerminalText", () => {
  it("strips ANSI color/escape sequences", () => {
    const raw = "\x1b[32mReady\x1b[0m\r\n\x1b[1mClaude Code\x1b[22m";
    const out = cleanTerminalText(raw);
    expect(out).toContain("Ready");
    expect(out).toContain("Claude Code");
    expect(out).not.toContain("\x1b");
    expect(out).not.toContain("[32m");
  });

  it("collapses carriage returns and excess blank lines", () => {
    const raw = "line1\r\n\r\n\r\n\r\nline2\r\n";
    expect(cleanTerminalText(raw)).toBe("line1\n\nline2");
  });

  it("returns readable plain text a voice agent can relay", () => {
    const raw = "\x1b[2J\x1b[H\x1b[36mWelcome back Adam!\x1b[0m\r\nOpus 4.8 with me…";
    const out = cleanTerminalText(raw);
    expect(out).toBe("Welcome back Adam!\nOpus 4.8 with me…");
  });
});
