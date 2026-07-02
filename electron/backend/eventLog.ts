import fs from "node:fs/promises";
import path from "node:path";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface EventLogEntry {
  type: string;
  sessionId?: string;
  detail?: Record<string, JsonValue>;
}

const eventLogPath = (projectRoot: string) => path.join(projectRoot, "data", "events.jsonl");
const transcriptPath = (projectRoot: string, sessionId: string) =>
  path.join(projectRoot, "data", "transcripts", `${sessionId}.jsonl`);

export async function appendEvent(projectRoot: string, entry: EventLogEntry) {
  const targetPath = eventLogPath(projectRoot);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.appendFile(targetPath, `${JSON.stringify(withTimestamp(entry))}\n`, "utf8");
  return targetPath;
}

export interface TranscriptEntry {
  role: "user" | "assistant" | "system";
  text: string;
  source: "history" | "event" | "renewal" | "manual";
  itemId?: string;
  eventType?: string;
  isFinal?: boolean;
}

export async function appendTranscript(projectRoot: string, sessionId: string, entry: TranscriptEntry) {
  assertSafeSessionId(sessionId);
  const targetPath = transcriptPath(projectRoot, sessionId);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.appendFile(targetPath, `${JSON.stringify(withTimestamp(entry))}\n`, "utf8");
  return targetPath;
}

function withTimestamp<T extends object>(entry: T) {
  return {
    ts: new Date().toISOString(),
    ...entry
  };
}

export function assertSafeSessionId(sessionId: string) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(sessionId)) {
    throw new Error("Invalid transcript session id");
  }
}
