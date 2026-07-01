import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("missionControl", {
  setWindowMode: (mode: "display" | "computer") => ipcRenderer.invoke("window:set-mode", mode)
});
