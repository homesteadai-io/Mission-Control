import { useEffect, useRef, useState } from "react";
import type { CharliFocusTarget, PetSkin, SpineEventView, SpineSource } from "../missionControlApi";
import "../styles/pet.css";

/**
 * Charli's pet overlay — the whole product in one inch. Renders the active
 * skin's idle animation, shows one status note speaking for BOTH brains, and
 * offers click-to-send when a finished turn is ready to hand to the other one.
 */

function relativeTime(iso: string): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const OTHER: Record<SpineSource, string> = { codex: "Claude", claude: "Codex" };

interface SourceRowProps {
  source: SpineSource;
  event: SpineEventView | null;
  sent: boolean;
  sending: boolean;
  onFocus: () => void;
  onSend: () => void;
}

function SourceRow({ source, event, sent, sending, onFocus, onSend }: SourceRowProps) {
  const label = source === "codex" ? "Codex" : "Claude";
  if (!event) {
    return (
      <div className="pet-row pet-row-idle">
        <button className="pet-source" onClick={onFocus} title={`Focus ${label}`}>
          {label}
        </button>
        <span className="pet-quiet">quiet</span>
      </div>
    );
  }
  const fresh = Date.now() - new Date(event.timestamp).getTime() < 30 * 60_000;
  const preview = event.message.replace(/\s+/g, " ").trim();
  return (
    <div className={`pet-block${fresh ? " pet-row-fresh" : ""}`}>
      <div className="pet-row">
        <button className="pet-source" onClick={onFocus} title={`Focus ${label}`}>
          {label}
        </button>
        <span className="pet-when">{relativeTime(event.timestamp)}</span>
        {preview.length > 0 && !sent && (
          <button
            className="pet-send"
            disabled={sending}
            onClick={onSend}
            title={`Sends the note below into ${OTHER[source]}'s window for review`}
          >
            {sending ? "…" : `→ ${OTHER[source]}`}
          </button>
        )}
        {sent && <span className="pet-sent">sent ✓</span>}
      </div>
      {/* What would actually be handed off — no mystery sends. */}
      {preview.length > 0 && <div className="pet-preview">{preview}</div>}
    </div>
  );
}

export function PetApp() {
  const [skin, setSkin] = useState<PetSkin | null>(null);
  const [frame, setFrame] = useState(0);
  const [codexEvent, setCodexEvent] = useState<SpineEventView | null>(null);
  const [claudeEvent, setClaudeEvent] = useState<SpineEventView | null>(null);
  const [sending, setSending] = useState<SpineSource | null>(null);
  const [sentTurns, setSentTurns] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const api = window.missionControl?.charli;

  useEffect(() => {
    if (!api) return;
    void api.skin().then((result) => {
      if (!result.ok) console.error(`[pet] skin load failed: ${result.error}`);
      if (result.ok && result.skin) setSkin(result.skin);
    });
    void api.status().then((result) => {
      if (!result.ok) return;
      if (result.codex) setCodexEvent(result.codex);
      if (result.claude) setClaudeEvent(result.claude);
    });
    return api.onEvent((event) => {
      if (event.source === "codex") setCodexEvent(event);
      else setClaudeEvent(event);
    });
  }, [api]);

  useEffect(() => {
    if (!skin) return;
    const timer = setInterval(() => {
      setFrame((current) => (current + 1) % Math.max(1, skin.idleFrames));
    }, skin.frameRateMs);
    return () => clearInterval(timer);
  }, [skin]);

  function showToast(text: string) {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4_000);
  }

  async function focus(target: CharliFocusTarget) {
    const result = await api?.focus(target);
    if (result && !result.ok) showToast(result.detail ?? "Focus failed");
  }

  async function send(source: SpineSource, event: SpineEventView | null) {
    if (!api || !event) return;
    setSending(source);
    try {
      const result = await api.sendHandoff(source);
      if (result.ok) {
        setSentTurns((current) => new Set(current).add(`${source}:${event.turn_id}:${event.timestamp}`));
        showToast(`Handed to ${OTHER[source]}`);
      } else {
        showToast(result.detail ?? "Handoff failed");
      }
    } finally {
      setSending(null);
    }
  }

  const spriteStyle = skin
    ? {
        width: skin.frameWidth * skin.scale,
        height: skin.frameHeight * skin.scale,
        backgroundImage: `url(${skin.imageDataUrl})`,
        backgroundSize: `${skin.cols * skin.frameWidth * skin.scale}px ${skin.rows * skin.frameHeight * skin.scale}px`,
        backgroundPosition: `-${frame * skin.frameWidth * skin.scale}px -${skin.idleRow * skin.frameHeight * skin.scale}px`
      }
    : undefined;

  const wasSent = (source: SpineSource, event: SpineEventView | null) =>
    !!event && sentTurns.has(`${source}:${event.turn_id}:${event.timestamp}`);

  return (
    <div className="pet-shell">
      <div className="pet-bubble">
        <SourceRow
          source="claude"
          event={claudeEvent}
          sent={wasSent("claude", claudeEvent)}
          sending={sending === "claude"}
          onFocus={() => void focus("claude")}
          onSend={() => void send("claude", claudeEvent)}
        />
        <SourceRow
          source="codex"
          event={codexEvent}
          sent={wasSent("codex", codexEvent)}
          sending={sending === "codex"}
          onFocus={() => void focus("codex")}
          onSend={() => void send("codex", codexEvent)}
        />
        <div className="pet-row pet-row-flux">
          <button className="pet-source" onClick={() => void focus("flux")} title="Surface Flux">
            Flux
          </button>
        </div>
        {toast && <div className="pet-toast">{toast}</div>}
      </div>
      <div className="pet-sprite" style={spriteStyle} title="Charli" />
    </div>
  );
}
