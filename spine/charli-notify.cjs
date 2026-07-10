#!/usr/bin/env node
/**
 * Charli fan-out adapter for Codex `notify`.
 *
 * Codex invokes the configured notify command with the notification JSON as
 * the final argument. This script:
 *   1. Forwards the invocation UNCHANGED to the original notify handler
 *      (codex-computer-use.exe turn-ended ...) recorded at install time in
 *      ~/.charli/notify-forward.json — that handler must keep working.
 *   2. Appends a normalized turn_completed event to ~/.charli/events/codex.jsonl.
 *
 * Hard rules: never throw, never block Codex, always exit 0. All failures are
 * logged to ~/.charli/adapter.log and swallowed.
 */
"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CHARLI_DIR = process.env.CHARLI_DIR || path.join(os.homedir(), ".charli");
const EVENTS_DIR = path.join(CHARLI_DIR, "events");
const LOG_FILE = path.join(CHARLI_DIR, "adapter.log");
const FORWARD_FILE = path.join(CHARLI_DIR, "notify-forward.json");
const MAX_MESSAGE_CHARS = 100_000;

function log(line) {
  try {
    fs.mkdirSync(CHARLI_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* nothing left to do */
  }
}

/** Pick whichever key variant the payload uses (codex uses kebab-case today). */
function pick(obj, ...keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

function normalize(payload) {
  const message = String(pick(payload, "last-assistant-message", "last_assistant_message", "lastAssistantMessage") ?? "");
  return {
    source: "codex",
    event: "turn_completed",
    thread_id: String(pick(payload, "thread-id", "thread_id", "threadId") ?? ""),
    turn_id: String(pick(payload, "turn-id", "turn_id", "turnId") ?? ""),
    cwd: String(pick(payload, "cwd", "working-directory", "working_directory") ?? ""),
    status: "completed",
    message: message.length > MAX_MESSAGE_CHARS ? `${message.slice(0, MAX_MESSAGE_CHARS)}…` : message,
    payload_type: String(pick(payload, "type") ?? ""),
    timestamp: new Date().toISOString()
  };
}

function forwardToOriginal(codexArgs) {
  let forward;
  try {
    forward = JSON.parse(fs.readFileSync(FORWARD_FILE, "utf8"));
  } catch (error) {
    log(`forward-config-missing ${error.message}`);
    return;
  }
  if (!forward || typeof forward.file !== "string" || !Array.isArray(forward.args)) {
    log("forward-config-invalid");
    return;
  }
  try {
    const child = spawn(forward.file, [...forward.args, ...codexArgs], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.on("error", (error) => log(`forward-spawn-error ${error.message}`));
    child.on("exit", (code) => log(`forward-exit code=${code}`));
    // Give the exit log a moment to land, then let go — never hold Codex open.
    setTimeout(() => child.unref(), 2000).unref();
  } catch (error) {
    log(`forward-error ${error.message}`);
  }
}

function main() {
  const codexArgs = process.argv.slice(2);

  // 1. Forward first — the original handler's behavior is sacred.
  forwardToOriginal(codexArgs);

  // 2. Normalize + append. The payload is the last argument that parses as a
  //    JSON object; anything else is ignored.
  let payload = null;
  for (let i = codexArgs.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(codexArgs[i]);
      if (parsed && typeof parsed === "object") {
        payload = parsed;
        break;
      }
    } catch {
      /* not JSON — keep scanning */
    }
  }
  if (!payload) {
    log(`no-json-payload argv=${JSON.stringify(codexArgs).slice(0, 500)}`);
    return;
  }

  try {
    fs.mkdirSync(EVENTS_DIR, { recursive: true });
    fs.appendFileSync(path.join(EVENTS_DIR, "codex.jsonl"), `${JSON.stringify(normalize(payload))}\n`);
  } catch (error) {
    log(`append-error ${error.message}`);
  }
}

try {
  main();
} catch (error) {
  log(`fatal ${error && error.message}`);
}
process.exitCode = 0;
