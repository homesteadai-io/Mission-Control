import {
  RealtimeAgent,
  RealtimeSession,
  type RealtimeItem,
  type TransportEvent
} from "@openai/agents/realtime";
import type { AvatarState, TranscriptEntry } from "../types";
import type { MissionControlApi } from "../missionControlApi";
import { decideTranscriptAppend } from "./transcriptDedup";

export const REALTIME_MODEL = "gpt-realtime-2";
export const SESSION_RENEWAL_MS = 50 * 60 * 1000;
const RENEWAL_NUDGE =
  "System note: this realtime session is aging. Verbally offer to reconnect now in one concise sentence.";

export interface TranscriptLine extends TranscriptEntry {
  id: string;
  ts: string;
}

export interface MissionVoiceSnapshot {
  sessionId?: string;
  connected: boolean;
  connecting: boolean;
  alwaysListening: boolean;
  pushToTalkActive: boolean;
  aging: boolean;
  error?: string;
}

interface MissionVoiceCallbacks {
  onAvatarState: (state: AvatarState) => void;
  onTranscript: (line: TranscriptLine) => void;
  onSnapshot: (snapshot: MissionVoiceSnapshot) => void;
}

export class MissionVoiceKernel {
  #api: MissionControlApi;
  #callbacks: MissionVoiceCallbacks;
  #session: RealtimeSession | null = null;
  #sessionId: string | undefined;
  #alwaysListening = true;
  #pushToTalkActive = false;
  #connecting = false;
  #aging = false;
  #renewalTimer: number | undefined;
  #seenTranscriptKeys = new Set<string>();
  #systemInjectedTexts = new Set<string>();
  #lines: TranscriptLine[] = [];

  constructor(api: MissionControlApi, callbacks: MissionVoiceCallbacks) {
    this.#api = api;
    this.#callbacks = callbacks;
    this.#emitSnapshot();
  }

  async connect(stateSummary?: string) {
    if (this.#connecting || this.#session) return;

    this.#connecting = true;
    this.#aging = false;
    this.#callbacks.onAvatarState("thinking");
    this.#emitSnapshot();

    try {
      const minted = await this.#api.voice.createSession({ stateSummary });
      if (!minted.ok || !minted.clientSecret || !minted.sessionId || !minted.instructions) {
        throw new Error(minted.error ?? "Could not create a realtime voice session");
      }

      this.#sessionId = minted.sessionId;
      const instructions = minted.instructions;
      const agent = new RealtimeAgent({
        name: "Mission Control",
        instructions
      });

      const session = new RealtimeSession(agent, {
        model: REALTIME_MODEL,
        transport: "webrtc",
        config: {
          model: REALTIME_MODEL,
          instructions,
          reasoning: { effort: "low" },
          outputModalities: ["audio"],
          audio: {
            input: {
              noiseReduction: { type: "near_field" },
              transcription: {
                model: "gpt-4o-mini-transcribe",
                language: "en",
                prompt: "Expect operational software, Homestead, artifacts, agents, repositories, and desktop-control vocabulary."
              },
              turnDetection: {
                type: "server_vad",
                createResponse: true,
                interruptResponse: true,
                silenceDurationMs: 500,
                prefixPaddingMs: 300
              }
            },
            output: {
              voice: "marin"
            }
          },
          parallelToolCalls: false,
          toolChoice: "none",
          tools: []
        },
        workflowName: "Mission Control Voice Kernel",
        groupId: minted.sessionId
      });

      this.#attachSessionEvents(session);
      await session.connect({ apiKey: minted.clientSecret, model: REALTIME_MODEL });
      this.#session = session;
      this.#applyMuteState();
      this.#startRenewalTimer();
      await this.#logEvent("voice.connected", { model: REALTIME_MODEL, bargeIn: "sdk_audio_interrupted" });
      this.#appendSystemLine("Realtime voice session connected.");
      this.#callbacks.onAvatarState(this.#alwaysListening ? "listening" : "idle");
    } catch (error) {
      this.#callbacks.onAvatarState("degraded");
      this.#appendSystemLine(error instanceof Error ? error.message : "Voice connection failed.");
      await this.#logEvent("voice.connect_failed", {
        message: error instanceof Error ? error.message : "Unknown voice connection error"
      });
    } finally {
      this.#connecting = false;
      this.#emitSnapshot();
    }
  }

  async disconnect() {
    this.#clearRenewalTimer();
    this.#session?.close();
    this.#session = null;
    await this.#logEvent("voice.disconnected");
    this.#callbacks.onAvatarState("idle");
    this.#emitSnapshot();
  }

  async reconnectWithSummary() {
    const summary = this.buildStateSummary();
    await this.disconnect();
    await this.connect(summary);
  }

  setAlwaysListening(enabled: boolean) {
    this.#alwaysListening = enabled;
    this.#pushToTalkActive = false;
    this.#applyMuteState();
    this.#callbacks.onAvatarState(enabled && this.#session ? "listening" : "idle");
    void this.#logEvent("voice.listen_mode_changed", { alwaysListening: enabled });
    this.#emitSnapshot();
  }

  setPushToTalkActive(active: boolean) {
    if (this.#alwaysListening) return;
    this.#pushToTalkActive = active;
    this.#applyMuteState();
    this.#callbacks.onAvatarState(active ? "listening" : "idle");
    this.#emitSnapshot();
  }

  buildStateSummary() {
    const spoken = this.#lines
      .filter((line) => line.role !== "system")
      .slice(-6)
      .map((line) => `${line.role}: ${line.text}`)
      .join(" ");

    return spoken
      ? `Recent voice context: ${spoken}`.slice(0, 900)
      : "No substantive user or assistant voice turns have been captured yet.";
  }

  #attachSessionEvents(session: RealtimeSession) {
    session.on("audio_start", () => {
      this.#callbacks.onAvatarState("speaking");
    });

    session.on("audio_stopped", () => {
      this.#callbacks.onAvatarState(this.#alwaysListening ? "listening" : "idle");
    });

    session.on("audio_interrupted", () => {
      this.#callbacks.onAvatarState("listening");
      void this.#logEvent("voice.barge_in_detected", { source: "RealtimeSession.audio_interrupted" });
    });

    session.on("transport_event", (event) => {
      this.#handleTransportEvent(event);
    });

    session.on("history_updated", (history) => {
      this.#syncHistoryTranscripts(history);
    });

    session.on("error", (error) => {
      this.#callbacks.onAvatarState("degraded");
      this.#appendSystemLine("Realtime session error.");
      void this.#logEvent("voice.session_error", { message: stringifyError(error.error) });
    });
  }

  #handleTransportEvent(event: TransportEvent) {
    if (event.type === "input_audio_buffer.speech_started") {
      this.#callbacks.onAvatarState("listening");
    }

    if (event.type === "conversation.item.input_audio_transcription.completed") {
      this.#appendTranscript({
        role: "user",
        text: event.transcript,
        source: "event",
        itemId: event.item_id,
        eventType: event.type,
        isFinal: true
      });
    }

    if (event.type === "response.output_audio_transcript.done") {
      this.#appendTranscript({
        role: "assistant",
        text: event.transcript,
        source: "event",
        itemId: event.item_id,
        eventType: event.type,
        isFinal: true
      });
    }
  }

  #syncHistoryTranscripts(history: RealtimeItem[]) {
    for (const item of history) {
      if (item.type !== "message" || item.role === "system") continue;
      if (item.status !== "completed") continue;

      for (const content of item.content) {
        const text = extractText(content);
        if (!text) continue;
        const systemInjected = item.role === "user" && this.#systemInjectedTexts.has(text.trim());
        this.#appendTranscript({
          role: systemInjected ? "system" : item.role,
          text,
          source: systemInjected ? "renewal" : "history",
          itemId: item.itemId,
          isFinal: item.status === "completed"
        });
      }
    }
  }

  #appendSystemLine(text: string) {
    this.#appendTranscript({
      role: "system",
      text,
      source: "manual",
      isFinal: true
    });
  }

  #appendTranscript(entry: TranscriptEntry) {
    if (!this.#sessionId) return;
    const decision = decideTranscriptAppend(this.#seenTranscriptKeys, entry);
    if (!decision.append) return;
    const { key, normalizedText } = decision;
    this.#seenTranscriptKeys.add(key);

    const line = {
      ...entry,
      text: normalizedText,
      id: `${Date.now()}-${this.#seenTranscriptKeys.size}`,
      ts: new Date().toISOString()
    };

    this.#lines = [...this.#lines, line].slice(-80);
    this.#callbacks.onTranscript(line);
    void this.#api.voice.appendTranscript(this.#sessionId, entry);
  }

  #startRenewalTimer() {
    this.#clearRenewalTimer();
    this.#renewalTimer = window.setTimeout(() => {
      this.#aging = true;
      this.#callbacks.onAvatarState("aging");
      this.#appendTranscript({
        role: "system",
        text: "Session reached the 50-minute renewal threshold.",
        source: "renewal",
        isFinal: true
      });
      this.#systemInjectedTexts.add(RENEWAL_NUDGE);
      this.#session?.sendMessage(RENEWAL_NUDGE, { mission_control_origin: "session_renewal_nudge" });
      void this.#logEvent("voice.session_aging", { renewalThresholdMinutes: 50 });
      this.#emitSnapshot();
    }, SESSION_RENEWAL_MS);
  }

  #clearRenewalTimer() {
    if (this.#renewalTimer) {
      window.clearTimeout(this.#renewalTimer);
      this.#renewalTimer = undefined;
    }
  }

  #applyMuteState() {
    if (!this.#session) return;
    this.#session.mute(!this.#alwaysListening && !this.#pushToTalkActive);
  }

  async #logEvent(type: `voice.${string}`, detail?: Record<string, unknown>) {
    await this.#api.voice.logEvent({
      type,
      sessionId: this.#sessionId,
      detail
    });
  }

  #emitSnapshot() {
    this.#callbacks.onSnapshot({
      sessionId: this.#sessionId,
      connected: Boolean(this.#session),
      connecting: this.#connecting,
      alwaysListening: this.#alwaysListening,
      pushToTalkActive: this.#pushToTalkActive,
      aging: this.#aging
    });
  }
}

function extractText(content: RealtimeItem extends infer _ ? { type: string; text?: string; transcript?: string | null } : never) {
  if (content.type === "input_text" || content.type === "output_text") return content.text ?? "";
  if (content.type === "input_audio" || content.type === "output_audio") return content.transcript ?? "";
  return "";
}

function stringifyError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown realtime error";
}
