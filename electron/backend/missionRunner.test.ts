import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyTool, permissionTitle } from "./missionRunner.js";

const workspace = path.join(os.homedir(), "MissionControl-Workspace");

describe("S3 mission permission tiers", () => {
  it("auto-allows perception (files and screen)", () => {
    expect(classifyTool(workspace, "Read", { file_path: "C:\\anywhere\\x.txt" }).tier).toBe("allow");
    expect(classifyTool(workspace, "Glob", { pattern: "**/*.md" }).tier).toBe("allow");
    expect(classifyTool(workspace, "mcp__windows__Snapshot", {}).tier).toBe("allow");
    expect(classifyTool(workspace, "mcp__windows__Screenshot", {}).tier).toBe("allow");
  });

  it("auto-allows writes and shell inside the workspace", () => {
    expect(classifyTool(workspace, "Write", { file_path: path.join(workspace, "a.md") }).tier).toBe("allow");
    expect(classifyTool(workspace, "Bash", { command: "echo hi > out.txt" }).tier).toBe("allow");
  });

  it("asks (chips) for desktop actions and outside-workspace writes/shell", () => {
    expect(classifyTool(workspace, "mcp__windows__Click", { x: 1, y: 2 }).tier).toBe("ask");
    expect(classifyTool(workspace, "mcp__windows__Type", { text: "hello" }).tier).toBe("ask");
    expect(classifyTool(workspace, "mcp__windows__App", { name: "notepad" }).tier).toBe("ask");
    expect(classifyTool(workspace, "mcp__windows__PowerShell", { command: "dir" }).tier).toBe("ask");
    expect(classifyTool(workspace, "Write", { file_path: "C:\\Users\\Adam\\other.md" }).tier).toBe("ask");
    expect(classifyTool(workspace, "Bash", { command: "type C:\\Users\\Adam\\Documents\\x.md" }).tier).toBe("ask");
  });

  it("hard-denies Registry and unknown tools — never asked", () => {
    expect(classifyTool(workspace, "mcp__windows__Registry", {}).tier).toBe("deny");
    expect(classifyTool(workspace, "mcp__windows__SomethingNew", {}).tier).toBe("deny");
    expect(classifyTool(workspace, "WebFetch", { url: "https://x.com" }).tier).toBe("deny");
    expect(classifyTool(workspace, "Task", {}).tier).toBe("deny");
  });

  it("builds readable chip titles", () => {
    expect(permissionTitle("mcp__windows__Type", { text: "hello world" })).toBe(
      'Dutch wants to Type — "hello world"'
    );
    expect(permissionTitle("mcp__windows__App", { name: "notepad" })).toBe(
      'Dutch wants to open an app — "notepad"'
    );
    expect(permissionTitle("mcp__windows__Click", { x: 10 })).toContain("Dutch wants to Click");
  });
});
