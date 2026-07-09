export type RouteTarget = "claude" | "codex" | "board";

export interface RouteResult {
  target: RouteTarget;
  ok: boolean;
  detail: string;
}

const PANE_TARGETS = new Set<RouteTarget>(["claude", "codex"]);

/**
 * Map a spoken/typed target word to a canonical route. Charli's routing tool
 * passes a target; this also tolerates loose phrasings from transcription.
 */
export function normalizeTarget(raw: string): RouteTarget | null {
  const value = raw.trim().toLowerCase();
  if (/(^|\b)(claude|claude code|cloud code)($|\b)/.test(value)) return "claude";
  if (/(^|\b)(codex|codecs|kodex)($|\b)/.test(value)) return "codex";
  if (/(^|\b)(board|workbench|charli|yourself)($|\b)/.test(value)) return "board";
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
  askBoard: (text: string) => Promise<{ ok: boolean; reply?: string | null; error?: string }>;
  logDispatch: (target: RouteTarget, chars: number) => void;
}

/**
 * Route a command to a coding pane (typed into its pty + submitted) or to the
 * board agent. Returns a structured result the voice tool surfaces back to
 * Charli so she can confirm out loud.
 */
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

export async function routeCommand(
  target: RouteTarget,
  text: string,
  deps: SwitchboardDeps
): Promise<RouteResult> {
  const trimmed = sanitizeCommandText(text);
  if (!trimmed) {
    return { target, ok: false, detail: "Nothing to send — the command was empty." };
  }

  if (isPaneTarget(target)) {
    const paneId = target as "claude" | "codex";
    // Two-step submit (text, then Enter) so the TUI runs it instead of leaving
    // it as a draft paste. sanitizeCommandText already stripped the CR.
    const result = await deps.submitToPane(paneId, trimmed);
    deps.logDispatch(target, trimmed.length);
    return result.ok
      ? { target, ok: true, detail: `Sent to ${label(target)}. Ask me to read it back in a moment to see the reply.` }
      : { target, ok: false, detail: result.error ?? `Could not reach the ${label(target)} pane.` };
  }

  const result = await deps.askBoard(trimmed);
  deps.logDispatch(target, trimmed.length);
  if (!result.ok) {
    return { target, ok: false, detail: result.error ?? "The workbench agent is unavailable." };
  }
  if (!result.reply) {
    return {
      target,
      ok: true,
      detail: "The workbench agent is still working — ask me to check the board in a moment."
    };
  }
  // Cap what flows back into the realtime context; the full text stays on the
  // board feed.
  const reply = result.reply.length > 600 ? `${result.reply.slice(0, 600)}…` : result.reply;
  return { target, ok: true, detail: `Workbench agent replied: ${reply}` };
}

function label(target: RouteTarget) {
  if (target === "claude") return "Claude Code";
  if (target === "codex") return "Codex";
  return "workbench";
}
