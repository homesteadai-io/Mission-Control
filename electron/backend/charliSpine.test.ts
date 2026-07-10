import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let charliDir: string;

async function loadSpine() {
  // Fresh module state per test — the spine keeps module-level tails/latest.
  vi.resetModules();
  process.env.CHARLI_DIR = charliDir;
  return import("./charliSpine.js");
}

function eventLine(source: string, message: string, turn = "t1") {
  return `${JSON.stringify({
    source,
    event: "turn_completed",
    thread_id: "th",
    turn_id: turn,
    cwd: "C:\\w",
    status: "completed",
    message,
    timestamp: new Date().toISOString()
  })}\n`;
}

function eventsPath(source: string) {
  return path.join(charliDir, "events", `${source}.jsonl`);
}

async function waitFor(check: () => boolean, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return check();
}

beforeEach(() => {
  charliDir = fs.mkdtempSync(path.join(os.tmpdir(), "charli-broker-"));
  fs.mkdirSync(path.join(charliDir, "events"), { recursive: true });
});

afterEach(() => {
  delete process.env.CHARLI_DIR;
  fs.rmSync(charliDir, { recursive: true, force: true });
});

describe("charliSpine broker", () => {
  it("emits the very first event of a file that appears AFTER startup (fresh-install case)", async () => {
    const spine = await loadSpine();
    const events: unknown[] = [];
    spine.startSpine((event) => events.push(event));

    // File does not exist yet at startup — created by the first-ever turn.
    fs.writeFileSync(eventsPath("codex"), eventLine("codex", "first turn ever"));

    const arrived = await waitFor(() => events.length > 0);
    spine.stopSpine();
    expect(arrived).toBe(true);
    expect(events[0]).toMatchObject({ source: "codex", message: "first turn ever" });
  });

  it("does NOT replay history from a file that existed at startup, but new appends flow", async () => {
    fs.writeFileSync(eventsPath("claude"), eventLine("claude", "old history", "old"));

    const spine = await loadSpine();
    const events: Array<{ message: string }> = [];
    spine.startSpine((event) => events.push(event));

    // History must seed status without replaying as a fresh event.
    expect(spine.getSpineStatus().claude?.message).toBe("old history");

    fs.appendFileSync(eventsPath("claude"), eventLine("claude", "new turn", "new"));
    const arrived = await waitFor(() => events.length > 0);
    spine.stopSpine();

    expect(arrived).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].message).toBe("new turn");
  });
});
