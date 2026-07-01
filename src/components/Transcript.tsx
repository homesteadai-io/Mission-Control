import type { AvatarState } from "../types";

interface TranscriptProps {
  state: AvatarState;
}

export function Transcript({ state }: TranscriptProps) {
  const line =
    state === "listening"
      ? "Listening for a command."
      : state === "thinking"
        ? "Rendering a visible artifact."
        : state === "degraded"
          ? "Door boot failed loud; endpoint named."
          : "Standing by.";

  return (
    <div className="transcript">
      <p>Transcript</p>
      <span>{line}</span>
    </div>
  );
}
