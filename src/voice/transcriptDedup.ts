import type { TranscriptEntry } from "../types";

export interface TranscriptDedupDecision {
  append: boolean;
  normalizedText: string;
  key: string;
}

export function decideTranscriptAppend(seenKeys: ReadonlySet<string>, entry: TranscriptEntry): TranscriptDedupDecision {
  const normalizedText = entry.text.trim();
  const key = transcriptDedupKey(entry, normalizedText);

  return {
    append: Boolean(normalizedText) && !seenKeys.has(key),
    normalizedText,
    key
  };
}

export function transcriptDedupKey(entry: TranscriptEntry, normalizedText = entry.text.trim()) {
  return `${entry.role}:${entry.itemId ?? entry.eventType ?? entry.source}:${normalizedText}`;
}
