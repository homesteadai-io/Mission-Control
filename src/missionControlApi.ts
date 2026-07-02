import type { CockpitMode, TranscriptEntry } from "./types";

export interface VoiceSessionCreateOptions {
  stateSummary?: string;
}

export interface VoiceSessionCreateResult {
  ok: boolean;
  sessionId?: string;
  clientSecret?: string;
  expiresAt?: number;
  model?: "gpt-realtime-2";
  error?: string;
}

export interface VoiceLogEvent {
  type: `voice.${string}`;
  sessionId?: string;
  detail?: Record<string, unknown>;
}

export interface MissionControlApi {
  setWindowMode: (mode: Exclude<CockpitMode, "menu">) => Promise<{ ok: boolean; mode?: string }>;
  voice: {
    createSession: (options?: VoiceSessionCreateOptions) => Promise<VoiceSessionCreateResult>;
    appendTranscript: (sessionId: string, entry: TranscriptEntry) => Promise<{ ok: boolean; error?: string }>;
    logEvent: (entry: VoiceLogEvent) => Promise<{ ok: boolean; error?: string }>;
  };
}
