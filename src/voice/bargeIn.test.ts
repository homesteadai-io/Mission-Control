import { describe, expect, it } from "vitest";
import { transitionAudioSession } from "./bargeIn";

describe("transitionAudioSession", () => {
  it("does not flag the first audio_start as a barge-in", () => {
    expect(transitionAudioSession(false, "audio_start")).toEqual({ speaking: true, bargeIn: false });
  });

  it("does not flag a clean start/stop/start cycle as a barge-in", () => {
    let speaking = false;
    ({ speaking } = transitionAudioSession(speaking, "audio_start"));
    ({ speaking } = transitionAudioSession(speaking, "audio_stopped"));
    const result = transitionAudioSession(speaking, "audio_start");

    expect(result).toEqual({ speaking: true, bargeIn: false });
  });

  it("flags a new audio_start as a barge-in when the previous one never reached audio_stopped", () => {
    let speaking = false;
    ({ speaking } = transitionAudioSession(speaking, "audio_start"));
    const result = transitionAudioSession(speaking, "audio_start");

    expect(result).toEqual({ speaking: true, bargeIn: true });
  });

  it("audio_stopped always clears speaking and is never itself a barge-in", () => {
    expect(transitionAudioSession(true, "audio_stopped")).toEqual({ speaking: false, bargeIn: false });
    expect(transitionAudioSession(false, "audio_stopped")).toEqual({ speaking: false, bargeIn: false });
  });
});
