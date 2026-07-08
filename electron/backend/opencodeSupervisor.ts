import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureBoardConfig } from "./boardConfig.js";
import { readOpenAiApiKey } from "./env.js";

export type BoardStatus = "stopped" | "starting" | "ready" | "error";

export interface BoardMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  completed: boolean;
  model?: string;
}

const BOARD_PORT = 4517;
const MAX_RESTARTS = 3;

let child: ChildProcess | null = null;
let status: BoardStatus = "stopped";
let restarts = 0;
let sessionId: string | null = null;
let statusListener: ((status: BoardStatus, detail?: string) => void) | null = null;

function baseUrl() {
  return `http://127.0.0.1:${BOARD_PORT}`;
}

function setStatus(next: BoardStatus, detail?: string) {
  status = next;
  statusListener?.(next, detail);
}

export function getBoardStatus() {
  return status;
}

export function onBoardStatus(listener: (status: BoardStatus, detail?: string) => void) {
  statusListener = listener;
}

function resolveOpencodeCommand(): { file: string; args: string[] } {
  const home = os.homedir();
  const cmdShim = path.join(home, "AppData", "Roaming", "npm", "opencode.cmd");
  if (process.platform === "win32" && fs.existsSync(cmdShim)) {
    return { file: "cmd.exe", args: ["/c", cmdShim, "serve", "--port", String(BOARD_PORT)] };
  }
  return { file: "opencode", args: ["serve", "--port", String(BOARD_PORT)] };
}

let projectRootForKey: string | undefined;

/**
 * Give opencode's OpenAI provider the API key WITHOUT ever writing it into the
 * workspace opencode.json (which is drop-zone-visible / syncable). The key is
 * read from .env.local in the main process and injected into the board child's
 * env only. It never crosses the preload bridge to the renderer.
 */
function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (!env.OPENAI_API_KEY && projectRootForKey) {
    try {
      env.OPENAI_API_KEY = readOpenAiApiKey(projectRootForKey);
    } catch {
      // no key available — board falls back to opencode's free default model
    }
  }
  return env;
}

export function startBoard(workspaceDir: string, projectRoot?: string) {
  if (projectRoot) projectRootForKey = projectRoot;
  if (child) return;
  setStatus("starting");

  // Write the permission-gated config before serve reads it. Never clobbers a
  // user-authored opencode.json.
  try {
    ensureBoardConfig(workspaceDir);
  } catch {
    // config write is best-effort; opencode still serves with defaults
  }

  const { file, args } = resolveOpencodeCommand();
  child = spawn(file, args, {
    cwd: workspaceDir,
    env: childEnv(),
    stdio: "ignore",
    windowsHide: true
  });

  child.on("error", (err) => {
    // Fires when opencode isn't installed (ENOENT) or can't be spawned.
    child = null;
    sessionId = null;
    setStatus(
      "error",
      err.message.includes("ENOENT")
        ? "opencode is not installed — run: npm i -g opencode-ai"
        : `opencode failed to start: ${err.message}`
    );
  });

  child.on("exit", (code) => {
    child = null;
    sessionId = null;
    if (status === "stopped") return; // intentional shutdown
    if (status === "error") return; // spawn 'error' already handled this (e.g. ENOENT)
    if (restarts < MAX_RESTARTS) {
      restarts += 1;
      setStatus("starting", `opencode exited (code ${code}); restart ${restarts}/${MAX_RESTARTS}`);
      startBoard(workspaceDir);
    } else {
      setStatus("error", `opencode exited (code ${code}) after ${MAX_RESTARTS} restarts`);
    }
  });

  void waitForHealth();
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl()}/api/health`);
      if (response.ok) {
        restarts = 0;
        setStatus("ready");
        return;
      }
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  // Reap the unresponsive child rather than leaving it live in error state.
  stopBoard();
  setStatus("error", "opencode serve did not become healthy in 20s");
}

export function stopBoard() {
  setStatus("stopped");
  if (!child) return;
  const pid = child.pid;
  child = null;
  sessionId = null;
  try {
    if (process.platform === "win32" && pid) {
      execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(pid ?? 0);
    }
  } catch {
    // already dead
  }
}

async function ensureSession(): Promise<string> {
  if (sessionId) return sessionId;
  const response = await fetch(`${baseUrl()}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  if (!response.ok) throw new Error(`Board session create failed: HTTP ${response.status}`);
  const payload = (await response.json()) as { data?: { id?: string } };
  const id = payload.data?.id;
  if (!id) throw new Error("Board session create returned no id");
  sessionId = id;
  return id;
}

export interface BoardPermission {
  id: string;
  action: string;
  resources: string[];
}

/** Pending approvals for the active board session (opencode's ask-gated tools). */
export async function listBoardPermissions(): Promise<BoardPermission[]> {
  if (!sessionId) return [];
  const response = await fetch(`${baseUrl()}/api/session/${sessionId}/permission`);
  if (!response.ok) return [];
  const payload = (await response.json()) as {
    data?: Array<{ id?: string; action?: string; resources?: unknown }>;
  };
  return (payload.data ?? [])
    .filter((p): p is { id: string; action: string; resources?: unknown } => typeof p.id === "string")
    .map((p) => ({
      id: p.id,
      action: typeof p.action === "string" ? p.action : "tool",
      resources: Array.isArray(p.resources) ? p.resources.map((r) => String(r)) : []
    }));
}

export async function replyBoardPermission(requestId: string, reply: "once" | "always" | "reject") {
  if (!sessionId) throw new Error("No active board session");
  const response = await fetch(`${baseUrl()}/api/session/${sessionId}/permission/${requestId}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reply })
  });
  if (!response.ok) throw new Error(`Permission reply failed: HTTP ${response.status}`);
  return { ok: true };
}

export async function promptBoard(text: string) {
  if (status !== "ready") throw new Error(`Board is ${status}`);
  const id = await ensureSession();
  const response = await fetch(`${baseUrl()}/api/session/${id}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: { text } })
  });
  if (!response.ok) throw new Error(`Board prompt failed: HTTP ${response.status}`);
  return { sessionId: id };
}

export async function listBoardMessages(): Promise<BoardMessage[]> {
  if (!sessionId) return [];
  const response = await fetch(`${baseUrl()}/api/session/${sessionId}/message`);
  if (!response.ok) throw new Error(`Board message list failed: HTTP ${response.status}`);
  const payload = (await response.json()) as { data?: RawMessage[] };
  const raw = payload.data ?? [];

  return raw
    .map((message) => ({
      id: message.id,
      role: message.type === "assistant" ? ("assistant" as const) : ("user" as const),
      text: extractText(message),
      completed: message.type === "user" ? true : Boolean(message.time?.completed),
      model: message.model ? `${message.model.providerID}/${message.model.id}` : undefined
    }))
    .reverse(); // API returns newest-first; feed wants oldest-first
}

export function resetBoardSession() {
  sessionId = null;
}

interface RawMessage {
  id: string;
  type: "user" | "assistant";
  text?: string;
  content?: Array<{ type: string; text?: string }>;
  time?: { created?: number; completed?: number };
  model?: { id: string; providerID: string };
}

function extractText(message: RawMessage) {
  if (message.type === "user") return message.text ?? "";
  return (message.content ?? [])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}
