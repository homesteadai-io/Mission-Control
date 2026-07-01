import { useMemo, useState } from "react";
import { ChevronLeft, MonitorDot, PanelRightOpen, Radio, Settings, Shrink, Volume2 } from "lucide-react";
import { seedArtifacts } from "./artifacts/seedArtifacts";
import { ArtifactPanel } from "./components/ArtifactPanel";
import { Avatar } from "./components/Avatar";
import { MenuOverlay } from "./components/MenuOverlay";
import { Transcript } from "./components/Transcript";
import type { AvatarState, CockpitMode } from "./types";

const toolGroups = [
  { group: "Artifacts", tools: ["render_markdown_artifact", "render_mermaid_artifact", "render_table_artifact"] },
  { group: "Keep", tools: ["keep_boot", "keep_search"] },
  { group: "Hands", tools: ["dispatch_to_codex"] },
  { group: "Desktop", tools: ["enter_computer_mode", "exit_computer_mode", "computer_action"] }
];

export function App() {
  const [mode, setMode] = useState<CockpitMode>("display");
  const [avatarState, setAvatarState] = useState<AvatarState>("listening");
  const [selectedId, setSelectedId] = useState(seedArtifacts[0].id);

  const selectedArtifact = useMemo(
    () => seedArtifacts.find((artifact) => artifact.id === selectedId) ?? seedArtifacts[0],
    [selectedId]
  );

  const enterComputerMode = async () => {
    setMode("computer");
    setAvatarState("idle");
    await window.missionControl?.setWindowMode("computer");
  };

  const exitComputerMode = async () => {
    setMode("display");
    setAvatarState("listening");
    await window.missionControl?.setWindowMode("display");
  };

  if (mode === "computer") {
    return (
      <main className="orb-shell" aria-label="Mission Control compact mode">
        <button className="orb-button" onClick={exitComputerMode} aria-label="Restore display mode">
          <Avatar state="idle" compact />
          <span>MC</span>
        </button>
      </main>
    );
  }

  return (
    <main className="cockpit-shell">
      <section className="avatar-rail" aria-label="Voice cockpit">
        <div className="brand-row">
          <MonitorDot size={20} />
          <span>Homestead Mission Control</span>
        </div>
        <Avatar state={avatarState} />
        <Transcript state={avatarState} />
        <div className="state-controls" aria-label="Avatar state controls">
          {(["idle", "listening", "thinking", "speaking", "degraded"] as AvatarState[]).map((state) => (
            <button
              key={state}
              className={avatarState === state ? "is-active" : ""}
              onClick={() => setAvatarState(state)}
            >
              {state}
            </button>
          ))}
        </div>
      </section>

      <section className="artifact-workspace">
        <header className="workspace-header">
          <div>
            <p>Phase 1 Shell</p>
            <h1>Artifacts, proof, and cockpit state in one pane.</h1>
          </div>
          <div className="header-actions">
            <button onClick={() => setMode("menu")}>
              <Settings size={16} />
              Menu
            </button>
            <button onClick={enterComputerMode}>
              <Shrink size={16} />
              Computer
            </button>
          </div>
        </header>

        <div className="workspace-grid">
          <nav className="artifact-list" aria-label="Artifacts">
            {seedArtifacts.map((artifact) => (
              <button
                key={artifact.id}
                className={artifact.id === selectedId ? "is-active" : ""}
                onClick={() => setSelectedId(artifact.id)}
              >
                <span>{artifact.title}</span>
                <small>{artifact.type}</small>
              </button>
            ))}
          </nav>
          <ArtifactPanel artifact={selectedArtifact} />
        </div>
      </section>

      <footer className="bottom-bar">
        <button>
          <Radio size={16} />
          Connect
        </button>
        <button>
          <Volume2 size={16} />
          Mute
        </button>
        <button onClick={() => setMode("menu")}>
          <PanelRightOpen size={16} />
          Menu
        </button>
        <button onClick={enterComputerMode}>
          <ChevronLeft size={16} />
          Computer Mode
        </button>
      </footer>

      {mode === "menu" ? <MenuOverlay groups={toolGroups} onClose={() => setMode("display")} /> : null}
    </main>
  );
}
