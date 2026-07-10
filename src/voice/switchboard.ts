export type RouteTarget = "claude" | "codex" | "flux";

export interface RouteResult {
  target: RouteTarget;
  ok: boolean;
  detail: string;
}

const PANE_TARGETS = new Set<RouteTarget>(["claude", "codex"]);

/**
 * Map a spoken/typed target word to a canonical route. Charli's routing tool
 * passes a target; this also tolerates loose phrasings from transcription.
 *
 * Charli v2 (2026-07-10): the opencode board is retired — no third brain.
 * Targets are the two real coding agents plus Flux (surface/focus only).
 */
export function normalizeTarget(raw: string): RouteTarget | null {
  const value = raw.trim().toLowerCase();
  if (/(^|\b)(claude|claude code|cloud code)($|\b)/.test(value)) return "claude";
  if (/(^|\b)(codex|codecs|kodex)($|\b)/.test(value)) return "codex";
  if (/(^|\b)(flux|notepad|notes)($|\b)/.test(value)) return "flux";
  return null;
}

export function isPaneTarget(target: RouteTarget): boolean {
  return PANE_TARGETS.has(target);
}

/**
 * Dependencies the switchboard needs — kept as a narrow interface so it can be
 * unit-tested with fakes and driven from the voice kernel with the real bridge.
 */
export interface SwitchboardDeps {
  submitToPane: (paneId: "claude" | "codex", text: string) => Promise<{ ok: boolean; error?: string }>;
  /** Bring Flux forward (launching it if needed). */
  surfaceFlux: () => Promise<{ ok: boolean; detail?: string }>;
  logDispatch: (target: RouteTarget, chars: number) => void;
}

/**
 * Collapse ASCII control characters (C0 range + DEL) to spaces so a routed
 * command can only ever be ONE submitted line — no smuggled newlines, ETX,
 * or ANSI escape introducers reach the pty. Content is data.
 */
export function sanitizeCommandText(text: string) {
  let cleaned = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    cleaned += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return cleaned.replace(/\s+/g, " ").trim();
}

/**
 * Route a command to a coding pane (typed into its pty + submitted) or surface
 * Flux. Returns a structured result the voice tool surfaces back to Charli so
 * she can confirm out loud.
 */
export async function routeCommand(
  target: RouteTarget,
  text: string,
  deps: SwitchboardDeps
): Promise<RouteResult> {
  if (target === "flux") {
    // Flux is a surface, not an agent — no command text required or sent.
    const result = await deps.surfaceFlux();
    deps.logDispatch(target, 0);
    return result.ok
      ? { target, ok: true, detail: "Flux is up." }
      : { target, ok: false, detail: result.detail ?? "Could not surface Flux." };
  }

  const trimmed = sanitizeCommandText(text);
  if (!trimmed) {
    return { target, ok: false, detail: "Nothing to send — the command was empty." };
  }

  const paneId = target as "claude" | "codex";
  // Two-step submit (text, then Enter) so the TUI runs it instead of leaving
  // it as a draft paste. sanitizeCommandText already stripped the CR.
  const result = await deps.submitToPane(paneId, trimmed);
  deps.logDispatch(target, trimmed.length);
  return result.ok
    ? { target, ok: true, detail: `Sent to ${label(target)}. Ask me to read it back in a moment to see the reply.` }
    : { target, ok: false, detail: result.error ?? `Could not reach the ${label(target)} pane.` };
}

function label(target: RouteTarget) {
  if (target === "claude") return "Claude Code";
  if (target === "codex") return "Codex";
  return "Flux";
}
