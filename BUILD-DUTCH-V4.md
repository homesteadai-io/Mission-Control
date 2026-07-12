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
