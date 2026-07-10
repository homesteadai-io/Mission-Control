import {
  RealtimeAgent,
  RealtimeSession,
  tool,
  type RealtimeItem,
  type TransportEvent
} from "@openai/agents/realtime";
import type { AvatarState, TranscriptEntry } from "../types";
import type { MissionControlApi } from "../missionControlApi";
import { decideTranscriptAppend } from "./transcriptDedup";
import { transitionAudioSession } from "./bargeIn";
import { normalizeTarget, routeCommand, type RouteResult, type RouteTarget } from "./switchboard";

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
  onAvatarState: (state: AvatarState, reason?: string) => void;
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
  #speaking = false;
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
        instructions,
        tools: [this.#buildDispatchTool(), this.#buildReadAgentTool()]
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
          toolChoice: "auto"
        },
        workflowName: "Mission Control Voice Kernel",
        groupId: minted.sessionId
      });

      this.#attachSessionEvents(session);
      await session.connect({ apiKey: minted.clientSecret, model: REALTIME_MODEL });
      this.#session = session;
      this.#applyMuteState();
      this.#startRenewalTimer();
      await this.#logEvent("voice.connected", { model: REALTIME_MODEL, bargeIn: "audio_start_overlap" });
      this.#appendSystemLine("Realtime voice session connected.");
      this.#callbacks.onAvatarState(this.#alwaysListening ? "listening" : "idle");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Voice connection failed.";
      this.#callbacks.onAvatarState("degraded", message);
      this.#appendSystemLine(message);
      await this.#logEvent("voice.connect_failed", { message });
    } finally {
      this.#connecting = false;
      this.#emitSnapshot();
    }
  }

  async disconnect() {
    this.#clearRenewalTimer();
    this.#session?.close();
    this.#session = null;
    this.#speaking = false;
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

  /**
   * Route a command to a coding pane, or surface Flux. This is the switchboard
   * core; the voice tool calls it, and it is directly callable for verification.
   */
  async routeCommand(target: RouteTarget, text: string): Promise<RouteResult> {
    const result = await routeCommand(target, text, {
      submitToPane: (paneId, line) => this.#api.terminal.submitLine(paneId, line),
      surfaceFlux: () => this.#api.charli.focus("flux"),
      logDispatch: (routedTarget, chars) => {
        void this.#logEvent("voice.dispatch", { target: routedTarget, chars });
      }
    });
    this.#appendSystemLine(result.detail);
    return result;
  }

  /** Read an agent's recent output so Charli can report status or a reply. */
  async readAgent(target: RouteTarget): Promise<string> {
    if (target === "flux") {
      return "Flux is a notepad surface — there's nothing to read back from it here.";
    }
    const paneId = target as "claude" | "codex";
    const result = await this.#api.terminal.readRecent(paneId, 2000);
    if (!result.ok) return result.error ?? `The ${paneId} pane is unavailable.`;
    const text = (result.text ?? "").trim();
    return text || `The ${paneId} pane has produced no output yet.`;
  }

  #buildDispatchTool() {
    return tool({
      name: "send_to_agent",
      description:
        "Route the operator's command: 'claude' (Claude Code pane) or 'codex' (Codex pane) types the command into that terminal and runs it; 'flux' surfaces the Flux notepad window (no text is sent). Use this whenever the operator asks to send, tell, or dispatch work to one of the agents, or to open/surface Flux.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            enum: ["claude", "codex", "flux"],
            description: "Which workstation to route to."
          },
          text: {
            type: "string",
            description: "The exact command or request to deliver (ignored for flux)."
          }
        },
        required: ["target", "text"],
        additionalProperties: false
      },
      execute: async (input: unknown) => {
        const { target: rawTarget, text } = input as { target: string; text: string };
        const target = normalizeTarget(rawTarget);
        if (!target) return "I don't know that workstation — claude, codex, or flux.";
        const result = await this.routeCommand(target, text);
        return result.detail;
      }
    });
  }

  #buildReadAgentTool() {
    return tool({
      name: "read_agent",
      description:
        "Read an agent's most recent output so you can report its status or relay its reply. 'claude' = Claude Code pane, 'codex' = Codex pane. Use this whenever the operator asks what an agent said, its status, whether it's ready, or to check on dispatched work. After sending a command with send_to_agent, wait a moment, then read_agent to see the result.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            enum: ["claude", "codex"],
            description: "Which workstation to read from."
          }
        },
        required: ["target"],
        additionalProperties: false
      },
      execute: async (input: unknown) => {
        const { target: rawTarget } = input as { target: string };
        const target = normalizeTarget(rawTarget) ?? "claude";
        return this.readAgent(target);
      }
    });
  }

  #attachSessionEvents(session: RealtimeSession) {
    session.on("audio_start", () => {
      const transition = transitionAudioSession(this.#speaking, "audio_start");
      this.#speaking = transition.speaking;
      if (transition.bargeIn) {
        // New audio is starting in this same tick, so there's no separate
        // "listening" moment to render here -- calling onAvatarState twice
        // synchronously would just batch to whatever we call last. Log the
        // barge-in for observability; the state below already reflects the
        // real transition (back to speaking, for the new response).
        void this.#logEvent("voice.barge_in_detected", { source: "audio_start_overlap" });
      }
      this.#callbacks.onAvatarState("speaking");
    });

    session.on("audio_stopped", () => {
      this.#speaking = transitionAudioSession(this.#speaking, "audio_stopped").speaking;
      this.#callbacks.onAvatarState(this.#alwaysListening ? "listening" : "idle");
    });

    session.on("transport_event", (event) => {
      this.#handleTransportEvent(event);
    });

    session.on("history_updated", (history) => {
      this.#syncHistoryTranscripts(history);
    });

    session.on("error", (error) => {
      const message = stringifyError(error.error);
      this.#callbacks.onAvatarState("degraded", `Realtime session error: ${message}`);
      this.#appendSystemLine(`Realtime session error: ${message}`);
      void this.#logEvent("voice.session_error", { message });
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
