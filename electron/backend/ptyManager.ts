import { spawn, type IPty } from "@lydell/node-pty";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type PaneProfile = "claude" | "codex";

export const PANE_IDS = new Set(["claude", "codex"]);
export const PANE_PROFILES = new Set<PaneProfile>(["claude", "codex"]);

interface ManagedPane {
  proc: IPty;
  profile: PaneProfile;
  buffer: string;
}

const panes = new Map<string, ManagedPane>();

// Keep the tail of each pane's raw output so Charli can read an agent's recent
// activity back (she can dispatch but otherwise couldn't see the reply).
const BUFFER_LIMIT = 24_000;

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /[][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

/** Strip ANSI escapes and collapse blank runs so the tail reads as plain text. */
export function cleanTerminalText(raw: string) {
  return raw
    .replace(ANSI_PATTERN, "")
    .replace(/\r/g, "")
    .replace(/[^\S\n]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function readPaneTail(id: string, maxChars = 2000): string {
  const pane = panes.get(id);
  if (!pane) return "";
  return cleanTerminalText(pane.buffer).slice(-Math.max(200, maxChars));
}

interface SpawnPaneOptions {
  id: string;
  profile: PaneProfile;
  cwd: string;
  cols: number;
  rows: number;
  onData: (data: string) => void;
  onExit: (exitCode: number) => void;
}

/**
 * Resolve the launch command for a profile. Windows CLIs live in different
 * homes (.local/bin exe vs npm-global .cmd); prefer known absolute paths and
 * fall back to PATH resolution via the shell.
 */
export function resolveProfileCommand(profile: PaneProfile): { file: string; args: string[] } {
  const home = os.homedir();

  if (profile === "claude") {
    const exe = path.join(home, ".local", "bin", "claude.exe");
    if (fs.existsSync(exe)) return { file: exe, args: [] };
    return { file: "cmd.exe", args: ["/c", "claude"] };
  }

  const cmdShim = path.join(home, "AppData", "Roaming", "npm", "codex.cmd");
  if (fs.existsSync(cmdShim)) return { file: "cmd.exe", args: ["/c", cmdShim] };
  return { file: "cmd.exe", args: ["/c", "codex"] };
}

export function spawnPane(options: SpawnPaneOptions) {
  killPane(options.id);

  const { file, args } = resolveProfileCommand(options.profile);
  const proc = spawn(file, args, {
    name: "xterm-256color",
    cols: options.cols,
    rows: options.rows,
    cwd: options.cwd,
    env: { ...process.env } as Record<string, string>
  });

  const managed: ManagedPane = { proc, profile: options.profile, buffer: "" };

  proc.onData((data) => {
    managed.buffer = (managed.buffer + data).slice(-BUFFER_LIMIT);
    options.onData(data);
  });
  proc.onExit(({ exitCode }) => {
    panes.delete(options.id);
    options.onExit(exitCode);
  });

  panes.set(options.id, managed);
}

export function writePane(id: string, data: string) {
  panes.get(id)?.proc.write(data);
}

/**
 * Submit a line to an interactive TUI (Claude Code / Codex). Writing
 * `text\r` in one chunk lets Ink-style TUIs treat the whole thing as a paste
 * and NOT submit. Writing the text, then the carriage return as a separate
 * write a tick later, makes the CR register as a distinct Enter keypress.
 */
export function submitPaneLine(id: string, text: string): Promise<boolean> {
  const pane = panes.get(id);
  if (!pane) return Promise.resolve(false);
  pane.proc.write(text);
  return new Promise((resolve) => {
    setTimeout(() => {
      if (!panes.has(id)) return resolve(false);
      pane.proc.write("\r");
      resolve(true);
    }, 60);
  });
}

export function resizePane(id: string, cols: number, rows: number) {
  panes.get(id)?.proc.resize(cols, rows);
}

export function killPane(id: string) {
  const pane = panes.get(id);
  if (!pane) return;
  panes.delete(id);
  try {
    if (process.platform === "win32") {
      // pty.kill() closes the ConPTY root (often cmd.exe) but leaves
      // grandchildren (the real CLI's node process) alive. taskkill /T
      // walks and force-kills the whole tree.
      execFileSync("taskkill", ["/pid", String(pane.proc.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      pane.proc.kill();
    }
  } catch {
    // already dead
  }
}

export function killAllPanes() {
  for (const id of [...panes.keys()]) {
    killPane(id);
  }
}

export function paneIsRunning(id: string) {
  return panes.has(id);
}
