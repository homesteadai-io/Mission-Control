import type { AvatarState } from "../types";
import type { TranscriptLine } from "../voice/missionVoice";

interface TranscriptProps {
  state: AvatarState;
  lines: TranscriptLine[];
}

export function Transcript({ state, lines }: TranscriptProps) {
  const fallback =
    state === "listening"
      ? "Listening for a command."
      : state === "thinking"
        ? "Connecting the realtime session."
        : state === "aging"
          ? "Session is aging; ready to reconnect."
          : state === "degraded"
            ? "Voice connection needs attention."
            : "Standing by.";

  return (
    <div className="transcript">
      <p>Transcript</p>
      {lines.length > 0 ? (
        <ol>
          {lines.slice(-5).map((line) => (
            <li key={line.id} className={`transcript-${line.role}`}>
              <b>{labelForRole(line.role)}</b>
              <span>{line.text}</span>
            </li>
          ))}
        </ol>
      ) : (
        <span>{fallback}</span>
      )}
    </div>
  );
}

function labelForRole(role: TranscriptLine["role"]) {
  if (role === "assistant") return "MC";
  if (role === "user") return "You";
  return "System";
}
