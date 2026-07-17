import { useEffect, useRef, useState } from "react";
import type {
  MissionEventView,
  PetSkin,
  PetState,
  PetVoiceConfigView
} from "../missionControlApi";
import { decideSpeech, spokenLineFor, type SpeechReason } from "../voice/petSpeech";
import { MissionVoiceKernel, type TranscriptLine } from "../voice/missionVoice";
import { buildDutchTools } from "../voice/dutchTools";
import "../styles/pet.css";

/**
 * Dutch v4 — the pet IS the agent surface. Mission input, his own live state
 * (honesty ceiling: unknown = idle, never faked), voice, and approval chips.
 * External Claude/Codex turns still make him wave (honest ambient state) but
 * are no longer surfaced as a panel — Dutch is a doer, not a router.
 */

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

export function PetApp() {
  const [skin, setSkin] = useState<PetSkin | null>(null);
  const [frame, setFrame] = useState(0);
  const [petState, setPetState] = useState<PetState>("idle");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateBeforeDrag = useRef<PetState>("idle");
  const dragging = useRef(false);
  const petStateRef = useRef<PetState>("idle");
  const [missionInput, setMissionInput] = useState("");
  const [missionBusy, setMissionBusy] = useState(false);
  const [missionNote, setMissionNote] = useState<MissionEventView | null>(null);
  const [pendingChip, setPendingChip] = useState<MissionEventView | null>(null);

  const api = window.missionControl?.charli;
  const missionApi = window.missionControl?.mission;
  const voiceApi = window.missionControl?.petVoice;
  const voiceConfig = useRef<PetVoiceConfigView | null>(null);
  const lastSpokenAt = useRef<number | null>(null);
  const kernelRef = useRef<MissionVoiceKernel | null>(null);
  const latestMissionEvent = useRef<MissionEventView | null>(null);
  const [voiceLive, setVoiceLive] = useState(false);
  const [voiceConnecting, setVoiceConnecting] = useState(false);
  const [voiceLine, setVoiceLine] = useState<TranscriptLine | null>(null);

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
    return api.onEvent(() => {
      // Honesty: an external turn Dutch overheard only ever makes him wave —
      // mission states belong to his own missions. Never interrupt one.
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
      latestMissionEvent.current = event;
      if (event.kind === "started" || event.kind === "tool_use" || event.kind === "assistant_text") {
        if (!dragging.current) enterState("running");
      }
      if (event.kind === "permission_request") {
        setPendingChip(event);
        enterState("waiting");
        // One audible ping per waiting episode; bypasses debounce, not quiet hours.
        if (kernelRef.current?.connected) {
          kernelRef.current.notify("System note: a permission chip is waiting for Adam. Say 'Dutch needs you' briefly.");
        } else {
          speak("attention", "", event.missionId);
        }
      }
      if (event.kind === "permission_resolved") {
        setPendingChip((current) => (current?.requestId === event.requestId ? null : current));
        enterState("running");
      }
      if (event.kind === "completed") {
        setMissionBusy(false);
        setPendingChip(null);
        enterState("jumping", [2_500, "review"], [4_500, "idle"]);
        announce("completed", event.text, event.missionId);
      }
      if (event.kind === "failed") {
        setMissionBusy(false);
        setPendingChip(null);
        enterState("failed", [5_000, "idle"]);
        announce("failed", event.text, event.missionId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionApi]);

  /**
   * One announcement path, two mouths: with the realtime session live, the
   * conversational voice reports the result (and Windows TTS stays quiet so
   * Dutch never talks over himself); otherwise the free Windows voice speaks.
   */
  function announce(reason: "completed" | "failed", text: string, missionId?: string) {
    if (kernelRef.current?.connected) {
      kernelRef.current.notify(
        `System note: the mission just ${reason === "completed" ? "completed" : "failed"} — result: ${text}. ` +
          "Tell Adam in one short sentence."
      );
      void voiceApi?.logLine({
        missionId: missionId ?? null,
        reason,
        line: "(announced via realtime voice)",
        spoken: true,
        suppressed: null
      });
      return;
    }
    speak(reason, text, missionId);
  }

  async function toggleVoice() {
    if (voiceConnecting) return;
    if (kernelRef.current?.connected) {
      await kernelRef.current.disconnect();
      setVoiceLine(null);
      return;
    }
    const fullApi = window.missionControl;
    if (!fullApi || !missionApi) return;
    if (!kernelRef.current) {
      kernelRef.current = new MissionVoiceKernel(
        fullApi,
        {
          onAvatarState: (state) => {
            if (state === "speaking" && petStateRef.current === "idle") {
              enterState("waving");
            } else if ((state === "listening" || state === "idle") && petStateRef.current === "waving") {
              enterState("idle");
            }
          },
          onTranscript: (line) => {
            if (line.role !== "system") setVoiceLine(line);
          },
          onSnapshot: (snapshot) => {
            setVoiceLive(snapshot.connected);
            setVoiceConnecting(snapshot.connecting);
          }
        },
        {
          persona: "dutch",
          agentName: "Dutch",
          tools: buildDutchTools(missionApi, () => latestMissionEvent.current)
        }
      );
    }
    await kernelRef.current.connect();
  }

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

  async function replyChip(reply: "once" | "mission" | "deny") {
    if (!missionApi || !pendingChip?.requestId) return;
    const result = await missionApi.replyPermission(pendingChip.requestId, reply);
    if (!result.ok) showToast(result.error ?? "Reply failed");
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

  const missionStatusText = missionNote
    ? missionNote.kind === "tool_use"
      ? `using ${missionNote.text}`
      : missionNote.text
    : missionBusy
      ? "starting…"
      : null;

  const stateLabel = STATE_LABEL[petState];

  return (
    <div className="pet-shell">
      <div className="pet-bubble">
        <div className="pet-title-row">
          <span className="pet-name">Dutch</span>
          {stateLabel && <span className={`pet-state pet-state-${petState}`}>{stateLabel}</span>}
          <button
            className={`pet-mic${voiceLive ? " pet-mic-live" : ""}`}
            disabled={voiceConnecting}
            onClick={() => void toggleVoice()}
            title={
              voiceLive
                ? "Voice is live — click to hang up"
                : "Talk to Dutch (OpenAI realtime voice — metered on your OpenAI key)"
            }
          >
            {voiceConnecting ? "…" : voiceLive ? "🎙️" : "🎤"}
          </button>
        </div>
        {voiceLine && (
          <div className={`pet-voice-line pet-voice-${voiceLine.role}`}>
            {voiceLine.role === "user" ? "you: " : "dutch: "}
            {voiceLine.text}
          </div>
        )}
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
        {missionStatusText && !pendingChip && (
          <div
            className={`pet-mission-note pet-mission-${missionNote?.kind ?? "started"}`}
            title={missionNote?.authLane === "metered" ? "WARNING: metered API spend" : undefined}
          >
            {missionNote?.authLane === "metered" && missionNote.kind === "auth" ? "⚠ " : ""}
            {missionStatusText}
          </div>
        )}
        {pendingChip && (
          <div className="pet-chip-block">
            <div className="pet-chip-title">{pendingChip.text}</div>
            <div className="pet-chip-row">
              <button className="pet-chip pet-chip-allow" onClick={() => void replyChip("once")}>
                Allow once
              </button>
              <button className="pet-chip pet-chip-allow" onClick={() => void replyChip("mission")}>
                This mission
              </button>
              <button className="pet-chip pet-chip-deny" onClick={() => void replyChip("deny")}>
                Deny
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
