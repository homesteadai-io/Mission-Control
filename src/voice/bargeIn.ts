export type AudioSessionEvent = "audio_start" | "audio_stopped";

export interface AudioSessionTransition {
  speaking: boolean;
  bargeIn: boolean;
}

// The SDK's "audio_interrupted" event is only emitted by its WebSocket
// transport, never the WebRTC transport this app uses, so it can't be
// relied on to detect barge-ins. A new audio_start firing before the
// previous one reached audio_stopped means the prior response's audio
// was cut off mid-playback -- that overlap is what a real barge-in looks
// like on this transport.
export function transitionAudioSession(speaking: boolean, event: AudioSessionEvent): AudioSessionTransition {
  if (event === "audio_stopped") {
    return { speaking: false, bargeIn: false };
  }

  return { speaking: true, bargeIn: speaking };
}
