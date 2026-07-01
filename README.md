# Homestead Mission Control

Voice-first desktop operator cockpit for Homestead. This repo holds the app shell. The Homestead
doctrine and build spec remain the source documents outside this repo.

## Phase 1

Implemented:

- Electron shell with secure preload boundary.
- React/Vite renderer.
- Display, menu, and compact computer-mode surfaces.
- Brush-face avatar using the supplied reference art.
- Artifact panel for markdown, Mermaid, tables, and image grids.
- Mermaid light-repair helper with fallback.

Not implemented yet:

- Realtime voice session.
- Ephemeral OpenAI key minting.
- Door-backed Keep reads.
- Codex dispatch.
- Tier-2 computer control.

## Run

```bash
npm install
npm run dev:renderer
```

For the Electron shell:

```bash
npm run dev
```

## Checks

```bash
npm test
npm run typecheck
npm run build
```
