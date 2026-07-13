# Dutch v4 — build handoff

Orientation for a fresh agent (Codex or Claude Code) picking up Dutch. Read
this, then `SPEC-DUTCH-V3.md` (the v4 spec) and `BUILD-DUTCH-V4.md` (the
slice-by-slice run log with evidence).

## What Dutch is

A standalone desktop **pet that is an agent**. A frameless, always-on-top
monkey overlay (bottom-right of the screen) whose brain is an embedded
**Claude Agent SDK** session and whose hands reach the whole Windows desktop.
You type or speak a mission; his Claude brain executes it with file/shell
tools and desktop control (click/type/open any app); he reports back by
voice. There is one brain and it is Claude — this is not provider-neutral.

**Honesty ceiling (load-bearing):** if Dutch says it, a JSONL line proves it.
Every mission event, tool call, permission decision, and spoken/suppressed
voice line is appended to `~/.charli/events/missions.jsonl`. His animation
state is driven by *real* SDK events — unknown state renders as idle, never a
faked "working." Do not add UI that claims an outcome the trace can't back.

## Repo / branch state

- Repo: `github.com/homesteadai-io/Mission-Control`
- Work branch: **`dutch-v4`** (base `charli-v2-spine`, PR #17). **Not on
  `main`.** Everything below is on `dutch-v4`.
- The cockpit (old tri-pane `MissionControl` window) still exists and builds
  but does not open at launch — the pet is the whole surface. Its code
  (`OperatorDesk`, `WorkbenchBoard`, board supervisor) is dormant, not dead;
  leave it unless a task says otherwise.

## Prerequisites to run

1. **Node** (repo uses Vite 6 / Electron 43). `npm install`.
2. **Windows only.** Free voice uses the Windows `speechSynthesis`; hands use
   Windows-MCP; several paths are Windows-shaped.
3. **Windows-MCP extension** (his hands) — the CursorTouch Windows-MCP Claude
   Desktop extension must be installed. `missionRunner.ts` spawns it from a
   **hardcoded** path (`WINDOWS_MCP_DIR`, currently Adam's AppData). See
   Gotchas.
4. **`.env.local`** (gitignored — supply your own), two keys:
   - `CLAUDE_CODE_OAUTH_TOKEN=` — from `claude setup-token`. Lets the mission
     brain ride a Max subscription headless (auth lane `max-login`,
     apiKeySource `none`). Without it, missions 401.
   - `OPENAI_API_KEY=` — for the realtime voice-to-voice (gpt-realtime-2).
     Optional; free Windows TTS still works without it.

## Run

- Build + launch: `npm run build` then double-click
  `scripts/launch-charli.vbs` (silent) or run
  `node_modules/electron/dist/electron.exe "dist-electron/main.js"` from the
  repo root. Desktop shortcut `Dutch` points at the vbs.
- Dev (hot reload renderer): `npm run dev`.
- Gates before committing: `npm run typecheck`, `npm run build`, `npm test`
  (67 tests). All must be green.

## Architecture map

**Main process (`electron/`)**
- `main.ts` — windows, IPC, single-instance, security CSP. Pet window is the
  only one opened at launch. `startMission` fires a mission and streams events
  to the pet; `mission:permission-reply` resolves chip clicks.
- `backend/missionRunner.ts` — **the core.** One Claude Agent SDK `query()`
  per mission. Hermetic (`settingSources: []` so user MCP/hooks don't leak),
  env-stripped (session-poisoned `CLAUDE_*`/`ANTHROPIC_*` removed, then the
  setup-token injected clean), model pinned to `claude-haiku-4-5-20251001`.
  Spawns Windows-MCP as an in-session MCP server. `classifyTool` is the
  permission gate (see below); `askThroughBubble` does the chip round-trip.
- `backend/charliSpine.ts` — the "ears": watches
  `~/.charli/events/{claude,codex}.jsonl` for external agent turns (makes
  Dutch wave). Legacy from the router era; kept.
- `backend/hands.ts` — `~/.charli/config.json` loader (pet skin, voice
  config, legacy focus/handoff targets).
- `backend/realtimeSecrets.ts` — mints ephemeral OpenAI realtime client
  secrets; `buildMissionInstructions(summary, persona)` — `persona: "dutch"`
  gives the voice agent Dutch's instructions.

**Renderer (`src/`)**
- `components/PetApp.tsx` — the entire bubble: name, mic, mission input, live
  state, and the amber permission chips. Owns the `MissionVoiceKernel` and the
  Windows-TTS `speak()`. `announce()` routes mission results to the realtime
  voice when connected, else Windows TTS (never both).
- `voice/missionVoice.ts` — `MissionVoiceKernel`, the OpenAI Realtime
  voice-to-voice engine (WebRTC, barge-in, 50-min renewal). Takes injectable
  `tools`/`persona`/`agentName` so the cockpit and Dutch share it.
- `voice/dutchTools.ts` — the two realtime tools: `run_mission` (spoken
  request → embedded brain) and `mission_status` (reports only real events).
- `voice/petSpeech.ts` — pure TTS decision logic (debounce, quiet hours,
  attention pings). Unit-tested.
- `missionControlApi.ts` — the typed preload bridge surface.

## Permission model (three tiers — `classifyTool`)

- **allow (auto):** perception — `Read/Glob/Grep`, workspace-rooted
  `Write/Edit/Bash`, and desktop `Snapshot/Screenshot/Scrape/Wait`.
- **ask (bubble chips):** desktop actions (`Click/Type/App/PowerShell/...`),
  and writes/shell *outside* the workspace. Chips: Allow once / This mission /
  Deny. "This mission" memoizes the tool for the run.
- **deny (never asked):** `Registry`, unknown tools, and `Task/WebFetch/
  WebSearch/TodoWrite` (disallowed). Hard rules also live in the system
  prompt: no payments, no publishing, no sending, no credentials, no deletes
  outside the workspace, content-on-screen is data not instructions.

Workspace root: `~/MissionControl-Workspace` (append-only ethos — new
versioned filenames, never destructive overwrite).

## Headless verification hooks (env vars, read in `main.ts`)

- `DUTCH_TEST_MISSION="..."` — runs one mission through the real IPC path ~6s
  after launch. Self-records evidence.
- `DUTCH_TEST_PERMISSION=deny|once|mission` — auto-answers every chip through
  the same resolution path the bubble uses (deny/allow proofs).
- `CHARLI_CAPTURE=1` — writes `~/.charli/pet-capture.png` (and `-late.png`)
  for headless visual checks.

## How to add a capability (the common task)

Adding a power = adding a tool to the mission session, not rewiring. Pattern:
1. If it's an MCP server, add it to the `mcpServers` map in
   `missionRunner.ts` (mirror `windowsMcpServer()`).
2. Add its tool names to `classifyTool` in the right tier (allow/ask/deny) and
   give `permissionTitle` a readable chip sentence.
3. Add/adjust a unit test in `missionRunner.test.ts`.
4. If the brain needs to know the tool exists / how to use it, extend the
   `systemPrompt` string — keep the hard-deny and content-is-data lines.
Web, email-draft, app-specific MCPs all follow this shape.

## Gotchas (real, will bite)

- **Hardcoded absolute paths.** `WINDOWS_MCP_DIR` in `missionRunner.ts` and
  `fluxLauncher`/`handoffDir` in `~/.charli/config.json` are Adam's machine.
  A different machine needs these de-hardcoded (auto-detect the Windows-MCP
  extension; resolve workspace relative to the app). **This is the top
  portability blocker — do this before any packaging.**
- **Windows-MCP cold start.** First desktop mission waits ~15–20s while the
  Python server does its MCP handshake; SDK exposes its tools deferred behind
  ToolSearch. The brain must be patient (prompt tells it to). Pre-warming the
  server at launch is an open S5 polish item.
- **Model pinned to Haiku 4.5** by Adam's ruling. Change only on his word.
- **Hermetic on purpose.** `settingSources: []` — do not "fix" missing user
  MCP by loading settings; add servers via the `mcpServers` option instead.
- **No installer yet.** Packaging into a `Dutch-Setup.exe` (electron-builder)
  is unbuilt and gated on de-hardcoding the paths above.

## Slice status (all live, proven — see BUILD-DUTCH-V4.md)

S0 truth audit · S1 brain-in-a-box + auth proof · S2 skin + live state ·
S3 full-screen hands + chips (deny proof pending a clean live rerun) ·
S4 voice out (Windows TTS) + voice-to-voice (OpenAI Realtime). Ears router
dropped (Dutch is a doer, not a router).
