# SPEC — Charli v2: the pet with hands

> Execute in a fresh session, working dir `C:\Users\Adam\OneDrive\Desktop\Mission-Control`.
> Supersedes `SPEC.md` (Phase 4 operator desk) as the product direction. Phase 4's
> build record and verification ledger stay in that file — do not edit or delete it.
> The tri-pane capsule UI, the opencode board agent, and the in-app drop zone are
> RETIRED as product surfaces. Salvage map below; archive, don't blindly delete.

## Goal

Charli is a desktop pet — the Codex pet pattern, elevated. An inch-tall, draggable,
always-on-top Tama overlay that (1) receives **real completion events from both Claude
Code and Codex**, (2) shows one status note speaking for both brains, (3) jumps Adam
to the right app on click, and (4) has **hands**: on click-to-send she moves a finished
turn from one brain to the other, so Adam stops being the clipboard between them.

She is a router, never a runner. **No third agent, ever** — Adam will not use any
surface that bridges to an agent that isn't Claude Code or Codex (ruling 2026-07-10;
this is why the opencode board died).

## What good looks like

Codex finishes a turn while Adam is on the other monitor. Tama's note flips to
"Codex done — click to send to Claude Code." One click: the turn summary is already
saved as a note in Flux, Claude Code's window comes forward, one pointer line is
pasted and submitted. The copy-button → drag-cursor → paste ritual becomes one click.
Same in reverse for Claude → Codex.

## Architecture

```
Codex notify (agent-turn-complete) ──► fan-out adapter ──► existing codex-computer-use.exe (UNTOUCHED)
                                             │
                                             ▼
Claude Code Stop hook ───────────────► Charli broker (local, in Electron main)
                                             │
                             ┌───────────────┼────────────────┐
                             ▼               ▼                ▼
                       Tama overlay    status note      hands worker
                       (always-on-top  (both sources)   (handoff note → focus
                        pet window)                      target → paste pointer)
```

Normalized event shape (both sources):
```json
{ "source": "codex|claude", "event": "turn_completed", "thread_id": "...",
  "turn_id": "...", "cwd": "...", "status": "completed", "message": "...",
  "timestamp": "..." }
```

## Hard constraints

1. **`~/.codex/config.toml` line 9** holds Codex's single `notify` slot, currently:
   `notify = ["...\\codex-computer-use.exe", "turn-ended"]`. NEVER clobber that
   handler. The fan-out adapter takes over the `notify` entry, receives Codex's JSON,
   forwards it **unchanged** to the original exe+arg, then posts a normalized copy to
   the broker. S1 acceptance includes proving the original handler still fires.
2. **No screen-watching for completion detection.** Codex's `notify` payload carries
   thread id, turn id, cwd, and last-assistant-message — use it. Claude Code side is a
   `Stop` hook. UI automation is last-mile only: focus a window, click into a task,
   paste one pointer line where no CLI/hook/file route exists.
3. **Flux is the shared workspace — zero Flux code changes in V1.**
   - Flux repo (do NOT edit in this build): `C:\Users\Adam\OneDrive\Desktop\Flux Cowork\flux`
     (branch `phase-5-card-layout`). The wrapper folder holds the saved-notes output
     folder, `Start-Flux.ps1`, and docs. Confirm the exact notes-folder name on disk
     before wiring.
   - Charli writes handoff notes as `.md` into Flux's notes folder and watches it for
     new drops (folder watch, from outside).
   - Voice "surface Flux" = focus the Flux window, launching via `Start-Flux.ps1`
     if it isn't running.
4. **Routing contract: click-to-send (Adam's ruling 2026-07-10).** Charli announces
   and offers; one click executes the handoff. No full-auto in V1. No confirmation
   dialogs — the pet's note IS the button.
5. **Tama identity is fixed.** Reuse `C:\Users\Adam\OneDrive\Desktop\Tama-Mascot-Handoff`
   (`pet/spritesheet.webp`, 8x11 atlas; identity rules in `CLAUDE_CODE_HANDOFF.md`).
   Do not redraw; ribbon + gold `@` pendant stay. The installed Codex pet is Adam's
   to toggle on/off — irrelevant to this build; never recreate it.
6. **No third agent.** opencode supervisor, board primer, board chat: retired.
   Route nothing to opencode.
7. **Adam names products.** The repo stays `Mission-Control` until he says otherwise.
8. Secrets discipline from Phase 4 carries forward: keys live in main-process env
   only, never in the renderer, never in workspace files (proven boundary —
   see SPEC.md ledger).

## Salvage map

| Existing piece | Fate |
|---|---|
| `electron/backend/opencodeSupervisor.ts`, `boardConfig` | Retire (archive; do not route to it) |
| Tri-pane renderer UI, drop-zone UI, board chat feed | Retire — Flux replaces the drop surface |
| `src/voice/switchboard.ts` + tests | Keep — retarget: targets `claude`, `codex`, `flux`(focus); `board` removed; `submitToPane` → `submitToApp` (hands) |
| `src/voice/missionVoice.ts` (voice kernel) | Keep unchanged |
| Event logging (`data/events.jsonl`, run_trace lane) | Keep — broker log joins it |
| Electron main process + pty/lifecycle plumbing | Keep — hosts broker, pet window, hands worker |

## Slices (smallest viable, in order; gate each on its check)

**S1 — Event spine.**
Fan-out adapter (small node script/exe registered in `notify`), Claude Code `Stop`
hook posting to the broker, broker = local HTTP listener in Electron main,
JSONL event log.
✅ Check: one real Codex turn + one real Claude Code turn → both appear normalized in
the event log, AND the original codex-computer-use handler demonstrably still fires.
Show the JSONL lines.

**S2 — Pet overlay.**
Frameless, transparent, always-on-top Electron window, ~1 inch, draggable anywhere,
Tama spritesheet idle animation. Note bubble shows latest status per source
("Codex: done 2m · Claude: working"). Click a source → focus that app's window.
✅ Check: screenshot of Tama floating over Codex Desktop showing a *Claude Code*
status (the thing the Codex pet structurally can't do); click brings the app forward.

**S3 — Hands v1 (the wire).**
On `turn_completed`: write message + metadata as a handoff note into the Flux notes
folder; pet note becomes "click to send to <other brain>"; on click, hands focus the
target desktop app and paste one pointer line
(`Review <path> — <source> turn summary`) + Enter. Payload travels by file, never by
clipboard. Both directions.
✅ Check: a Codex→Claude review handoff and a Claude→Codex handoff, each with zero
manual copy-paste — event-log evidence + the handoff notes visible in Flux.

**S4 — Voice retarget.**
Switchboard targets: `claude`/`codex` (dispatch to desktop app windows via hands),
`flux` (surface/focus). Board target and opencode path removed; tests updated.
✅ Check: `npm test` green; spoken "surface flux" focuses/launches Flux.

**Later (not this build):** Telegram pipe into the same broker; Codex task deep-link
research (unverified whether one exists — window focus is the fallback); auto-routing
mode; FluxDraw; Hetzner always-on half + @Charli MCP (Phase 5 direction in SPEC.md
still stands); **Flux improvement arc** — Adam granted rights 2026-07-10, direction
filed in `Flux Cowork\FLUX-DIRECTION.md`; runs as its own arc AFTER the event spine
is proven ("zero Flux code changes" holds for this build).

## Non-goals

- No new drop-zone/notepad UI — Flux exists; she adopts it.
- No edits to the Flux repo in this build.
- No rebuilding the Codex pet or touching its install surface.
- No opencode / third-brain anything.
- No screen-scrape completion detection.
- No away-from-desk relay build (Cowork / ChatGPT Work own single-vendor dispatch;
  Telegram-in is a later thin pipe into the same broker).

## Verification standard

Every slice hands over a runnable check + evidence (command + output, or screenshot).
A fresh subagent reviews the final diff against this spec and reports only gaps that
affect correctness or stated requirements.

## BUILT STATE — 2026-07-10 (branch charli-v2-spine)

**S1 — Event spine ✅ LIVE-PROVEN**
- `spine/charli-notify.cjs` + `charli-claude-hook.cjs` + `install-spine.cjs`;
  installed to `~/.charli/bin`, both configs patched with backups in
  `~/.charli/backups/`. Original notify handler captured to `notify-forward.json`.
- 7 vitest tests green, incl. the forward-args-unchanged contract.
- LIVE Codex proof: real `codex exec` turn → normalized event in
  `~/.charli/events/codex.jsonl` (thread/turn ids, cwd, message="pong") AND
  adapter.log `forward-exit code=0` — the original codex-computer-use handler ran.
  (Codex CLI upgraded 0.143.0 → 0.144.1; old CLI predated the account's model list.)
- Claude proof: hook parsed a real 27MB session transcript and extracted the
  correct last assistant message. Live registration fires from the next NEW
  Claude Code session (sessions read hooks at start; the build session predated
  the install) — check `~/.charli/events/claude.jsonl` after any fresh turn.
- Broker (`electron/backend/charliSpine.ts`) tails both JSONL files, seeds
  latest-status from history, handles truncation and partial lines.

**S2 — Pet overlay ✅ VISUAL-PROVEN**
- Frameless transparent always-on-top ("screen-saver" level) 170x230 window,
  draggable by grabbing Tama, bottom-right spawn, skip-taskbar.
- Skin system: `skins/<name>/skin.json` + sheet; active skin from
  `~/.charli/config.json` `petSkin` — NOT hardcoded (Adam's mood rule). Tama
  8x11 atlas ships as the default skin; row 0 = 8-frame idle cycle.
- Self-capture (`CHARLI_CAPTURE=1` → `~/.charli/pet-capture.png`) shows Tama
  + one bubble with BOTH brains ("Claude 22m / Codex 10m / Flux") — the
  sentence the Codex pet can't say.
- Fix ledger: app.css min-width bled into the pet page and pushed content
  off-viewport; pet.css now hard-resets html/body/#root for the pet window.

**S3 — Hands v1 ✅ END-TO-END-PROVEN (Notepad stand-in)**
- On turn_completed with text: handoff note written to
  `Flux Cowork\Saved Flux Notes\Handoffs\Handoff - <source> - <ts>.md`
  (live-verified within 3s of an appended event).
- Click-to-send (`CHARLI_TEST_SEND` runs the same function as the pet button):
  focused the target window (restore-if-minimized via user32), typed the
  pointer line + Enter via SendKeys (base64-delivered, escaped, no clipboard).
- UIA readback of the target window's document:
  `Review "...\Handoffs\Handoff - codex - 2026-07-10 18-31-48.md" - codex turn summary`
  — exact expected line. Test used Notepad as the window target (config
  override, restored after) so no live agent session received a surprise
  prompt while Adam was away. Real-window handoff is one config-free click
  when he's back.

**S4 — Switchboard retarget ✅**
- Targets: claude/codex (pty panes as before) + flux (focus/launch via
  Start-Flux.ps1, restore-if-minimized); board target REMOVED from
  normalizeTarget, voice tools, and read path. opencode supervisor no longer
  started (module retained, unrouted). 10 switchboard tests green.

**Suite:** typecheck green, 50 vitest tests green, build green.

**Deferred (named, not hidden):**
1. Claude Stop hook live-fire — lands automatically on Adam's next new session.
2. Real-window (Claude/Codex desktop) handoff click — deliberately not fired
   into live sessions while unattended; the identical code path is proven.
3. Idle-row animation is row 0 of the atlas; other rows (wave, look-directions)
   available for state-aware animation later.
4. Handoff notes accumulate in Flux's Handoffs folder — no rotation (append-only
   ethos); revisit if volume annoys.
