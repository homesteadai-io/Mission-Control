import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const NOTIFY = path.join(__dirname, "charli-notify.cjs");
const HOOK = path.join(__dirname, "charli-claude-hook.cjs");

let charliDir: string;

function runScript(script: string, args: string[], stdin?: string) {
  return execFileSync(process.execPath, [script, ...args], {
    env: { ...process.env, CHARLI_DIR: charliDir },
    input: stdin,
    timeout: 15_000
  });
}

function readEvents(source: "codex" | "claude") {
  const file = path.join(charliDir, "events", `${source}.jsonl`);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

beforeEach(() => {
  charliDir = fs.mkdtempSync(path.join(os.tmpdir(), "charli-spine-"));
});

afterEach(() => {
  fs.rmSync(charliDir, { recursive: true, force: true });
});

describe("charli-notify (codex fan-out adapter)", () => {
  function installMarkerForward() {
    // Stand-in for codex-computer-use.exe: records its argv to a marker file.
    const marker = path.join(charliDir, "forward-marker.json");
    const stub = path.join(charliDir, "forward-stub.cjs");
    fs.writeFileSync(
      stub,
      `require("node:fs").writeFileSync(${JSON.stringify(marker)}, JSON.stringify(process.argv.slice(2)));`
    );
    fs.writeFileSync(
      path.join(charliDir, "notify-forward.json"),
      JSON.stringify({ file: process.execPath, args: [stub, "turn-ended"] })
    );
    return marker;
  }

  const payload = JSON.stringify({
    type: "agent-turn-complete",
    "thread-id": "thread-123",
    "turn-id": "turn-456",
    cwd: "C:\\work\\repo",
    "last-assistant-message": "Refactor complete. Ready for review."
  });

  it("appends a normalized codex event", () => {
    installMarkerForward();
    runScript(NOTIFY, [payload]);

    const events = readEvents("codex");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: "codex",
      event: "turn_completed",
      thread_id: "thread-123",
      turn_id: "turn-456",
      cwd: "C:\\work\\repo",
      status: "completed",
      message: "Refactor complete. Ready for review."
    });
    expect(typeof events[0].timestamp).toBe("string");
  });

  it("forwards the invocation unchanged to the original handler", async () => {
    const marker = installMarkerForward();
    runScript(NOTIFY, [payload]);

    // Forward child is detached; give it a beat.
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(fs.existsSync(marker)).toBe(true);
    const forwardedArgs = JSON.parse(fs.readFileSync(marker, "utf8")) as string[];
    expect(forwardedArgs).toEqual(["turn-ended", payload]);
  });

  it("survives a missing forward config and still records the event", () => {
    runScript(NOTIFY, [payload]);
    expect(readEvents("codex")).toHaveLength(1);
    const log = fs.readFileSync(path.join(charliDir, "adapter.log"), "utf8");
    expect(log).toContain("forward-config-missing");
  });

  it("exits cleanly when no JSON payload argument exists", () => {
    installMarkerForward();
    runScript(NOTIFY, ["not-json"]);
    expect(readEvents("codex")).toHaveLength(0);
  });
});

describe("charli-claude-hook (claude stop hook)", () => {
  it("extracts the last assistant message from the transcript", () => {
    const transcript = path.join(charliDir, "transcript.jsonl");
    const lines = [
      JSON.stringify({ type: "user", message: { content: [{ type: "text", text: "do the thing" }] } }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "First reply." }] }
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", name: "Bash", input: {} },
            { type: "text", text: "Done. Tests green, two files changed." }
          ]
        }
      })
    ];
    fs.writeFileSync(transcript, `${lines.join("\n")}\n`);

    runScript(HOOK, [], JSON.stringify({
      session_id: "sess-789",
      transcript_path: transcript,
      cwd: "C:\\work\\other",
      hook_event_name: "Stop"
    }));

    const events = readEvents("claude");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: "claude",
      event: "turn_completed",
      thread_id: "sess-789",
      cwd: "C:\\work\\other",
      status: "completed",
      message: "Done. Tests green, two files changed."
    });
  });

  it("still records an event when the transcript is unreadable", () => {
    runScript(HOOK, [], JSON.stringify({
      session_id: "sess-000",
      transcript_path: path.join(charliDir, "missing.jsonl"),
      cwd: "C:\\work",
      hook_event_name: "Stop"
    }));

    const events = readEvents("claude");
    expect(events).toHaveLength(1);
    expect(events[0].message).toBe("");
  });

  it("never fails on garbage stdin", () => {
    runScript(HOOK, [], "this is not json");
    expect(readEvents("claude")).toHaveLength(1);
  });
});
