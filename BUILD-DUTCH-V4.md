# BUILD — Dutch v4 (run log, evidence per slice)

Branch: `dutch-v4`. Spec: `SPEC-DUTCH-V3.md` (v4 content, pivot ruling 2026-07-11).

## S0 — Truth audit ✅ (2026-07-11 23:31)

**1. Overlay launches post-move, skin loads — PASS.**
- `npm run build` exit 0 (vite + tsc electron).
- Launched `electron dist-electron/main.js` with `CHARLI_CAPTURE=1`;
  `~/.charli/pet-capture.png` written 2026-07-11 23:31:18 (40,885 bytes).
- Capture shows Dutch rendered (cream fur, charcoal face, gold pendant) with the
  bubble listing live spine rows: Claude 13m · Codex 1h · Flux.

**2. Idle-frame discrepancy resolved — BOTH prior values were wrong.**
Authority: `Tama-Mascot-Handoff/qa/validation-extended.json` (counts `used` cells).

| row | state | frames (used cells) |
|---|---|---|
| 0 | idle | **7** (skin.json said 8 — col 7 is empty; old manifest said 6) |
| 1 | running-right | 8 |
| 2 | running-left | 8 |
| 3 | waving | 4 |
| 4 | jumping | 5 |
| 5 | failed | 8 |
| 6 | waiting | 6 |
| 7 | running | 6 |
| 8 | review | 6 |
| 9 | look-000-to-157.5 | 8 |
| 10 | look-180-to-337.5 | 8 |

Live bug this exposes: current `skins/tama/skin.json` (`idleFrames: 8`) cycles
through an empty cell — one blank flash per idle loop. Fix lands with the
`skins/dutch` row map in S2 (S0 is no-code).

**3. Spine ears — PASS, end to end.**
- `~/.charli/events/claude.jsonl`: fresh Stop-hook line at 2026-07-12T03:17:42Z
  (tonight, post-move, post-spec) from a real external Claude Code turn.
- `~/.charli/events/codex.jsonl`: last write 2026-07-11 22:28 (tonight).
- The pet bubble in the S0 capture displays that exact Claude turn — hook →
  jsonl → spine → bubble, whole path live.

**4. Flag for S1 (recorded, not blocking):** a nested `claude -p` spawned from
inside an agent session gets `401 Invalid authentication credentials` even with
every `CLAUDE*`/`ANTHROPIC*` env var stripped — the host session holds the OAuth
refresh. Consequence: the S1 auth-lane proof cannot be faked from a build
session; it must self-record from a NORMAL app launch (Adam double-clicking).
S1's mission trace therefore logs `apiKeySource` + auth mode into
`missions.jsonl` so the first real launch produces the evidence automatically.

## S1 — Brain in a box ✅ code + trace / ⏸ auth proof awaits one normal launch

Built (all typechecked, `npm run build` exit 0, 56/56 vitest green):
- `electron/backend/missionRunner.ts` — embedded Agent SDK session per mission;
  hermetic (`settingSources: []` — first live run leaked user-level MCP tools
  into the brain, second run proved 32 base tools only); env-stripped
  (session-poisoned `CLAUDE*`/`ANTHROPIC_BASE_URL`/`ANTHROPIC_API_KEY` vars
  removed and traced); S1 permission policy in `canUseTool` (perception allow,
  writes/shell workspace-rooted, all else deny) with unit tests.
- Mission trace: every SDK event → `~/.charli/events/missions.jsonl`
  (run_trace lane): mission_started, env_stripped, sdk_init (apiKeySource,
  auth_lane, model, tools), assistant_text/tool_use, permission_decision,
  mission_completed/failed (usage, total_cost_usd, num_turns).
- IPC `mission:start` + `mission:event` stream → pet bubble: mission input +
  Go button, live status line, completion/failure coloring, metered-lane ⚠.
- Headless hook `DUTCH_TEST_MISSION` runs one mission through the real IPC
  path 6s after launch (evidence self-records on ANY launch).

**Live evidence (2026-07-11 23:51, launched FROM the build session):**
- `sdk_init` traced `apiKeySource: "none"` → **no API key demanded anywhere**;
  the CLI went straight for login credentials. `auth_lane: "max-login"`.
- Turn then failed `401` — the S0-documented sandbox artifact (host-held OAuth;
  no child of a build session can complete a turn). `total_cost_usd: 0` —
  zero metered spend occurred or can occur (no ANTHROPIC_API_KEY exists, and
  the runner strips one if a session ever injects it).
- `pet-capture-late.png`: bubble shows the mission input UI and reports the
  failure honestly in red — no faked success (honesty ceiling holds).

**HARD STOP per spec:** the auth lane is code-proven to *attempt* the Max
login and *cannot* silently meter. The completed-turn half of the proof needs
one normal launch: double-click `scripts/launch-charli.cmd`, type any mission
(or set `DUTCH_TEST_MISSION`), then read the `sdk_init` + `mission_completed`
pair in `~/.charli/events/missions.jsonl`. If that run shows
`auth_lane: "max-login"` + a completed result, S2 may open.
