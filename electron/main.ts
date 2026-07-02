import { app, BrowserWindow, ipcMain, shell, session } from "electron";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sanitizeDetail } from "./backend/eventSanitizer.js";
import { appendEvent, appendTranscript, type TranscriptEntry } from "./backend/eventLog.js";
import { mintRealtimeClientSecret } from "./backend/realtimeSecrets.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
const projectRoot = process.cwd();

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
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
