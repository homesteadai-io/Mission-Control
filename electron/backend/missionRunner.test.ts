import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decideTool } from "./missionRunner.js";

const workspace = path.join(os.homedir(), "MissionControl-Workspace");

describe("S1 mission permission policy", () => {
  it("allows perception tools", () => {
    expect(decideTool(workspace, "Read", { file_path: "C:\\anywhere\\x.txt" }).behavior).toBe("allow");
    expect(decideTool(workspace, "Glob", { pattern: "**/*.md" }).behavior).toBe("allow");
    expect(decideTool(workspace, "Grep", { pattern: "x" }).behavior).toBe("allow");
  });

  it("allows writes inside the workspace only", () => {
    expect(
      decideTool(workspace, "Write", { file_path: path.join(workspace, "hello.md") }).behavior
    ).toBe("allow");
    expect(
      decideTool(workspace, "Write", { file_path: "C:\\Windows\\System32\\evil.txt" }).behavior
    ).toBe("deny");
    expect(decideTool(workspace, "Edit", { file_path: "C:\\Users\\Adam\\other.md" }).behavior).toBe(
      "deny"
    );
  });

  it("roots shell commands at the workspace", () => {
    expect(decideTool(workspace, "Bash", { command: "echo hi > out.txt" }).behavior).toBe("allow");
    expect(
      decideTool(workspace, "Bash", { command: `type "${path.join(workspace, "a.md")}"` }).behavior
    ).toBe("allow");
    expect(
      decideTool(workspace, "Bash", { command: "del C:\\Users\\Adam\\Documents\\keep.md" }).behavior
    ).toBe("deny");
  });

  it("denies everything outside the S1 toolset", () => {
    expect(decideTool(workspace, "WebFetch", { url: "https://x.com" }).behavior).toBe("deny");
    expect(decideTool(workspace, "Task", {}).behavior).toBe("deny");
    expect(decideTool(workspace, "mcp__anything__tool", {}).behavior).toBe("deny");
  });
});
