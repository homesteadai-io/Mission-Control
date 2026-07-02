/// <reference types="vite/client" />

import type { MissionControlApi } from "./missionControlApi";

declare global {
  interface Window {
    missionControl?: MissionControlApi;
  }
}
