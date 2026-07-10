import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Charli's broker: tails the spine event files that the codex notify adapter
 * and the claude Stop hook append to (~/.charli/events/*.jsonl) and surfaces
 * turn_completed events to the app. File-first design — the writers never
 * need this app to be running; the broker just follows the files.
 */

export interface SpineEvent {
  source: "codex" | "claude";
  event: string;
  thread_id: string;
  turn_id: string;
  cwd: string;
  status: string;
  message: string;
  timestamp: string;
}

const SOURCES = ["codex", "claude"] as const;
type Source = (typeof SOURCES)[number];

export function charliDir() {
  return process.env.CHARLI_DIR || path.join(os.homedir(), ".charli");
}

function eventsFile(source: Source) {
  return path.join(charliDir(), "events", `${source}.jsonl`);
}

/** Parse appended JSONL text into spine events; bad lines are skipped. */
export function parseSpineLines(chunk: string, source: Source): SpineEvent[] {
  const events: SpineEvent[] = [];
  for (const line of chunk.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Partial<SpineEvent>;
      if (parsed && parsed.event === "turn_completed") {
        events.push({
          source,
          event: "turn_completed",
          thread_id: String(parsed.thread_id ?? ""),
          turn_id: String(parsed.turn_id ?? ""),
          cwd: String(parsed.cwd ?? ""),
          status: String(parsed.status ?? "completed"),
          message: String(parsed.message ?? ""),
          timestamp: String(parsed.timestamp ?? "")
        });
      }
    } catch {
      // partial or corrupt line — skip; the next poll gets the completed one
    }
  }
  return events;
}

/** Read the final complete event in a file, if any (used to seed status on boot). */
export function readLastEvent(source: Source): SpineEvent | null {
  const file = eventsFile(source);
  try {
    // Event files are append-only forever; only the tail matters for seeding.
    const stats = fs.statSync(file);
    const start = Math.max(0, stats.size - 64 * 1024);
    const buffer = Buffer.alloc(stats.size - start);
    const fd = fs.openSync(file, "r");
    try {
      fs.readSync(fd, buffer, 0, buffer.length, start);
    } finally {
      fs.closeSync(fd);
    }
    const events = parseSpineLines(buffer.toString("utf8"), source);
    return events.length > 0 ? events[events.length - 1] : null;
  } catch {
    return null;
  }
}

interface TailState {
  offset: number;
}

const POLL_MS = 1200;
let timer: NodeJS.Timeout | null = null;
const tails = new Map<Source, TailState>();
const latest = new Map<Source, SpineEvent>();
/** Sources whose event file already existed when the spine started. */
const existedAtStart = new Set<Source>();
let listener: ((event: SpineEvent) => void) | null = null;

function pollOnce() {
  for (const source of SOURCES) {
    const file = eventsFile(source);
    let size = 0;
    try {
      size = fs.statSync(file).size;
    } catch {
      continue; // file not created yet
    }
    if (!tails.has(source)) {
      // First sighting. A file that existed at startup seeds at EOF so history
      // doesn't replay as fresh events; a file that APPEARED after startup
      // contains only new turns — seed at 0 so the very first turn on a fresh
      // install is emitted, not swallowed. (Review finding #1, 2026-07-10.)
      tails.set(source, { offset: existedAtStart.has(source) ? size : 0 });
    }
    const state = tails.get(source)!;
    if (size < state.offset) state.offset = 0; // truncated/rotated
    if (size === state.offset) continue;

    const buffer = Buffer.alloc(size - state.offset);
    const fd = fs.openSync(file, "r");
    try {
      fs.readSync(fd, buffer, 0, buffer.length, state.offset);
    } finally {
      fs.closeSync(fd);
    }
    // Only consume up to the last newline — a writer may be mid-append.
    const text = buffer.toString("utf8");
    const lastNewline = text.lastIndexOf("\n");
    if (lastNewline === -1) continue;
    state.offset += Buffer.byteLength(text.slice(0, lastNewline + 1), "utf8");

    for (const event of parseSpineLines(text.slice(0, lastNewline + 1), source)) {
      latest.set(source, event);
      listener?.(event);
    }
  }
}

export function startSpine(onEvent: (event: SpineEvent) => void) {
  listener = onEvent;
  for (const source of SOURCES) {
    if (fs.existsSync(eventsFile(source))) existedAtStart.add(source);
    const seeded = readLastEvent(source);
    if (seeded) latest.set(source, seeded);
  }
  // Seed offsets (EOF for pre-existing files) before the interval starts.
  pollOnce();
  timer = setInterval(pollOnce, POLL_MS);
  timer.unref?.();
}

export function stopSpine() {
  if (timer) clearInterval(timer);
  timer = null;
  listener = null;
  tails.clear();
  existedAtStart.clear();
}

/** Latest known turn per source (seeded from file history on boot). */
export function getSpineStatus(): { codex: SpineEvent | null; claude: SpineEvent | null } {
  return {
    codex: latest.get("codex") ?? null,
    claude: latest.get("claude") ?? null
  };
}
