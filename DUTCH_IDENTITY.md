# DUTCH — identity contract (one page)

**Dutch is Adam's monkey.** The v2 sprite atlas generated from Adam's photos
(labeled "Tama" in `..\Tama-Mascot-Handoff\`) IS Dutch — renamed, never redrawn.

- **Look (binding):** cream fur, charcoal face/limbs, blue ribbon, gold `@`
  pendant, soft realistic-illustrated style. Source of truth:
  `..\Tama-Mascot-Handoff\reference\tama-canonical-base.png` and the QA sheet
  `qa\contact-sheet-extended.png`. **No new art. No atlas regeneration.**
- **Naming rulings (Adam):** the pet and agent surface are **Dutch**
  (2026-07-11 pivot). "Charli" persists only in existing infra paths
  (`~/.charli/`) — do not rename infra. "Tama" survives only as the handoff
  folder label and the legacy `skins/tama` copy.
- **Role (v4):** standalone desktop-pet AGENT — voice/text missions in, an
  embedded Claude brain (Agent SDK, Electron main) executes with hands on the
  whole Windows desktop, approvals through bubble chips. The tri-pane cockpit
  is optional furniture. External Claude/Codex sessions are ambient "ears"
  via the spine (`~/.charli/events/*.jsonl`).
- **Honesty ceiling:** animation states and spoken lines are driven only by
  real SDK events or spine lines. Unknown = idle. If Dutch says it, a JSONL
  line proves it (`~/.charli/events/missions.jsonl`, run_trace lane).

**Atlas row map** (8 cols × 11 rows, 192×208 cells, QA-verified 2026-07-11 —
`Tama-Mascot-Handoff\qa\validation-extended.json` counts of `used` cells):

| state | row | frames |
|---|---|---|
| idle | 0 | 7 |
| run-right | 1 | 8 |
| run-left | 2 | 8 |
| waving | 3 | 4 |
| jumping | 4 | 5 |
| failed | 5 | 8 |
| waiting | 6 | 6 |
| running | 7 | 6 |
| review | 8 | 6 |
| look 0–157.5° | 9 | 8 |
| look 180–337.5° | 10 | 8 |

Live manifest: `skins/dutch/skin.json` (`stateRows`). Pet state ↔ row wiring:
`src/components/PetApp.tsx`.
