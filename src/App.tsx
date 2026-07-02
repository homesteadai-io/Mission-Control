import { useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  Mic,
  MicOff,
  MonitorDot,
  PanelRightOpen,
  Radio,
  RefreshCw,
  Settings,
  Shrink,
  Volume2
} from "lucide-react";
import { seedArtifacts } from "./artifacts/seedArtifacts";
import { ArtifactErrorBoundary } from "./components/ArtifactErrorBoundary";
import { ArtifactPanel } from "./components/ArtifactPanel";
import { Avatar } from "./components/Avatar";
import { MenuOverlay } from "./components/MenuOverlay";
import { Transcript } from "./components/Transcript";
import type { AvatarState, CockpitMode } from "./types";
import { MissionVoiceKernel, type MissionVoiceSnapshot, type TranscriptLine } from "./voice/missionVoice";

const toolGroups = [
  {
    group: "Artifacts",
    tools: [
      { name: "render_markdown_artifact", status: "active" },
      { name: "render_mermaid_artifact", status: "active" },
      { name: "render_table_artifact", status: "active" }
    ]
  },
  {
    group: "Keep",
    tools: [
      { name: "keep_boot", status: "planned" },
      { name: "keep_search", status: "planned" }
    ]
  },
  { group: "Hands", tools: [{ name: "dispatch_to_codex", status: "planned" }] },
  {
    group: "Desktop",
    tools: [
      { name: "enter_computer_mode", status: "active" },
      { name: "exit_computer_mode", status: "active" },
      { name: "computer_action", status: "stub" }
    ]
  }
];

export function App() {
  const [mode, setMode] = useState<CockpitMode>("display");
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");
  const [selectedId, setSelectedId] = useState(seedArtifacts[0].id);
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);
  const [voiceSnapshot, setVoiceSnapshot] = useState<MissionVoiceSnapshot>({
    connected: false,
    connecting: false,
    alwaysListening: true,
    pushToTalkActive: false,
    aging: false
  });
  const voiceKernelRef = useRef<MissionVoiceKernel | null>(null);

  const selectedArtifact = useMemo(
    () => seedArtifacts.find((artifact) => artifact.id === selectedId) ?? seedArtifacts[0],
    [selectedId]
  );

  const voiceKernel = () => {
    if (!window.missionControl?.voice) {
      throw new Error("Mission Control voice bridge is unavailable.");
    }

    voiceKernelRef.current ??= new MissionVoiceKernel(window.missionControl, {
      onAvatarState: setAvatarState,
      onTranscript: (line) => setTranscriptLines((current) => [...current, line].slice(-80)),
      onSnapshot: setVoiceSnapshot
    });

    return voiceKernelRef.current;
  };

  const enterComputerMode = async () => {
    setMode("computer");
    setAvatarState("idle");
    await window.missionControl?.setWindowMode("computer");
  };

  const exitComputerMode = async () => {
    setMode("display");
    setAvatarState(voiceSnapshot.connected && voiceSnapshot.alwaysListening ? "listening" : "idle");
    await window.missionControl?.setWindowMode("display");
  };

  const toggleConnection = async () => {
    const kernel = voiceKernel();
    if (voiceSnapshot.connected) {
      await kernel.disconnect();
      return;
    }
    await kernel.connect();
  };

  const toggleAlwaysListening = () => {
    voiceKernel().setAlwaysListening(!voiceSnapshot.alwaysListening);
  };

  const startPushToTalk = () => {
    voiceKernel().setPushToTalkActive(true);
  };

  const stopPushToTalk = () => {
    voiceKernel().setPushToTalkActive(false);
  };

  const renewSession = async () => {
    await voiceKernel().reconnectWithSummary();
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
        <Transcript state={avatarState} lines={transcriptLines} />
        <div className="state-controls" aria-label="Avatar state controls">
          {(["idle", "listening", "thinking", "speaking", "aging", "degraded"] as AvatarState[]).map((state) => (
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
          <ArtifactErrorBoundary resetKey={selectedArtifact.id}>
            <ArtifactPanel artifact={selectedArtifact} />
          </ArtifactErrorBoundary>
        </div>
      </section>

      <footer className="bottom-bar">
        <button onClick={toggleConnection} className={voiceSnapshot.connected ? "is-active" : ""}>
          <Radio size={16} />
          {voiceSnapshot.connecting ? "Connecting" : voiceSnapshot.connected ? "Disconnect" : "Connect"}
        </button>
        <button onClick={toggleAlwaysListening} className={voiceSnapshot.alwaysListening ? "is-active" : ""}>
          {voiceSnapshot.alwaysListening ? <Mic size={16} /> : <MicOff size={16} />}
          Always Listening
        </button>
        <button
          disabled={!voiceSnapshot.connected || voiceSnapshot.alwaysListening}
          className={voiceSnapshot.pushToTalkActive ? "is-active" : ""}
          onMouseDown={startPushToTalk}
          onMouseUp={stopPushToTalk}
          onMouseLeave={stopPushToTalk}
          onTouchStart={startPushToTalk}
          onTouchEnd={stopPushToTalk}
        >
          <Volume2 size={16} />
          Hold to Talk
        </button>
        <button disabled={!voiceSnapshot.aging} onClick={renewSession}>
          <RefreshCw size={16} />
          Renew
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
