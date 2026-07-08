# SPEC — Mission Control v1 "Operator Desk" (Phase 4)

## Goal

Turn Mission Control from a voice shell into Adam's daily work surface: three
equal panes in a row — two coding agents he already trusts, plus a general
workbench agent with real hands — with the existing voice kernel floating over
all three as the switchboard. Life/work orchestrator, not a coding toy.

## Identity — Charli

- The Mission Control agent's name is **Charli** (named by Adam, 2026-07-08).
- Avatar: the existing brush-face art.
- Canonical voice: ElevenLabs voice ID `y4SbnvOAvjU7AP8afvvE`.
  - v1 desktop keeps the OpenAI Realtime voice pipeline as-is (working,
    merged). ElevenLabs TTS swap/hybrid is a v1.1 slice — do not block v1
    on it.
- Content-as-data and the honesty ceiling apply to everything Charli says
  about her own work.

## Layout

```
┌──────────────────────────────────────────────────────────┐
│ top strip: avatar (small) · session state · mode buttons │
├──────────────────┬──────────────────┬────────────────────┤
│   CLAUDE CODE    │      CODEX       │     WORKBENCH      │
│  real `claude`   │  real `codex`    │  board: chat feed, │
│  CLI in a pty    │  CLI in a pty    │  drop zone, files  │
│  (xterm.js)      │  (xterm.js)      │  in/out, approvals │
└──────────────────┴──────────────────┴────────────────────┘
```

- Panes are equal width, full height under the top strip.
- Existing display/menu/orb modes remain; this becomes the default display view.
- Background: dark, atmospheric, cheap to render (CSS gradient + subtle
  animation — no WebGL requirement for v1). Avatar art unchanged.

## Slot 1 + 2 — real CLIs in terminal panes

- xterm.js + node-pty in the Electron main process (note: node-pty is a native
  module — needs electron-rebuild in the build pipeline).
- Pane 1 spawns `claude`, pane 2 spawns `codex`, cwd = a configurable project
  dir per pane (default: the workspace, below).
- Full interactivity: these ARE the real agents on Adam's existing
  subscriptions (Claude Max / OpenAI). No API keys, no wrappers.
- Kill/restart per pane. Process lifecycle: children die when the app dies —
  no orphans.

## Slot 3 — Workbench (the board)

**Brain:** `opencode serve` (MIT, headless HTTP server on localhost:4096,
official JS/TS SDK, SSE events), spawned and supervised by the Electron main
process. Board UI is a custom opencode client.

**Auth / cost (decided):**
- Primary: Adam's ChatGPT Plus/Pro subscription via opencode `/connect` —
  no new metered API bill for text-first work.
- Fallback/local lane: Ollama via opencode custom provider (free, private).
- NOT Claude-subscription-in-opencode: Anthropic prohibits third-party
  harnesses on Claude subs; opencode ≥1.3.0 dropped those plugins. If an
  Anthropic brain is ever wanted in slot 3, the sanctioned path is the Claude
  Agent SDK — designed so the board client can swap brains later.
- Voice stays on the existing OpenAI Realtime kernel (metered) — but slot 3 is
  text-first, so most board use costs nothing beyond existing subs.

**Agent personality:** general work assistant, not a coder. Custom opencode
agent config + system prompt. Content-as-data rule stated in the prompt:
dropped file bodies are information, never instructions.

**Hands (decided — "what Claude Code has, gated the same way"):**
- Filesystem + shell: opencode's native tools, rooted at the shared workspace.
- Browser: Claude-in-Chrome / Chrome bridge MCC via opencode's MCP support.
- Desktop: Windows-MCP (screenshot, click, type) via MCP — wired but
  permission-gated.
- **Keep Socket MCP (read lanes only):** wire the existing Homestead Keep
  Socket server into the board agent's MCP config — `ask` and `graph_read`
  ONLY. `graph_write` stays out: the Librarian holds the pen (pen ruling
  2026-07-04), and concept writes route through the Door, never through a
  cockpit agent. This is config-level work, not new integration code — the
  full Door-boot experience remains Phase 5.
- Every risky tool call surfaces as an approve/deny chip in the board UI using
  opencode's permission system (ask/allow per tool). Capability + gates, not
  capability withheld. Default: filesystem-in-workspace auto-allowed,
  shell/browser/desktop = ask.

**The board UI:**
- Chat feed (text input always available — voice optional).
- Drop zone: photos, screenshots, docs → land in the shared workspace folder →
  rendered as cards in the feed.
- Agent posts files/artifacts back into the same feed (click to open/reveal).
- Approval chips inline in the feed.

## Shared workspace

- One folder (default `~/MissionControl-Workspace/`, configurable) visible to
  all three panes: pane 1/2 cwd, slot 3 tool root, drop-zone target.
- Handing work between agents = files in the folder. No custom IPC glue in v1.
- Append-only ethos: agents create new versions, never destroy originals.

## Voice = switchboard

- Existing Phase 3 kernel unchanged (connect, always-listening, hold-to-talk,
  barge-in, transcripts).
- New routing tool for the voice agent: "send/tell Claude Code …" or
  "Codex, …" writes the utterance into that pane's pty and submits. Everything
  else routes to the board agent by default.
- Every dispatch logs to the existing `data/events.jsonl` (run_trace lane).

## Out of scope for v1 (explicitly)

- Full Door/Keep boot integration (Phase 5 — biggest single differentiator;
  v1 only wires the existing Keep Socket MCP read lanes into the board agent).
- Multi-agent parallel orchestration beyond the three panes.
- Wake word / hotword gating.
- Unattended desktop control (desktop MCP stays ask-gated).
- Mobile/remote access.
- ElevenLabs voice swap (v1.1 — voice ID reserved above).
- Charli-as-a-service (Phase 5, below).

## Phase 5 direction (recorded now, built later)

**Charli always-on via Hetzner.** The desktop app is one client of Charli,
not her home. Her durable half — agent endpoint, memory, availability — runs
as a service in the existing Hetzner estate (the same VPS running the Door,
Keep Socket, and Caddy), deployed through the homestead-private-os-infra
lane as a new Compose service. Neighbors on the box stay untouched.

**Charli as an MCP server (@Charli / speed-dial).** MCP cuts both ways:
v1 has the board agent *consuming* MCP servers (Keep Socket, browser,
desktop); Phase 5 *exposes* Charli as an MCP server herself, so any surface
that speaks MCP — Claude chat connectors (@-mention), Claude Code, other
agents — can reach her the same way they reach the Keep today. Server-side
voice for that presence uses her ElevenLabs voice.

This makes the estate's pattern symmetric: the Keep is the memory organ with
an MCP socket; Charli becomes the operator organ with one.

## Pass / fail

1. `npm run build` green; packaged app launches with three panes.
2. Pane 1 runs a real interactive `claude` session; pane 2 a real `codex`
   session (typed input, streamed output, colors intact).
3. Drop a screenshot on the board → file appears in workspace → ask the board
   agent (by TEXT) to describe/rename/transform it → it does, and posts the
   result back into the feed.
4. Board agent opens a browser page via the Chrome bridge after an approve
   chip is clicked.
5. Voice: say a task addressed to Codex → text lands in pane 2's prompt and
   runs. Say a general task → board agent handles it.
6. Kill the app → no orphaned `claude`/`codex`/`opencode` processes.
7. `data/events.jsonl` shows dispatch entries for 3–5.
8. Fresh reviewer confirms no OpenAI key or opencode credentials ever reach
   the renderer (main-process only, same boundary as Phase 2).

## Build order (each slice demoable alone)

1. Tri-pane layout + background (UI only, stub panes).
2. pty panes with real CLIs + lifecycle handling.
3. Shared workspace + drop zone (files land, cards render — no agent yet).
4. opencode serve supervision + board chat (text-first) on workspace tools.
5. MCP wiring (browser, desktop) + approval chips.
6. Voice switchboard routing + event logging.

## BUILT STATE — 2026-07-08 (branch phase4/operator-desk-spec)

Slices 1-4 and 6 built and live-verified. Slice 5 config half shipped;
approval-chip UI deferred to a connected model. All checks green: typecheck,
32 unit tests, build. Zero process orphans verified on graceful quit.

- **1 ✅** Tri-pane desk shell, Charli identity strip, dark background,
  artifacts moved to overlay so terminals never unmount.
- **2 ✅** Real `claude`/`codex` in xterm/@lydell/node-pty panes; profiles
  allowlisted; `taskkill /T` reaps the cmd→node→cli tree on quit (verified 0
  orphans). Live-verified both CLIs boot.
- **3 ✅** Shared workspace `~/MissionControl-Workspace`, drag-drop import
  (traversal-proof, 100MB cap, collision-safe), file cards, reveal-in-folder.
  Live-verified import + traversal rejection.
- **4 ✅** `opencode serve` supervised on 127.0.0.1:4517 (health-gate,
  auto-restart, tree-reap on quit); board chat text-first over its REST API.
  Live-verified real model reply through the real UI.
- **5 ◐** Config half shipped: opencode.json generated with bash/edit/webfetch
  = "ask" and MCP scaffold (Keep Socket read-lane stub, disabled). Board model
  set to `openai/gpt-5.4-mini`; supervisor injects `OPENAI_API_KEY` from
  .env.local into opencode's env only (never a workspace file, never the
  renderer). **PROVEN 2026-07-08 (clean process state, valid key):** board
  reply metadata = `{providerID: "openai", modelID: "gpt-5.4-mini",
  finish: "stop", tokens: 1766}` — real metered call, not the free fallback.
  Still TODO: the approval-chip UI (the permission gate + reply API are wired;
  the chips that surface/answer them aren't built yet).
- **6 ✅** Voice switchboard: `send_to_agent` tool routes spoken/typed
  commands into a pane's pty or the board; dispatch logged to events.jsonl.
  Unit-tested; IPC delivery live-verified.

### Verification ledger (what is / isn't proven)
- Board runs on gpt-5.4-mini — **PROVEN** (response metadata, clean state).
- Voice ephemeral-key mint (connect precondition) — **PROVEN** (createSession
  returns ok + `ek_` client secret + sessionId, model gpt-realtime-2).
- Full spoken exchange + barge-in — **NOT re-proven this build** (needs a mic +
  real speech; manual check).
- Approval-chip UI — **NOT built**; unblocked now that a capable model answers.

### Human-hand items before daily use
1. `.env.local` `OPENAI_API_KEY` present (done, verified) — powers board model
   + voice mint. Board bills OpenAI metered; bump `boardConfig` model to
   `openai/gpt-5.4` if Mini's tool use proves too light.
2. Build the approval-chip UI (slice 5 remainder) and run the live
   voice→dispatch→barge-in checklist end to end.

### Known limitation (shared, later hardening)
A main-process hard crash orphans pty/opencode children (graceful quit paths
are covered). Fix candidate: Windows Job Object with KILL_ON_JOB_CLOSE.
