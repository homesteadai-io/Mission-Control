import { app, BrowserWindow, ipcMain, shell, session } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sanitizeDetail } from "./backend/eventSanitizer.js";
import { appendEvent, appendTranscript, type TranscriptEntry } from "./backend/eventLog.js";
import { mintRealtimeClientSecret } from "./backend/realtimeSecrets.js";
import {
  killAllPanes,
  killPane,
  PANE_IDS,
  PANE_PROFILES,
  paneIsRunning,
  resizePane,
  spawnPane,
  writePane,
  type PaneProfile
} from "./backend/ptyManager.js";
import { importFile, isInsideWorkspace, listFiles } from "./backend/workspaceFiles.js";
import {
  getBoardStatus,
  listBoardMessages,
  listBoardPermissions,
  onBoardStatus,
  promptBoard,
  replyBoardPermission,
  resetBoardSession,
  startBoard,
  stopBoard
} from "./backend/opencodeSupervisor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
const projectRoot = process.cwd();

const workspaceDir = path.join(os.homedir(), "MissionControl-Workspace");
fs.mkdirSync(workspaceDir, { recursive: true });

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: file:",
  "font-src 'self'",
  "connect-src 'self' http://127.0.0.1:5173 ws://127.0.0.1:5173 https://api.openai.com wss://api.openai.com",
  "media-src 'self' blob: mediastream:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'"
].join("; ");

function installSecurityGuards() {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [contentSecurityPolicy]
      }
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 920,
    minHeight: 620,
    backgroundColor: "#0c131a",
    title: "Homestead Mission Control",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    const allowedUrl = devServerUrl ?? pathToFileURL(path.join(__dirname, "../dist/index.html")).toString();
    if (url !== allowedUrl) {
      event.preventDefault();
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

ipcMain.handle("window:set-mode", (_event, mode: "display" | "computer") => {
  if (!mainWindow) return { ok: false };

  if (mode === "computer") {
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(180, 180);
    mainWindow.setAlwaysOnTop(true, "floating");
    mainWindow.setContentSize(180, 180, true);
    mainWindow.setResizable(false);
    mainWindow.setOpacity(0.9);
    const display = mainWindow.getBounds();
    mainWindow.setPosition(Math.max(16, display.x), Math.max(16, display.y), true);
    return { ok: true, mode };
  }

  mainWindow.setOpacity(1);
  mainWindow.setResizable(true);
  mainWindow.setMinimumSize(920, 620);
  mainWindow.setAlwaysOnTop(false);
  mainWindow.setSize(1280, 820, true);
  mainWindow.center();
  return { ok: true, mode };
});

ipcMain.handle("voice:create-session", async (_event, options?: { stateSummary?: string }) => {
  try {
    const minted = await mintRealtimeClientSecret(projectRoot, {
      stateSummary: typeof options?.stateSummary === "string" ? options.stateSummary : undefined
    });
    return { ok: true, ...minted };
  } catch (error) {
    await appendEvent(projectRoot, {
      type: "voice.create_session_error",
      detail: {
        message: error instanceof Error ? error.message : "Unknown realtime session error"
      }
    });
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown realtime session error"
    };
  }
});

ipcMain.handle("voice:append-transcript", async (_event, sessionId: string, entry: TranscriptEntry) => {
  try {
    assertTranscriptEntry(entry);
    await appendTranscript(projectRoot, sessionId, entry);
    return { ok: true };
  } catch (error) {
    await appendEvent(projectRoot, {
      type: "voice.append_transcript_error",
      sessionId: typeof sessionId === "string" ? sessionId : undefined,
      detail: {
        message: error instanceof Error ? error.message : "Unknown transcript write error"
      }
    });
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown transcript write error"
    };
  }
});

ipcMain.handle("voice:log-event", async (_event, entry: { type: string; sessionId?: string; detail?: Record<string, unknown> }) => {
  try {
    if (!entry || typeof entry.type !== "string" || !entry.type.startsWith("voice.")) {
      throw new Error("Invalid voice event");
    }
    await appendEvent(projectRoot, {
      type: entry.type,
      sessionId: typeof entry.sessionId === "string" ? entry.sessionId : undefined,
      detail: sanitizeDetail(entry.detail)
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown event log error"
    };
  }
});

ipcMain.handle("pty:spawn", (_event, id: string, profile: PaneProfile, cols: number, rows: number) => {
  if (!PANE_IDS.has(id) || !PANE_PROFILES.has(profile)) {
    return { ok: false, error: "Unknown pane id or profile" };
  }
  const safeCols = clampInt(cols, 2, 500, 80);
  const safeRows = clampInt(rows, 2, 500, 24);

  spawnPane({
    id,
    profile,
    cwd: workspaceDir,
    cols: safeCols,
    rows: safeRows,
    onData: (data) => mainWindow?.webContents.send("pty:data", id, data),
    onExit: (exitCode) => mainWindow?.webContents.send("pty:exit", id, exitCode)
  });

  void appendEvent(projectRoot, { type: "desk.pane_spawned", detail: { pane: id, profile } });
  return { ok: true };
});

ipcMain.handle("pty:input", (_event, id: string, data: string) => {
  if (!PANE_IDS.has(id) || typeof data !== "string" || data.length > 10_000) {
    return { ok: false, error: "Invalid pane input" };
  }
  writePane(id, data);
  return { ok: true };
});

ipcMain.handle("pty:resize", (_event, id: string, cols: number, rows: number) => {
  if (!PANE_IDS.has(id)) return { ok: false, error: "Unknown pane id" };
  resizePane(id, clampInt(cols, 2, 500, 80), clampInt(rows, 2, 500, 24));
  return { ok: true };
});

ipcMain.handle("pty:kill", (_event, id: string) => {
  if (!PANE_IDS.has(id)) return { ok: false, error: "Unknown pane id" };
  killPane(id);
  return { ok: true };
});

ipcMain.handle("pty:is-running", (_event, id: string) => {
  return { ok: true, running: PANE_IDS.has(id) && paneIsRunning(id) };
});

ipcMain.handle("board:status", () => ({ ok: true, status: getBoardStatus() }));

ipcMain.handle("board:prompt", async (_event, text: string) => {
  try {
    if (typeof text !== "string" || !text.trim() || text.length > 20_000) {
      throw new Error("Invalid board prompt");
    }
    const result = await promptBoard(text.trim());
    await appendEvent(projectRoot, {
      type: "desk.board_prompted",
      sessionId: result.sessionId,
      detail: { chars: text.trim().length }
    });
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Board prompt failed" };
  }
});

ipcMain.handle("board:messages", async () => {
  try {
    return { ok: true, messages: await listBoardMessages() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Board messages failed" };
  }
});

ipcMain.handle("board:new-session", () => {
  resetBoardSession();
  return { ok: true };
});

ipcMain.handle("board:permissions", async () => {
  try {
    return { ok: true, permissions: await listBoardPermissions() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Permission list failed" };
  }
});

ipcMain.handle("board:reply-permission", async (_event, requestId: string, reply: string) => {
  try {
    if (typeof requestId !== "string" || !["once", "always", "reject"].includes(reply)) {
      throw new Error("Invalid permission reply");
    }
    await replyBoardPermission(requestId, reply as "once" | "always" | "reject");
    await appendEvent(projectRoot, { type: "desk.board_permission_reply", detail: { reply } });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Permission reply failed" };
  }
});

ipcMain.handle("workspace:import", async (_event, rawName: string, bytes: ArrayBuffer) => {
  try {
    if (typeof rawName !== "string" || !(bytes instanceof ArrayBuffer)) {
      throw new Error("Invalid import payload");
    }
    const info = importFile(workspaceDir, rawName, new Uint8Array(bytes));
    await appendEvent(projectRoot, {
      type: "desk.workspace_file_added",
      detail: { name: info.name, size: info.size }
    });
    return { ok: true, file: info };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Import failed" };
  }
});

ipcMain.handle("workspace:list", () => {
  try {
    return { ok: true, files: listFiles(workspaceDir), workspaceDir };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "List failed" };
  }
});

ipcMain.handle("workspace:reveal", (_event, filePath: string) => {
  if (typeof filePath !== "string" || !isInsideWorkspace(workspaceDir, filePath)) {
    return { ok: false, error: "Path is outside the workspace" };
  }
  shell.showItemInFolder(path.resolve(filePath));
  return { ok: true };
});

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, n));
}

function assertTranscriptEntry(entry: TranscriptEntry) {
  const validRoles = new Set(["user", "assistant", "system"]);
  const validSources = new Set(["history", "event", "renewal", "manual"]);

  if (!entry || typeof entry !== "object") throw new Error("Invalid transcript entry");
  if (!validRoles.has(entry.role)) throw new Error("Invalid transcript role");
  if (!validSources.has(entry.source)) throw new Error("Invalid transcript source");
  if (typeof entry.text !== "string") throw new Error("Invalid transcript text");
}

app.whenReady().then(() => {
  installSecurityGuards();
  createWindow();
  onBoardStatus((boardStatus, detail) => {
    mainWindow?.webContents.send("board:status-changed", boardStatus, detail ?? null);
  });
  startBoard(workspaceDir, projectRoot);
});

app.on("before-quit", () => {
  killAllPanes();
  stopBoard();
});

app.on("window-all-closed", () => {
  killAllPanes();
  stopBoard();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
