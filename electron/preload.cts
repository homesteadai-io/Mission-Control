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
    ask: (text: string) => ipcRenderer.invoke("board:ask", text),
    messages: () => ipcRenderer.invoke("board:messages"),
    newSession: () => ipcRenderer.invoke("board:new-session"),
    permissions: () => ipcRenderer.invoke("board:permissions"),
    replyPermission: (requestId: string, reply: string) =>
      ipcRenderer.invoke("board:reply-permission", requestId, reply),
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
    submitLine: (id: string, text: string) => ipcRenderer.invoke("pty:submit-line", id, text),
    readRecent: (id: string, maxChars?: number) => ipcRenderer.invoke("pty:read-recent", id, maxChars),
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
  },
  clipboard: {
    readText: () => ipcRenderer.invoke("clipboard:read-text"),
    writeText: (text: string) => ipcRenderer.invoke("clipboard:write-text", text)
  },
  mission: {
    start: (text: string) => ipcRenderer.invoke("mission:start", text),
    onEvent: (callback: (event: unknown) => void) => {
      const handler = (_event: unknown, payload: unknown) => callback(payload);
      ipcRenderer.on("mission:event", handler);
      return () => ipcRenderer.removeListener("mission:event", handler);
    }
  },
  charli: {
    status: () => ipcRenderer.invoke("charli:status"),
    skin: () => ipcRenderer.invoke("charli:skin"),
    focus: (target: string) => ipcRenderer.invoke("charli:focus", target),
    sendHandoff: (source: string) => ipcRenderer.invoke("charli:send-handoff", source),
    onEvent: (callback: (event: unknown) => void) => {
      const handler = (_event: unknown, payload: unknown) => callback(payload);
      ipcRenderer.on("charli:event", handler);
      return () => ipcRenderer.removeListener("charli:event", handler);
    }
  }
});
