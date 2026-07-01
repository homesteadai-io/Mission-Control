import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 920,
    minHeight: 620,
    backgroundColor: "#0c131a",
    title: "Homestead Mission Control",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
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
    mainWindow.setAlwaysOnTop(true, "floating");
    mainWindow.setResizable(false);
    mainWindow.setSize(180, 180, true);
    mainWindow.setOpacity(0.9);
    const display = mainWindow.getBounds();
    mainWindow.setPosition(Math.max(16, display.x), Math.max(16, display.y), true);
    return { ok: true, mode };
  }

  mainWindow.setOpacity(1);
  mainWindow.setResizable(true);
  mainWindow.setAlwaysOnTop(false);
  mainWindow.setSize(1280, 820, true);
  mainWindow.center();
  return { ok: true, mode };
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
