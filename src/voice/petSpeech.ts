/**
 * Dutch's voice — decision logic for WHEN to speak, kept pure so it's
 * testable. Speech itself uses the Windows built-in voices via the Web
 * Speech API (zero cost, offline); the synthesis call lives in PetApp.
 *
 * Rules (spec S4): speak mission completions, failures, and attention
 * pings; debounce repeats (default 1 line / 3 min); quiet hours silence
 * everything except one attention ping per waiting episode. Every spoken
 * OR suppressed line is traced — if Dutch says it, a JSONL line proves it.
 */

export interface VoiceConfig {
  enabled: boolean;
  debounceMinutes: number;
  /** "HH:MM" 24h local, or null for no quiet hours. */
  quietStart: string | null;
  quietEnd: string | null;
  /** Windows voice name substring (e.g. "Zira"); null = system default. */
  voiceName: string | null;
  rate: number;
}

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  enabled: true,
  debounceMinutes: 3,
  quietStart: null,
  quietEnd: null,
  voiceName: null,
  rate: 1.0
};

function parseHhMm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** True when `now` falls inside quiet hours (window may cross midnight). */
export function inQuietHours(config: VoiceConfig, now: Date): boolean {
  if (!config.quietStart || !config.quietEnd) return false;
  const start = parseHhMm(config.quietStart);
  const end = parseHhMm(config.quietEnd);
  if (start === null || end === null || start === end) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (start < end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end; // crosses midnight
}

export type SpeechReason = "completed" | "failed" | "attention";

export interface SpeechDecision {
  speak: boolean;
  /** Why the line was suppressed, for the trace. */
  suppressed?: "disabled" | "quiet-hours" | "debounce";
}

/**
 * Decide whether a line may be spoken. Attention pings bypass the debounce
 * (once per waiting episode — caller resets `lastAttentionAt` per episode)
 * but never quiet hours.
 */
export function decideSpeech(
  config: VoiceConfig,
  reason: SpeechReason,
  lastSpokenAt: number | null,
  now: number,
  nowDate: Date
): SpeechDecision {
  if (!config.enabled) return { speak: false, suppressed: "disabled" };
  if (inQuietHours(config, nowDate)) return { speak: false, suppressed: "quiet-hours" };
  if (reason === "attention") return { speak: true };
  const debounceMs = Math.max(0, config.debounceMinutes) * 60_000;
  if (lastSpokenAt !== null && now - lastSpokenAt < debounceMs) {
    return { speak: false, suppressed: "debounce" };
  }
  return { speak: true };
}

/** Bubble text → a short spoken line (first sentence, capped). */
export function spokenLineFor(reason: SpeechReason, text: string): string {
  if (reason === "attention") return "Dutch needs you.";
  if (reason === "failed") return "Mission failed.";
  const clean = text.replace(/[*_`#>\[\]()]/g, " ").replace(/\s+/g, " ").trim();
  const sentence = clean.split(/(?<=[.!?])\s/)[0] ?? clean;
  const capped = sentence.length > 160 ? `${sentence.slice(0, 157)}…` : sentence;
  return capped || "Mission complete.";
}
