import { useEffect, useRef, useState } from "react";
import type {
  CharliFocusTarget,
  MissionEventView,
  PetSkin,
  PetState,
  PetVoiceConfigView,
  SpineEventView,
  SpineSource
} from "../missionControlApi";
import { decideSpeech, spokenLineFor, type SpeechReason } from "../voice/petSpeech";
import "../styles/pet.css";

/**
 * Dutch v4 — the pet IS the agent surface. Mission input on top, Dutch's
 * animation state driven by real SDK mission events (honesty ceiling: unknown
 * = idle, never faked), ambient ears for external Claude/Codex turns demoted
 * to a slim expandable strip.
 */

function relativeTime(iso: string): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const OTHER: Record<SpineSource, string> = { codex: "Claude", claude: "Codex" };

const STATE_LABEL: Record<PetState, string> = {
  idle: "",
  running: "on it…",
  waiting: "needs you",
  jumping: "done!",
  review: "reviewing",
  failed: "hit a wall",
  waving: "heard a turn",
  "run-left": "",
  "run-right": ""
};

interface SourceRowProps {
  source: SpineSource;
  event: SpineEventView | null;
  sent: boolean;
  sending: boolean;
  onFocus: () => void;
  onSend: () => void;
}

function SourceRow({ source, event, sent, sending, onFocus, onSend }: SourceRowProps) {
  const label = source === "codex" ? "Codex" : "Claude";
  if (!event) {
    return (
      <div className="pet-row pet-row-idle">
        <button className="pet-source" onClick={onFocus} title={`Focus ${label}`}>
          {label}
        </button>
        <span className="pet-quiet">quiet</span>
      </div>
    );
  }
  const fresh = Date.now() - new Date(event.timestamp).getTime() < 30 * 60_000;
  const preview = event.message.replace(/\s+/g, " ").trim();
  return (
    <div className={`pet-block${fresh ? " pet-row-fresh" : ""}`}>
      <div className="pet-row">
        <button className="pet-source" onClick={onFocus} title={`Focus ${label}`}>
          {label}
        </button>
        <span className="pet-when">{relativeTime(event.timestamp)}</span>
        {preview.length > 0 && !sent && (
          <button
            className="pet-send"
            disabled={sending}
            onClick={onSend}
            title={`Sends the note below into ${OTHER[source]}'s window for review`}
          >
            {sending ? "…" : `→ ${OTHER[source]}`}
          </button>
        )}
        {sent && <span className="pet-sent">sent ✓</span>}
      </div>
      {preview.length > 0 && <div className="pet-preview">{preview}</div>}
    </div>
  );
}

export function PetApp() {
  const [skin, setSkin] = useState<PetSkin | null>(null);
  const [frame, setFrame] = useState(0);
  const [petState, setPetState] = useState<PetState>("idle");
  const [codexEvent, setCodexEvent] = useState<SpineEventView | null>(null);
  const [claudeEvent, setClaudeEvent] = useState<SpineEventView | null>(null);
  const [sending, setSending] = useState<SpineSource | null>(null);
  const [sentTurns, setSentTurns] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [earsOpen, setEarsOpen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateBeforeDrag = useRef<PetState>("idle");
  const dragging = useRef(false);
  const petStateRef = useRef<PetState>("idle");
  const [missionInput, setMissionInput] = useState("");
  const [missionBusy, setMissionBusy] = useState(false);
  const [missionNote, setMissionNote] = useState<MissionEventView | null>(null);

  const api = window.missionControl?.charli;
  const missionApi = window.missionControl?.mission;
  const voiceApi = window.missionControl?.petVoice;
  const voiceConfig = useRef<PetVoiceConfigView | null>(null);
  const lastSpokenAt = useRef<number | null>(null);

  useEffect(() => {
    if (!voiceApi) return;
    void voiceApi.config().then((result) => {
      if (result.ok && result.voice) voiceConfig.current = result.voice;
    });
  }, [voiceApi]);

  /**
   * Dutch speaks through the Windows built-in voices (free, offline).
   * Debounce + quiet hours decided by petSpeech; every spoken AND
   * suppressed line is traced to missions.jsonl. TTS failure never blocks
   * the bubble — voice is additive.
   */
  function speak(reason: SpeechReason, text: string, missionId?: string) {
    const config = voiceConfig.current;
    if (!config) return;
    const now = Date.now();
    const decision = decideSpeech(config, reason, lastSpokenAt.current, now, new Date());
    const line = spokenLineFor(reason, text);
    void voiceApi?.logLine({
      missionId: missionId ?? null,
      reason,
      line,
      spoken: decision.speak,
      suppressed: decision.suppressed ?? null
    });
    if (!decision.speak) return;
    lastSpokenAt.current = now;
    try {
      const utterance = new SpeechSynthesisUtterance(line);
      utterance.rate = config.rate || 1.0;
      if (config.voiceName) {
        const voice = window.speechSynthesis
          .getVoices()
          .find((v) => v.name.toLowerCase().includes(config.voiceName!.toLowerCase()));
        if (voice) utterance.voice = voice;
      }
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.error(`[pet] speech failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Enter a state, optionally followed by a timed sequence
   * (e.g. jumping 2.5s → review 4.5s → idle). Any new call cancels the
   * pending sequence, so a fresh mission always wins over a decaying one.
   */
  function enterState(state: PetState, ...sequence: Array<[number, PetState]>) {
    if (stateTimer.current) clearTimeout(stateTimer.current);
    setPetState(state);
    petStateRef.current = state;
    setFrame(0);
    if (sequence.length > 0) {
      const [[afterMs, next], ...rest] = sequence;
      stateTimer.current = setTimeout(() => enterState(next, ...rest), afterMs);
    }
  }

  useEffect(() => {
    if (!api) return;
    void api.skin().then((result) => {
      if (!result.ok) console.error(`[pet] skin load failed: ${result.error}`);
      if (result.ok && result.skin) setSkin(result.skin);
    });
    void api.status().then((result) => {
      if (!result.ok) return;
      if (result.codex) setCodexEvent(result.codex);
      if (result.claude) setClaudeEvent(result.claude);
    });
    return api.onEvent((event) => {
      if (event.source === "codex") setCodexEvent(event);
      else setClaudeEvent(event);
      // Honesty: an external turn only ever waves — mission states belong to
      // Dutch's own missions. Never interrupt one for ambient noise.
      if (petStateRef.current === "idle") {
        enterState("waving", [2_500, "idle"]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  useEffect(() => {
    if (!api) return;
    return api.onDrag((direction) => {
      if (!dragging.current) {
        dragging.current = true;
        stateBeforeDrag.current = petStateRef.current;
      }
      if (stateTimer.current) clearTimeout(stateTimer.current);
      const runState: PetState = direction === "left" ? "run-left" : "run-right";
      setPetState(runState);
      petStateRef.current = runState;
      if (dragTimer.current) clearTimeout(dragTimer.current);
      dragTimer.current = setTimeout(() => {
        dragging.current = false;
        enterState(stateBeforeDrag.current);
      }, 500);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  useEffect(() => {
    if (!missionApi) return;
    return missionApi.onEvent((event) => {
      setMissionNote(event);
      if (event.kind === "started" || event.kind === "tool_use" || event.kind === "assistant_text") {
        if (!dragging.current) enterState("running");
      }
      if (event.kind === "completed") {
        setMissionBusy(false);
        enterState("jumping", [2_500, "review"], [4_500, "idle"]);
        speak("completed", event.text, event.missionId);
      }
      if (event.kind === "failed") {
        setMissionBusy(false);
        enterState("failed", [5_000, "idle"]);
        speak("failed", event.text, event.missionId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionApi]);

  useEffect(() => {
    if (!skin) return;
    const row = activeRow(skin, petState);
    const timer = setInterval(() => {
      setFrame((current) => (current + 1) % Math.max(1, row.frames));
    }, skin.frameRateMs);
    return () => clearInterval(timer);
  }, [skin, petState]);

  function showToast(text: string) {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4_000);
  }

  async function focus(target: CharliFocusTarget) {
    const result = await api?.focus(target);
    if (result && !result.ok) showToast(result.detail ?? "Focus failed");
  }

  async function send(source: SpineSource, event: SpineEventView | null) {
    if (!api || !event) return;
    setSending(source);
    try {
      const result = await api.sendHandoff(source);
      if (result.ok) {
        setSentTurns((current) => new Set(current).add(`${source}:${event.turn_id}:${event.timestamp}`));
        showToast(`Handed to ${OTHER[source]}`);
      } else {
        showToast(result.detail ?? "Handoff failed");
      }
    } finally {
      setSending(null);
    }
  }

  async function launchMission() {
    const text = missionInput.trim();
    if (!missionApi || !text || missionBusy) return;
    setMissionBusy(true);
    setMissionNote(null);
    const result = await missionApi.start(text);
    if (!result.ok) {
      setMissionBusy(false);
      showToast(result.error ?? "Mission rejected");
      return;
    }
    setMissionInput("");
    enterState("running");
  }

  function activeRow(theSkin: PetSkin, state: PetState): { row: number; frames: number } {
    const match = theSkin.stateRows?.find((entry) => entry.state === state);
    if (match) return { row: match.row, frames: match.frames };
    return { row: theSkin.idleRow, frames: theSkin.idleFrames };
  }

  const row = skin ? activeRow(skin, petState) : null;
  const spriteStyle =
    skin && row
      ? {
          width: skin.frameWidth * skin.scale,
          height: skin.frameHeight * skin.scale,
          backgroundImage: `url(${skin.imageDataUrl})`,
          backgroundSize: `${skin.cols * skin.frameWidth * skin.scale}px ${skin.rows * skin.frameHeight * skin.scale}px`,
          backgroundPosition: `-${(frame % row.frames) * skin.frameWidth * skin.scale}px -${row.row * skin.frameHeight * skin.scale}px`
        }
      : undefined;

  const wasSent = (source: SpineSource, event: SpineEventView | null) =>
    !!event && sentTurns.has(`${source}:${event.turn_id}:${event.timestamp}`);

  const missionStatusText = missionNote
    ? missionNote.kind === "tool_use"
      ? `using ${missionNote.text}`
      : missionNote.text
    : missionBusy
      ? "starting…"
      : null;

  const stateLabel = STATE_LABEL[petState];
  const earsSummary = [
    claudeEvent ? `Claude ${relativeTime(claudeEvent.timestamp)}` : "Claude quiet",
    codexEvent ? `Codex ${relativeTime(codexEvent.timestamp)}` : "Codex quiet"
  ].join(" · ");

  return (
    <div className="pet-shell">
      <div className="pet-bubble">
        <div className="pet-title-row">
          <span className="pet-name">Dutch</span>
          {stateLabel && <span className={`pet-state pet-state-${petState}`}>{stateLabel}</span>}
        </div>
        <div className="pet-mission-row">
          <input
            className="pet-mission-input"
            placeholder="Mission for Dutch…"
            value={missionInput}
            disabled={missionBusy}
            onChange={(event) => setMissionInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void launchMission();
            }}
          />
          <button
            className="pet-send"
            disabled={missionBusy || !missionInput.trim()}
            onClick={() => void launchMission()}
            title="Run this mission with Dutch's embedded Claude brain"
          >
            {missionBusy ? "…" : "Go"}
          </button>
        </div>
        {missionStatusText && (
          <div
            className={`pet-mission-note pet-mission-${missionNote?.kind ?? "started"}`}
            title={missionNote?.authLane === "metered" ? "WARNING: metered API spend" : undefined}
          >
            {missionNote?.authLane === "metered" && missionNote.kind === "auth" ? "⚠ " : ""}
            {missionStatusText}
          </div>
        )}
        <button
          className="pet-ears-strip"
          onClick={() => setEarsOpen((open) => !open)}
          title="External turns Dutch overheard (Claude Code / Codex sessions)"
        >
          <span className="pet-ears-icon">{earsOpen ? "▾" : "▸"}</span> {earsSummary}
        </button>
        {earsOpen && (
          <div className="pet-ears-detail">
            <SourceRow
              source="claude"
              event={claudeEvent}
              sent={wasSent("claude", claudeEvent)}
              sending={sending === "claude"}
              onFocus={() => void focus("claude")}
              onSend={() => void send("claude", claudeEvent)}
            />
            <SourceRow
              source="codex"
              event={codexEvent}
              sent={wasSent("codex", codexEvent)}
              sending={sending === "codex"}
              onFocus={() => void focus("codex")}
              onSend={() => void send("codex", codexEvent)}
            />
            <div className="pet-row pet-row-flux">
              <button className="pet-source" onClick={() => void focus("flux")} title="Surface Flux">
                Flux
              </button>
            </div>
          </div>
        )}
        {toast && <div className="pet-toast">{toast}</div>}
      </div>
      <div className="pet-sprite" style={spriteStyle} title="Dutch" />
    </div>
  );
}
