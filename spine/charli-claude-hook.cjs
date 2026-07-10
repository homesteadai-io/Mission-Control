#!/usr/bin/env node
/**
 * Charli Stop-hook for Claude Code.
 *
 * Registered in ~/.claude/settings.json under hooks.Stop. Claude Code pipes
 * hook input JSON on stdin ({ session_id, transcript_path, cwd, ... }).
 * This script extracts the last assistant message from the transcript and
 * appends a normalized turn_completed event to ~/.charli/events/claude.jsonl.
 *
 * Hard rules: never block Claude Code, never emit output that could be
 * interpreted as a hook decision, always exit 0 fast.
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CHARLI_DIR = process.env.CHARLI_DIR || path.join(os.homedir(), ".charli");
const EVENTS_DIR = path.join(CHARLI_DIR, "events");
const LOG_FILE = path.join(CHARLI_DIR, "adapter.log");
const TAIL_BYTES = 512 * 1024; // transcripts get big; the last turn lives at the end
const MAX_MESSAGE_CHARS = 100_000;

function log(line) {
  try {
    fs.mkdirSync(CHARLI_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} claude-hook ${line}\n`);
  } catch {
    /* nothing left to do */
  }
}

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function readTail(filePath) {
  const stats = fs.statSync(filePath);
  const start = Math.max(0, stats.size - TAIL_BYTES);
  const buffer = Buffer.alloc(stats.size - start);
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, buffer, 0, buffer.length, start);
  } finally {
    fs.closeSync(fd);
  }
  return buffer.toString("utf8");
}

/** Last assistant text in a Claude Code session transcript (JSONL). */
function lastAssistantText(transcriptPath) {
  const tail = readTail(transcriptPath);
  const lines = tail.split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // first line of the tail window is usually cut mid-record
    }
    if (entry.type !== "assistant" || !entry.message) continue;
    const content = entry.message.content;
    if (!Array.isArray(content)) continue;
    const text = content
      .filter((part) => part && part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return "";
}

function main() {
  const raw = readStdin();
  let input = {};
  try {
    input = JSON.parse(raw);
  } catch {
    log("stdin-not-json");
  }

  let message = "";
  if (typeof input.transcript_path === "string" && input.transcript_path) {
    try {
      message = lastAssistantText(input.transcript_path);
    } catch (error) {
      log(`transcript-read-error ${error.message}`);
    }
  }

  const event = {
    source: "claude",
    event: "turn_completed",
    thread_id: String(input.session_id ?? ""),
    turn_id: "",
    cwd: String(input.cwd ?? ""),
    status: "completed",
    message: message.length > MAX_MESSAGE_CHARS ? `${message.slice(0, MAX_MESSAGE_CHARS)}…` : message,
    payload_type: String(input.hook_event_name ?? "Stop"),
    timestamp: new Date().toISOString()
  };

  try {
    fs.mkdirSync(EVENTS_DIR, { recursive: true });
    fs.appendFileSync(path.join(EVENTS_DIR, "claude.jsonl"), `${JSON.stringify(event)}\n`);
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
