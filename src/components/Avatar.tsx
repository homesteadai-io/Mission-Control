import type { AvatarState } from "../types";

interface AvatarProps {
  state: AvatarState;
  compact?: boolean;
  degradedReason?: string;
}

export function Avatar({ state, compact = false, degradedReason }: AvatarProps) {
  return (
    <div className={`avatar-frame avatar-${state} ${compact ? "avatar-compact" : ""}`}>
      <div className="avatar-status">
        <div className="mic-glyph" aria-hidden="true" />
        <Waveform />
        {!compact ? <span>{labelForState(state, degradedReason)}</span> : null}
      </div>
      <img src="./assets/avatar/face.png" alt="Brush-stroke Mission Control avatar" />
    </div>
  );
}

function Waveform() {
  return (
    <div className="waveform" aria-hidden="true">
      {Array.from({ length: 13 }).map((_, index) => (
        <i key={index} style={{ animationDelay: `${index * 70}ms` }} />
      ))}
    </div>
  );
}

function labelForState(state: AvatarState, degradedReason?: string) {
  switch (state) {
    case "idle":
      return "Idle";
    case "listening":
      return "Listening...";
    case "thinking":
      return "Working...";
    case "speaking":
      return "Speaking";
    case "aging":
      return "Session aging";
    case "degraded":
      return degradedReason ?? "Connection issue.";
  }
}
