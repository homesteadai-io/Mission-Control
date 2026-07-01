import type { ArtifactRecord } from "../types";

const now = new Date("2026-07-01T00:00:00Z").toISOString();

export const seedArtifacts: ArtifactRecord[] = [
  {
    id: "art_phase_1_brief",
    type: "markdown",
    title: "Phase 1 Acceptance Brief",
    content:
      "# Mission Control Phase 1\n\nElectron shell with display, menu, and computer modes. Artifact panel renders markdown, Mermaid, tables, and image grids as first-class records.\n\n- Door boot remains read-only in later phases.\n- Keep writes route through Codex dispatch, not a second door.\n- Computer mode is a UI state only in v0.",
    createdAt: now,
    source: "seed"
  },
  {
    id: "art_loop_map",
    type: "mermaid",
    title: "Loop Forge Route",
    content:
      "flowchart LR\n  Adam[Adam command] --> Planner[Planner]\n  Planner --> Builder[Builder]\n  Builder --> Adversary[Adversary]\n  Adversary --> Resolver[Resolver]\n  Resolver --> Artifact[Visible artifact]",
    createdAt: now,
    source: "seed"
  },
  {
    id: "art_broken_mermaid",
    type: "mermaid",
    title: "Repair Exercise",
    content:
      "Adam --> MissionControl\nMissionControl --> ArtifactPanel\nArtifactPanel --> ClickableProof",
    createdAt: now,
    source: "seed"
  },
  {
    id: "art_tools_table",
    type: "table",
    title: "Registered Phase 1 Surfaces",
    content: JSON.stringify([
      { surface: "Display", status: "active", note: "Avatar plus artifact panel" },
      { surface: "Menu", status: "active", note: "Tool registry overlay" },
      { surface: "Computer", status: "stub", note: "Shrinks/restores shell only" }
    ]),
    createdAt: now,
    source: "seed"
  },
  {
    id: "art_avatar_refs",
    type: "image-grid",
    title: "Avatar References",
    content: JSON.stringify([
      { src: "/assets/avatar/face.png", label: "Brush face" },
      { src: "/assets/avatar/screen-reference.jpg", label: "Listening monitor" }
    ]),
    createdAt: now,
    source: "seed"
  }
];
