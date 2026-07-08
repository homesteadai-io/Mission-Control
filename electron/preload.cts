import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("missionControl", {
  setWindowMode: (mode: "display" | "computer") => ipcRenderer.invoke("window:set-mode", mode),
  voice: {
    createSession: (options?: { stateSummary?: string }) => ipcRenderer.invoke("voice:create-session", options),
    appendTranscript: (
      sessionId: string,
      entry: {
        role: "user" | "assistant" | "system";
        text: string;
        source: "history" | "event" | "renewal" | "manual";
        itemId?: string;
        eventType?: string;
        isFinal?: boolean;
      }
    ) => ipcRenderer.invoke("voice:append-transcript", sessionId, entry),
    logEvent: (entry: { type: string; sessionId?: string; detail?: Record<string, unknown> }) =>
      ipcRenderer.invoke("voice:log-event", entry)
  },
  board: {
    status: () => ipcRenderer.invoke("board:status"),
    prompt: (text: string) => ipcRenderer.invoke("board:prompt", text),
    messages: () => ipcRenderer.invoke("board:messages"),
    newSession: () => ipcRenderer.invoke("board:new-session"),
    onStatusChanged: (callback: (status: string, detail: string | null) => void) => {
      const handler = (_event: unknown, status: string, detail: string | null) => callback(status, detail);
      ipcRenderer.on("board:status-changed", handler);
      return () => ipcRenderer.removeListener("board:status-changed", handler);
    }
  },
  workspace: {
    importFile: (name: string, bytes: ArrayBuffer) => ipcRenderer.invoke("workspace:import", name, bytes),
    list: () => ipcRenderer.invoke("workspace:list"),
    reveal: (filePath: string) => ipcRenderer.invoke("workspace:reveal", filePath)
  },
  terminal: {
    spawn: (id: string, profile: string, cols: number, rows: number) =>
      ipcRenderer.invoke("pty:spawn", id, profile, cols, rows),
    input: (id: string, data: string) => ipcRenderer.invoke("pty:input", id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.invoke("pty:resize", id, cols, rows),
    kill: (id: string) => ipcRenderer.invoke("pty:kill", id),
    isRunning: (id: string) => ipcRenderer.invoke("pty:is-running", id),
    onData: (callback: (id: string, data: string) => void) => {
      const handler = (_event: unknown, id: string, data: string) => callback(id, data);
      ipcRenderer.on("pty:data", handler);
      return () => ipcRenderer.removeListener("pty:data", handler);
    },
    onExit: (callback: (id: string, exitCode: number) => void) => {
      const handler = (_event: unknown, id: string, exitCode: number) => callback(id, exitCode);
      ipcRenderer.on("pty:exit", handler);
      return () => ipcRenderer.removeListener("pty:exit", handler);
    }
  }
});
