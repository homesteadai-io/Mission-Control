import { app, BrowserWindow, clipboard, ipcMain, Menu, screen, shell, session } from "electron";
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
  readPaneTail,
  resizePane,
  spawnPane,
  submitPaneLine,
  writePane,
  type PaneProfile
} from "./backend/ptyManager.js";
import { importFile, isInsideWorkspace, listFiles } from "./backend/workspaceFiles.js";
import {
  getBoardStatus,
  listBoardMessages,
  listBoardPermissions,
  askBoard,
  onBoardStatus,
  promptBoard,
  recordWorkspaceDrop,
  replyBoardPermission,
  resetBoardSession,
  stopBoard
} from "./backend/opencodeSupervisor.js";
import { getSpineStatus, startSpine, stopSpine, type SpineEvent } from "./backend/charliSpine.js";
import {
  ensureCharliConfig,
  focusApp,
  loadHandsConfig,
  pointerLine,
  typeIntoApp,
  writeHandoffNote,
  type HandsTarget
} from "./backend/hands.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let petWindow: BrowserWindow | null = null;
const projectRoot = process.cwd();

/** Latest handoff-able turn per source: the note is already on disk in Flux. */
const lastHandoff = new Map<string, { event: SpineEvent; notePath: string }>();

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

  // Right-click clipboard menu. Electron ships no default context menu, so
  // right-click Paste (and Cut/Copy) never worked in the text boxes or the
  // xterm terminals. These role-based items act on the focused element —
  // Paste into an <input> or the focused terminal's textarea (which xterm
  // forwards to the pty).
  mainWindow.webContents.on("context-menu", (_event, params) => {
    const canEdit = params.isEditable;
    const hasSelection = params.selectionText.trim().length > 0;
    if (!canEdit && !hasSelection) return;

    const template: Electron.MenuItemConstructorOptions[] = [];
    if (canEdit) template.push({ role: "cut", enabled: params.editFlags.canCut });
    if (canEdit || hasSelection) template.push({ role: "copy", enabled: params.editFlags.canCopy });
    if (canEdit) template.push({ role: "paste", enabled: params.editFlags.canPaste });
    if (canEdit) {
      template.push({ type: "separator" });
      template.push({ role: "selectAll" });
    }
    Menu.buildFromTemplate(template).popup({ window: mainWindow ?? undefined });
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

function createPetWindow() {
  const workArea = screen.getPrimaryDisplay().workArea;
  const width = 170;
  const height = 230;
  petWindow = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 24,
    y: workArea.y + workArea.height - height - 24,
    transparent: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    title: "Charli",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  // Above everything, including maximized apps — the whole point of the pet.
  petWindow.setAlwaysOnTop(true, "screen-saver");

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void petWindow.loadURL(`${devServerUrl}#pet`);
  } else {
    void petWindow.loadFile(path.join(__dirname, "../dist/index.html"), { hash: "pet" });
  }
  petWindow.on("closed", () => {
    petWindow = null;
  });

  // Self-capture for headless visual verification: CHARLI_CAPTURE=1 writes a
  // PNG of the pet window to ~/.charli/pet-capture.png a few seconds after load.
  if (process.env.CHARLI_CAPTURE === "1") {
    petWindow.webContents.on("did-finish-load", () => {
      setTimeout(async () => {
        try {
          const image = await petWindow?.webContents.capturePage();
          if (image) {
            const outPath = path.join(os.homedir(), ".charli", "pet-capture.png");
            fs.writeFileSync(outPath, image.toPNG());
            console.log(`[pet] captured -> ${outPath}`);
          }
        } catch (error) {
          console.log(`[pet] capture failed: ${error instanceof Error ? error.message : error}`);
        }
      }, 4_000);
    });
  }
}

function toEventView(event: SpineEvent, notePath?: string) {
  return {
    source: event.source,
    thread_id: event.thread_id,
    turn_id: event.turn_id,
    cwd: event.cwd,
    message: event.message.length > 400 ? `${event.message.slice(0, 400)}…` : event.message,
    timestamp: event.timestamp,
    notePath
  };
}

function handleSpineEvent(event: SpineEvent) {
  let notePath: string | undefined;
  if (event.message.trim()) {
    try {
      notePath = writeHandoffNote(event);
      lastHandoff.set(event.source, { event, notePath });
    } catch (error) {
      void appendEvent(projectRoot, {
        type: "charli.handoff_note_error",
        detail: { message: error instanceof Error ? error.message : "unknown" }
      });
    }
  }
  petWindow?.webContents.send("charli:event", toEventView(event, notePath));
  void appendEvent(projectRoot, {
    type: "charli.turn_completed",
    detail: { source: event.source, thread: event.thread_id, chars: event.message.length }
  });
}

ipcMain.handle("charli:status", () => {
  const status = getSpineStatus();
  return {
    ok: true,
    codex: status.codex ? toEventView(status.codex, lastHandoff.get("codex")?.notePath) : null,
    claude: status.claude ? toEventView(status.claude, lastHandoff.get("claude")?.notePath) : null
  };
});

ipcMain.handle("charli:skin", () => {
  try {
    const config = loadHandsConfig();
    const skinName = /^[a-z0-9-]+$/.test(config.petSkin) ? config.petSkin : "tama";
    const skinDir = path.join(projectRoot, "skins", skinName);
    const meta = JSON.parse(fs.readFileSync(path.join(skinDir, "skin.json"), "utf8"));
    const imagePath = path.join(skinDir, String(meta.image));
    const mime = imagePath.endsWith(".png") ? "image/png" : "image/webp";
    const imageDataUrl = `data:${mime};base64,${fs.readFileSync(imagePath).toString("base64")}`;
    return { ok: true, skin: { ...meta, imageDataUrl } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Skin load failed" };
  }
});

ipcMain.handle("charli:focus", async (_event, target: string) => {
  if (!["claude", "codex", "flux"].includes(target)) {
    return { ok: false, detail: "Unknown focus target" };
  }
  const result = await focusApp(target as HandsTarget);
  void appendEvent(projectRoot, { type: "charli.focus", detail: { target, ok: result.ok } });
  return result;
});

async function sendHandoff(source: "codex" | "claude"): Promise<{ ok: boolean; detail: string }> {
  let entry = lastHandoff.get(source);
  if (!entry) {
    // App may have restarted since the turn landed — write the note now.
    const status = getSpineStatus()[source];
    if (status && status.message.trim()) {
      entry = { event: status, notePath: writeHandoffNote(status) };
      lastHandoff.set(source, entry);
    }
  }
  if (!entry) return { ok: false, detail: `No ${source} turn to hand off yet` };

  const target: HandsTarget = source === "codex" ? "claude" : "codex";
  const result = await typeIntoApp(target, pointerLine(entry.notePath, entry.event.source));
  void appendEvent(projectRoot, {
    type: "charli.handoff_sent",
    detail: { source, target, ok: result.ok, note: path.basename(entry.notePath) }
  });
  return result;
}

ipcMain.handle("charli:send-handoff", async (_event, source: string) => {
  if (source !== "codex" && source !== "claude") {
    return { ok: false, detail: "Unknown handoff source" };
  }
  return sendHandoff(source);
});

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

ipcMain.handle("pty:submit-line", async (_event, id: string, text: string) => {
  if (!PANE_IDS.has(id) || typeof text !== "string" || text.length > 10_000) {
    return { ok: false, error: "Invalid pane submit" };
  }
  const ok = await submitPaneLine(id, text);
  return ok ? { ok: true } : { ok: false, error: `The ${id} pane is not running.` };
});

ipcMain.handle("pty:read-recent", (_event, id: string, maxChars?: number) => {
  if (!PANE_IDS.has(id)) return { ok: false, error: "Unknown pane id" };
  if (!paneIsRunning(id)) return { ok: false, error: `The ${id} pane is not running.` };
  const cap = typeof maxChars === "number" ? clampInt(maxChars, 200, 8000, 2000) : 2000;
  return { ok: true, text: readPaneTail(id, cap) };
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

// Clipboard for the terminal panes. The sandboxed renderer can't reliably use
// navigator.clipboard (permission handler only grants "media"), so terminals
// read/write through main. Text only — never images or files.
ipcMain.handle("clipboard:read-text", () => {
  return { ok: true, text: clipboard.readText() };
});

ipcMain.handle("clipboard:write-text", (_event, text: string) => {
  if (typeof text !== "string" || text.length > 1_000_000) {
    return { ok: false, error: "Invalid clipboard text" };
  }
  clipboard.writeText(text);
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

ipcMain.handle("board:ask", async (_event, text: string) => {
  try {
    if (typeof text !== "string" || !text.trim() || text.length > 20_000) {
      throw new Error("Invalid board ask");
    }
    const reply = await askBoard(text.trim());
    return { ok: true, reply };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Board ask failed" };
  }
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
    // Let the board agent know on its next turn — drops are invisible to it otherwise.
    recordWorkspaceDrop(info.name, info.size);
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

// Single-instance lock: a second launch (e.g. double-clicking the desktop
// shortcut while Charli is already open) focuses the existing window instead
// of spawning a rival that would collide on the board port.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    installSecurityGuards();
    createWindow();
    onBoardStatus((boardStatus, detail) => {
      mainWindow?.webContents.send("board:status-changed", boardStatus, detail ?? null);
    });
    // Board agent retired (Charli v2 ruling 2026-07-10): no third brain. The
    // supervisor module stays for archival reference but is never started.
    ensureCharliConfig();
    startSpine(handleSpineEvent);
    createPetWindow();

    // Headless verification hook: CHARLI_TEST_SEND=codex|claude runs the exact
    // click-to-send path (same function the pet button invokes) once, 8s in.
    const testSend = process.env.CHARLI_TEST_SEND;
    if (testSend === "codex" || testSend === "claude") {
      setTimeout(async () => {
        const result = await sendHandoff(testSend);
        console.log(`[charli] test send ${testSend}: ok=${result.ok} detail=${result.detail}`);
      }, 8_000);
    }
  });
}

app.on("before-quit", () => {
  killAllPanes();
  stopBoard();
  stopSpine();
});

app.on("window-all-closed", () => {
  killAllPanes();
  stopBoard();
  stopSpine();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
