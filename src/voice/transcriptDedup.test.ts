import { describe, expect, it } from "vitest";
import { decideTranscriptAppend, transcriptDedupKey } from "./transcriptDedup";
import type { TranscriptEntry } from "../types";

describe("transcript dedup helpers", () => {
  const entry: TranscriptEntry = {
    role: "assistant",
    text: "  Done.  ",
    source: "history",
    itemId: "item_123",
    isFinal: true
  };

  it("normalizes text and appends unseen transcript entries", () => {
    expect(decideTranscriptAppend(new Set(), entry)).toEqual({
      append: true,
      normalizedText: "Done.",
      key: "assistant:item_123:Done."
    });
  });

  it("rejects entries already present in the dedup set", () => {
    const seen = new Set([transcriptDedupKey(entry)]);

    expect(decideTranscriptAppend(seen, entry).append).toBe(false);
  });

  it("rejects whitespace-only transcript entries", () => {
    expect(
      decideTranscriptAppend(new Set(), {
        role: "user",
        text: "   ",
        source: "event",
        eventType: "conversation.item.input_audio_transcription.completed"
      }).append
    ).toBe(false);
  });
});
