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
}

const panes = new Map<string, ManagedPane>();

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

  proc.onData(options.onData);
  proc.onExit(({ exitCode }) => {
    panes.delete(options.id);
    options.onExit(exitCode);
  });

  panes.set(options.id, { proc, profile: options.profile });
}

export function writePane(id: string, data: string) {
  panes.get(id)?.proc.write(data);
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
