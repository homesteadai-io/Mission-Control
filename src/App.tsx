import { useMemo, useRef, useState } from "react";
import { LayoutPanelLeft, Mic, MicOff, Radio, RefreshCw, Settings, Shrink, Volume2, X } from "lucide-react";
import { seedArtifacts } from "./artifacts/seedArtifacts";
import { ArtifactErrorBoundary } from "./components/ArtifactErrorBoundary";
import { ArtifactPanel } from "./components/ArtifactPanel";
import { Avatar } from "./components/Avatar";
import { MenuOverlay } from "./components/MenuOverlay";
import { OperatorDesk } from "./components/OperatorDesk";
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
  {
    group: "Hands",
    tools: [
      { name: "claude_code_pane", status: "active" },
      { name: "codex_pane", status: "active" },
      { name: "dispatch_to_codex", status: "planned" }
    ]
  },
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
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");
  const [degradedReason, setDegradedReason] = useState<string | undefined>();
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
      onAvatarState: (state, reason) => {
        setAvatarState(state);
        setDegradedReason(reason);
      },
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
    <main className="desk-shell">
      <header className="desk-strip">
        <div className="desk-identity">
          <Avatar state={avatarState} degradedReason={degradedReason} compact />
          <div className="desk-identity-text">
            <h1>Charli</h1>
            <span className={`desk-state desk-state-${avatarState}`}>
              {degradedReason ?? stateLabel(avatarState)}
            </span>
          </div>
        </div>

        <div className="desk-transcript">
          <Transcript state={avatarState} lines={transcriptLines} />
        </div>

        <div className="desk-controls" aria-label="Voice controls">
          <button onClick={toggleConnection} className={voiceSnapshot.connected ? "is-active" : ""}>
            <Radio size={14} />
            {voiceSnapshot.connecting ? "Connecting" : voiceSnapshot.connected ? "Disconnect" : "Connect"}
          </button>
          <button onClick={toggleAlwaysListening} className={voiceSnapshot.alwaysListening ? "is-active" : ""}>
            {voiceSnapshot.alwaysListening ? <Mic size={14} /> : <MicOff size={14} />}
            Always
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
            <Volume2 size={14} />
            Hold
          </button>
          <button disabled={!voiceSnapshot.aging} onClick={renewSession}>
            <RefreshCw size={14} />
            Renew
          </button>
        </div>

        <div className="desk-views" aria-label="Views">
          <button onClick={() => setArtifactsOpen(true)} className={artifactsOpen ? "is-active" : ""}>
            <LayoutPanelLeft size={14} />
            Artifacts
          </button>
          <button onClick={() => setMode("menu")}>
            <Settings size={14} />
            Menu
          </button>
          <button onClick={enterComputerMode}>
            <Shrink size={14} />
            Computer
          </button>
        </div>
      </header>

      <OperatorDesk />

      {artifactsOpen ? (
        <div className="artifacts-backdrop" role="dialog" aria-modal="true" aria-label="Artifacts">
          <section className="artifacts-panel">
            <header className="workspace-header">
              <div>
                <p>Artifacts</p>
                <h1>Proof and cockpit records.</h1>
              </div>
              <div className="header-actions">
                <button onClick={() => setArtifactsOpen(false)} aria-label="Close artifacts">
                  <X size={16} />
                  Close
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
        </div>
      ) : null}

      {mode === "menu" ? <MenuOverlay groups={toolGroups} onClose={() => setMode("display")} /> : null}
    </main>
  );
}

function stateLabel(state: AvatarState) {
  switch (state) {
    case "idle":
      return "Standing by";
    case "listening":
      return "Listening…";
    case "thinking":
      return "Working…";
    case "speaking":
      return "Speaking";
    case "aging":
      return "Session aging — renew soon";
    case "degraded":
      return "Connection needs attention";
  }
}
