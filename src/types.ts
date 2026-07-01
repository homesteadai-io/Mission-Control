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
