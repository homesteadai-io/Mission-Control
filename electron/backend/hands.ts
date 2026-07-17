import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SpineEvent } from "./charliSpine.js";

/**
 * Charli's hands: last-mile Windows actions. Completion data always arrives
 * via the spine (never scraped); hands only focus a window and type ONE
 * pointer line. The payload itself travels by file (handoff note in Flux's
 * notes folder) — never through the clipboard, never as a giant paste.
 */

export type HandsTarget = "claude" | "codex" | "flux" | "notepad";

export interface VoiceSettings {
  enabled: boolean;
  debounceMinutes: number;
  quietStart: string | null;
  quietEnd: string | null;
  voiceName: string | null;
  rate: number;
}

export interface HandsConfig {
  /** Window-title regex (case-insensitive) per target. */
  windows: Record<string, string>;
  fluxLauncher: string;
  handoffDir: string;
  petSkin: string;
  /** Dutch's spoken output (Windows built-in voices — free, offline). */
  voice: VoiceSettings;
}

const DEFAULT_CONFIG: HandsConfig = {
  windows: {
    claude: "Claude",
    codex: "Codex",
    flux: "Flux",
    notepad: "Notepad" // safe test target
  },
  fluxLauncher: "C:\\Users\\Adam\\OneDrive\\Desktop\\Flux Cowork\\Start-Flux.ps1",
  // Empty = resolve Flux's real library (~/Flux or its settings.json dataDir)
  // at write time, so handoff notes appear as cards INSIDE the Flux app.
  handoffDir: "",
  petSkin: "tama",
  voice: {
    enabled: true,
    debounceMinutes: 3,
    quietStart: null,
    quietEnd: null,
    voiceName: null,
    rate: 1.0
  }
};

/**
 * Flux's library root: ~/Flux by default, overridable by Flux's own settings
 * (~/Flux/.flux/settings.json → dataDir). Read-only peek — Flux's repo and
 * data are never modified beyond adding notes to a Handoffs folder, which is
 * exactly how Flux models user folders.
 */
export function fluxLibraryDir(): string {
  const fluxDefault = path.join(os.homedir(), "Flux");
  try {
    const settings = JSON.parse(
      fs.readFileSync(path.join(fluxDefault, ".flux", "settings.json"), "utf8")
    ) as { dataDir?: string };
    if (settings.dataDir && typeof settings.dataDir === "string") return settings.dataDir;
  } catch {
    // no settings — default library
  }
  return fluxDefault;
}

export function charliConfigPath() {
  return path.join(process.env.CHARLI_DIR || path.join(os.homedir(), ".charli"), "config.json");
}

export function loadHandsConfig(): HandsConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(charliConfigPath(), "utf8")) as Partial<HandsConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      windows: { ...DEFAULT_CONFIG.windows, ...(raw.windows ?? {}) },
      voice: { ...DEFAULT_CONFIG.voice, ...(raw.voice ?? {}) }
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/** Write the default config once so Adam has a file to edit. */
export function ensureCharliConfig() {
  const file = charliConfigPath();
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  }
}

/**
 * Escape literal text for WScript.Shell SendKeys: its specials are
 * + ^ % ~ ( ) { } [ ] — each must be wrapped in braces.
 */
export function escapeSendKeys(text: string): string {
  return text.replace(/[+^%~(){}[\]]/g, (char) => `{${char}}`);
}

function runPowerShell(script: string, timeoutMs = 15_000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { timeout: timeoutMs, windowsHide: true },
      (error, stdout, stderr) => {
        const out = `${stdout ?? ""}${stderr ?? ""}`.trim();
        resolve({ ok: !error, out });
      }
    );
  });
}

/** PS snippet: find first process whose main window title matches, restore + activate it. */
function activateSnippet(titlePattern: string) {
  // Pattern reaches PS base64-encoded so quoting/regex chars can't break the script.
  const b64 = Buffer.from(titlePattern, "utf8").toString("base64");
  return [
    `$pat = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}'))`,
    `$p = Get-Process | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle -match $pat } | Select-Object -First 1`,
    `if (-not $p) { Write-Output 'notfound'; exit 0 }`,
    // Restore first — AppActivate alone won't un-minimize (Flux lives minimized).
    `Add-Type -Namespace CharliWin -Name U32 -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindowAsync(System.IntPtr hWnd, int nCmdShow); [DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr hWnd);'`,
    `if ([CharliWin.U32]::IsIconic($p.MainWindowHandle)) { [void][CharliWin.U32]::ShowWindowAsync($p.MainWindowHandle, 9); Start-Sleep -Milliseconds 350 }`,
    `$ws = New-Object -ComObject WScript.Shell`,
    `[void]$ws.AppActivate($p.Id)`,
    `Start-Sleep -Milliseconds 450`,
    `Write-Output ('activated|' + $p.ProcessName + '|' + $p.MainWindowTitle)`
  ].join("; ");
}

export async function focusApp(target: HandsTarget): Promise<{ ok: boolean; detail: string }> {
  const config = loadHandsConfig();
  const pattern = config.windows[target];
  if (!pattern) return { ok: false, detail: `No window pattern configured for ${target}` };

  const result = await runPowerShell(activateSnippet(pattern));
  if (result.out.startsWith("activated|")) {
    return { ok: true, detail: result.out };
  }

  if (target === "flux" && fs.existsSync(config.fluxLauncher)) {
    const launch = await runPowerShell(
      `Start-Process powershell.exe -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${config.fluxLauncher.replace(/'/g, "''")}' -WindowStyle Hidden; Write-Output 'launched'`
    );
    return launch.out.includes("launched")
      ? { ok: true, detail: "launched Flux via Start-Flux.ps1" }
      : { ok: false, detail: `Flux launch failed: ${launch.out}` };
  }

  return { ok: false, detail: `No window matching /${pattern}/i found` };
}

/**
 * Focus the target window and type one line + Enter. The line is escaped for
 * SendKeys and delivered base64 so no quoting layer can mangle it.
 */
export async function typeIntoApp(target: HandsTarget, line: string): Promise<{ ok: boolean; detail: string }> {
  const config = loadHandsConfig();
  const pattern = config.windows[target];
  if (!pattern) return { ok: false, detail: `No window pattern configured for ${target}` };
  const collapsed = line.replace(/[\r\n\t]+/g, " ").trim();
  if (!collapsed) return { ok: false, detail: "Empty line" };

  const keysB64 = Buffer.from(escapeSendKeys(collapsed), "utf8").toString("base64");
  const script = [
    activateSnippet(pattern),
    `if ($p) {`,
    `  $keys = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${keysB64}'))`,
    `  $ws.SendKeys($keys)`,
    `  Start-Sleep -Milliseconds 250`,
    `  $ws.SendKeys('{ENTER}')`,
    `  Write-Output 'typed'`,
    `}`
  ].join("; ");

  const result = await runPowerShell(script, 30_000);
  if (result.out.includes("typed")) return { ok: true, detail: result.out };
  if (result.out.includes("notfound")) return { ok: false, detail: `No window matching /${pattern}/i found` };
  return { ok: false, detail: result.out || "SendKeys failed" };
}

/** Windows-safe filename fragment: no reserved chars, no colons. */
function safeStamp(iso: string) {
  return iso.replace(/[:]/g, "-").replace(/\..+$/, "").replace("T", " ");
}

/**
 * Persist a turn summary as a handoff note in a "Handoffs" folder inside
 * Flux's LIBRARY (~/Flux), shaped like a Flux note (frontmatter +
 * `## Transcript`) so it renders as a real card in the Flux app — not an
 * invisible file in the export folder. Returns the note's absolute path.
 */
export function writeHandoffNote(event: SpineEvent): string {
  const config = loadHandsConfig();
  const base = config.handoffDir || fluxLibraryDir();
  const dir = path.join(base, "Handoffs");
  fs.mkdirSync(dir, { recursive: true });
  const iso = event.timestamp || new Date().toISOString();
  const stamp = safeStamp(iso);
  const file = path.join(dir, `Handoff - ${event.source} - ${stamp}.md`);
  const firstWords = event.message.replace(/\s+/g, " ").trim().slice(0, 60);
  const body = [
    "---",
    `title: "${event.source} turn — ${firstWords.replace(/"/g, "'")}"`,
    `source: ${event.source}-handoff`,
    `created: ${iso}`,
    "---",
    "",
    "## Transcript",
    "",
    event.message,
    "",
    "## Handoff",
    "",
    `- source: ${event.source}`,
    `- thread: ${event.thread_id}`,
    `- turn: ${event.turn_id}`,
    `- cwd: ${event.cwd}`,
    `- time: ${iso}`,
    ""
  ].join("\n");
  fs.writeFileSync(file, body);
  return file;
}

/** The one line the hands type into the receiving brain. */
export function pointerLine(notePath: string, source: SpineEvent["source"]): string {
  return `Review "${notePath}" - ${source} turn summary`;
}
