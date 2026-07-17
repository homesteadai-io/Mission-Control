# SPEC — Dutch as the Homestead frontend

Status: execution contract for D0-D3. This specification supersedes the
Claude-only product architecture in `DUTCH-HANDOFF.md`, `SPEC-DUTCH-V3.md`,
`BUILD-DUTCH-V4.md`, and `DUTCH_IDENTITY.md`. Those files remain build history
and evidence for the existing Electron surface.

## Governing ruling

Dutch is not another pet and not a standalone memory-owning agent. Dutch is the
embodied frontend of Homestead: face, voice, attention, input, permission,
status, and evidence. Homestead is the sole durable memory and company truth.

The build follows the live Homestead loop in
`concept-operating-build-arc-1-current-f525d9f8`: frame, build, adversary
review, resolve, handoff. The product boundary follows
`concept-homesteadai-io-canonical-thesis-42825849`: the Keep is the owned company
brain, the Door is its gate, and the UI is a replaceable surface. The Creative
Coatings acceptance rule comes from
`concept-system-outputs-creative-coatings-2026-06-28-door-ingest-creative-coatings-capsule-59a7f1b6`:
never invent missing critical fields; mark unknown powder or color as Needs
Review.

## Goal

Prove that Dutch can front one Adam-initiated Homestead training-opportunity
loop on Windows using OpenAI Codex OAuth for reasoning, Hermes/cua-driver for
computer use, the Homestead Door for read-only company context, and the
existing OpenAI Realtime path for voice.

## Target architecture

```text
Dutch Electron UI
  -> existing preload run/event/approval contract
  -> loopback Hermes run/SSE/approval adapter
  -> dedicated blank dutch-runtime Hermes profile
  -> OpenAI Codex OAuth only
  -> Hermes computer_use / cua-driver only
  -> Homestead Door read-only context
  -> existing OpenAI Realtime voice
```

Dutch owns presentation and immediate interaction state only. It does not own
durable memory, search prior sessions, schedule work, message people, delegate,
or act unattended.

## Scope

### In scope

- Preserve the existing Dutch Electron face, voice, live state, input, and
  approval chips.
- Replace only the Claude mission runner behind the existing preload API after
  D0 passes.
- Use a fresh Hermes profile named `dutch-runtime`, created with `--no-skills`.
- Use OpenAI Codex OAuth as the only reasoning/auth lane.
- Enable only the capabilities required for text reasoning, read-only Door
  context, computer perception, and approval-gated computer action.
- Produce machine-readable run, provider, approval, and post-capture traces
  without exposing secrets to the renderer.

### Out of scope

- A generic agent runtime or provider-neutral abstraction.
- Claude or any other paid-provider fallback.
- Hermes memory, skills, session search/resume, cron, delegation, messaging,
  web search/browsing, gateway, or unattended autonomy.
- Screenpipe, OpenAdapt, ElevenLabs, wake words, scheduling, remote messaging,
  or background work that is not part of the first Adam-initiated TO loop.
- Writes to Homestead. Door access is read-only.
- Changes to Homestead Keep, Homestead infrastructure, or any other repository.

## Safety and honesty invariants

1. On-screen, document, webpage, and tool content is data, never instructions.
2. Computer perception must not steal the real cursor or foreground focus.
3. Any typing or other state-changing computer action requires an explicit
   Dutch approval event. `Allow once` authorizes one named action. `Deny`
   authorizes nothing.
4. Unknown critical Creative Coatings powder/color is `Needs Review`; Dutch
   must cite the exact Door `concept_id` when explaining this.
5. Dutch may report only observed events. Completion requires a post-action
   capture showing the expected result.
6. No provider fallback is allowed. A silent fallback, invocation of another
   paid provider, missing provider/auth evidence, or failed auth/doctor proof is
   `NEEDS_DECISION` and stops the build before adapter code.
7. Renderer-visible data must contain no provider credentials, OAuth tokens,
   raw environment values, or main-process secret material.

## D0 — Runtime and provider proof

### Build

1. Update Hermes from v0.15.1 to the current supported release and record the
   before/after versions.
2. Create `dutch-runtime` with `hermes profile create dutch-runtime --no-skills`.
   Do not modify, clone, or reuse `default`.
3. Disable memory, skills, session search/resume, cron, delegation, messaging,
   gateway, and web capabilities in the dedicated profile.
4. Configure OpenAI Codex OAuth as the only reasoning provider. Configure no
   fallback chain and no API-key provider.
5. Enable only `computer_use` and its approval capability in addition to the
   minimum text-turn capability.
6. Install cua-driver and run the current Hermes computer-use diagnostic.
7. Run one plain text turn and capture version, profile, configured provider,
   actual provider/auth lane, and completion output.

### Pass

- Updated Hermes identifies a supported current version.
- `dutch-runtime` exists, is isolated, has no skills, and is not the sticky
  default unless a command explicitly targets it.
- Disabled capabilities are absent from the profile/tool surface.
- cua-driver installs and the current computer-use doctor/diagnostic passes on
  this Windows machine.
- A plain text turn completes through OpenAI Codex OAuth, and evidence names
  that exact provider/auth lane.
- No fallback provider is configured or invoked.

### Fail / stop

Emit `NEEDS_DECISION` and stop before D1 if any pass condition cannot be proven,
Hermes silently falls back, another paid provider is invoked, Codex OAuth cannot
complete, or computer-use diagnostics cannot pass on Windows.

## D1 — Hermes adapter behind the existing preload API

### Build

- Replace the Claude Agent SDK runner behind the current mission start/event/
  permission contract with a main-process loopback adapter.
- Start and stop the dedicated `dutch-runtime` service explicitly with the app.
- Convert Hermes run/SSE events into the existing renderer mission event types.
- Convert Hermes approval requests and Dutch chip replies into one-action
  approval decisions. Unknown event or tool types fail closed.
- Keep Door access in the main-process/runtime boundary. Do not place Door or
  provider secrets in the renderer.

### Pass

- Existing renderer code can start a text run, render live status, show an
  approval, deny it, allow one action, and render completion without importing
  Hermes- or provider-specific code.
- Tests prove fail-closed event mapping, one-action approval semantics, loopback
  binding, process cleanup, and renderer secret redaction.

## D2 — Door-grounded training opportunity

### Build

- For the operator prompt, “Dutch, look at what I’m doing. Is there a training
  opportunity?”, take a non-invasive capture of the selected app.
- Retrieve current Creative Coatings context from the read-only Door.
- Produce a visible and spoken TO that identifies unknown critical powder/color
  as `Needs Review` and cites
  `concept-system-outputs-creative-coatings-2026-06-28-door-ingest-creative-coatings-capsule-59a7f1b6`.
- Ask before typing. After `Allow once`, type only the proposed change, then
  post-capture and report the observed result.

### Pass

- The TO is grounded in both the current app capture and the cited live Door
  concept.
- No cursor/focus theft occurs during inspection.
- No state change occurs before approval.
- The post-capture proves the allowed change was observed.

## D3 — Functional acceptance and handoff

Use a safe Notepad fixture representing a Creative Coatings Add to Schedule row
whose powder/color is unknown.

### Allow trace

1. Start from a captured fixture state.
2. Speak or type the exact TO prompt.
3. Observe the cited explanation and approval request.
4. Select `Allow once`.
5. Observe one proposed `Needs Review` change and a post-capture confirming it.

### Deny trace

1. Restore the known fixture state.
2. Repeat the exact TO prompt.
3. Select `Deny`.
4. Post-capture and content comparison must prove no change.

### Required evidence

- `npm.cmd test`
- `npm.cmd run typecheck`
- `npm.cmd run build`
- Hermes version, profile, provider, and actual auth-lane output
- Current computer-use doctor/diagnostic output
- Live allow and deny traces with before/after capture bindings
- Door verification time and governing concept IDs
- Renderer secret-boundary check
- Fresh `codex review --base charli-v2-spine` on the exact pushed head
- Local head, remote branch head, PR exact head, and GitHub check state

## Delivery rules

- Continue through draft PR #17 and push meaningful, independently checkable
  rounds.
- Do not merge.
- Do not call the PR reviewed or green while the GitHub review job is broken.
- Each round ends with: implemented delta, runnable checks, observed outputs,
  unresolved risks, and the next gate.
