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
  }
});
