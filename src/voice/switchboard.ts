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
  writePane: (paneId: "claude" | "codex", data: string) => Promise<{ ok: boolean; error?: string }>;
  promptBoard: (text: string) => Promise<{ ok: boolean; error?: string }>;
  logDispatch: (target: RouteTarget, chars: number) => void;
}

/**
 * Route a command to a coding pane (typed into its pty + submitted) or to the
 * board agent. Returns a structured result the voice tool surfaces back to
 * Charli so she can confirm out loud.
 */
export async function routeCommand(
  target: RouteTarget,
  text: string,
  deps: SwitchboardDeps
): Promise<RouteResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { target, ok: false, detail: "Nothing to send — the command was empty." };
  }

  if (isPaneTarget(target)) {
    const paneId = target as "claude" | "codex";
    const result = await deps.writePane(paneId, `${trimmed}\r`);
    deps.logDispatch(target, trimmed.length);
    return result.ok
      ? { target, ok: true, detail: `Sent to ${label(target)}.` }
      : { target, ok: false, detail: result.error ?? `Could not reach the ${label(target)} pane.` };
  }

  const result = await deps.promptBoard(trimmed);
  deps.logDispatch(target, trimmed.length);
  return result.ok
    ? { target, ok: true, detail: "Handed to the workbench agent." }
    : { target, ok: false, detail: result.error ?? "The workbench agent is unavailable." };
}

function label(target: RouteTarget) {
  if (target === "claude") return "Claude Code";
  if (target === "codex") return "Codex";
  return "workbench";
}
