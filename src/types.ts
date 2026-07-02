export type CockpitMode = "display" | "computer" | "menu";
export type AvatarState = "idle" | "listening" | "thinking" | "speaking" | "degraded";

export type ArtifactType = "markdown" | "mermaid" | "table" | "image-grid";

export interface ArtifactRecord {
  id: string;
  type: ArtifactType;
  title: string;
  content: string;
  createdAt: string;
  source: "seed" | "voice" | "tool";
}

export interface TranscriptEntry {
  role: "user" | "assistant" | "system";
  text: string;
  source: "history" | "event" | "renewal" | "manual";
  itemId?: string;
  eventType?: string;
  isFinal?: boolean;
}
