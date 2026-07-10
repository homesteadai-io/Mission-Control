#!/usr/bin/env node
/**
 * Installs Charli's event spine onto this machine. Idempotent; run with node.
 *
 *   node spine/install-spine.cjs           # install / repair
 *   node spine/install-spine.cjs --dry-run # show what would change
 *
 * Steps:
 *   1. ~/.charli/{bin,events,backups} created; adapter + hook copied to bin.
 *   2. ~/.codex/config.toml `notify` entry captured to notify-forward.json,
 *      then rewritten to invoke charli-notify.cjs (which forwards to the
 *      captured original — codex-computer-use.exe keeps working). The prior
 *      config.toml is backed up to ~/.charli/backups/ first. If notify already
 *      points at charli-notify.cjs, the config is left alone.
 *   3. ~/.claude/settings.json gains a hooks.Stop entry invoking
 *      charli-claude-hook.cjs (merged, never clobbered; backup written first).
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DRY = process.argv.includes("--dry-run");
const HOME = os.homedir();
const CHARLI_DIR = path.join(HOME, ".charli");
const BIN_DIR = path.join(CHARLI_DIR, "bin");
const EVENTS_DIR = path.join(CHARLI_DIR, "events");
const BACKUP_DIR = path.join(CHARLI_DIR, "backups");
const FORWARD_FILE = path.join(CHARLI_DIR, "notify-forward.json");
const CODEX_CONFIG = path.join(HOME, ".codex", "config.toml");
const CLAUDE_SETTINGS = path.join(HOME, ".claude", "settings.json");
const NODE_EXE = process.execPath;

const NOTIFY_SCRIPT = path.join(BIN_DIR, "charli-notify.cjs");
const HOOK_SCRIPT = path.join(BIN_DIR, "charli-claude-hook.cjs");

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function say(line) {
  console.log(`${DRY ? "[dry-run] " : ""}${line}`);
}

function copyScripts() {
  if (!DRY) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
    fs.mkdirSync(EVENTS_DIR, { recursive: true });
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    for (const name of ["charli-notify.cjs", "charli-claude-hook.cjs"]) {
      fs.copyFileSync(path.join(__dirname, name), path.join(BIN_DIR, name));
    }
  }
  say(`scripts -> ${BIN_DIR}`);
}

/** Parse the quoted strings out of a single-line TOML array value. */
function parseTomlStringArray(value) {
  const out = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let match;
  while ((match = re.exec(value)) !== null) {
    out.push(match[1].replace(/\\\\/g, "\\").replace(/\\"/g, '"'));
  }
  return out;
}

function tomlEscape(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function patchCodexConfig() {
  const text = fs.readFileSync(CODEX_CONFIG, "utf8");
  const lineMatch = text.match(/^notify\s*=\s*(\[.*\])\s*$/m);
  if (!lineMatch) {
    throw new Error(`no single-line notify entry found in ${CODEX_CONFIG} — refusing to guess`);
  }
  const current = parseTomlStringArray(lineMatch[1]);
  if (current.some((part) => part.includes("charli-notify.cjs"))) {
    say("codex notify already routes through charli-notify.cjs — leaving config untouched");
    return;
  }
  if (current.length === 0) {
    throw new Error("notify entry parsed to zero strings — refusing to proceed");
  }

  const forward = { file: current[0], args: current.slice(1) };
  const newLine = `notify = [ "${tomlEscape(NODE_EXE)}", "${tomlEscape(NOTIFY_SCRIPT)}" ]`;
  const updated = text.replace(lineMatch[0], newLine);

  const backup = path.join(BACKUP_DIR, `config.toml.${stamp()}.bak`);
  if (!DRY) {
    fs.copyFileSync(CODEX_CONFIG, backup);
    fs.writeFileSync(FORWARD_FILE, `${JSON.stringify(forward, null, 2)}\n`);
    fs.writeFileSync(CODEX_CONFIG, updated);
  }
  say(`codex config backup -> ${backup}`);
  say(`original notify handler captured -> ${FORWARD_FILE} (${forward.file})`);
  say(`codex notify -> ${newLine}`);
}

function patchClaudeSettings() {
  let settings = {};
  if (fs.existsSync(CLAUDE_SETTINGS)) {
    settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, "utf8"));
  }
  const command = `"${NODE_EXE}" "${HOOK_SCRIPT}"`;

  settings.hooks = settings.hooks ?? {};
  const stopEntries = Array.isArray(settings.hooks.Stop) ? settings.hooks.Stop : [];
  const alreadyInstalled = stopEntries.some((entry) =>
    Array.isArray(entry?.hooks) &&
    entry.hooks.some((hook) => typeof hook?.command === "string" && hook.command.includes("charli-claude-hook.cjs"))
  );
  if (alreadyInstalled) {
    say("claude Stop hook already installed — leaving settings untouched");
    return;
  }

  stopEntries.push({ hooks: [{ type: "command", command, timeout: 10 }] });
  settings.hooks.Stop = stopEntries;

  const backup = path.join(BACKUP_DIR, `claude-settings.json.${stamp()}.bak`);
  if (!DRY) {
    if (fs.existsSync(CLAUDE_SETTINGS)) fs.copyFileSync(CLAUDE_SETTINGS, backup);
    fs.writeFileSync(CLAUDE_SETTINGS, `${JSON.stringify(settings, null, 2)}\n`);
  }
  say(`claude settings backup -> ${backup}`);
  say(`claude Stop hook -> ${command}`);
}

copyScripts();
patchCodexConfig();
patchClaudeSettings();
say("spine install complete");
say(`events will land in ${EVENTS_DIR}\\codex.jsonl and claude.jsonl`);
