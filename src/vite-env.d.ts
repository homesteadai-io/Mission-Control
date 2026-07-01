/// <reference types="vite/client" />

interface Window {
  missionControl?: {
    setWindowMode: (mode: "display" | "computer") => Promise<{ ok: boolean; mode?: string }>;
  };
}
