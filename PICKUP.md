# PICKUP

Where the last session left off. Update this when you stop, so the next session starts with context
instead of archaeology.

## Current focus

Repository just scaffolded (AGENTS.md, docs tree, git strategy, ADR 0001). No app code yet. Next
is the UI stack decision, then the M0 Vector slice — see [docs/ROADMAP.md](docs/ROADMAP.md) and
the Milestones section of [docs/architecture/design.md](docs/architecture/design.md).

## State

- Boilerplate and documentation in place; design doc distilled from the original proposal
  (proposal itself preserved in the first commit as `formshift-proposal.md`).
- M0 app scaffold done (`task/m0-app-scaffold`): electron-vite + React + TS strict skeleton,
  ESLint/Prettier/Vitest/tsc quality gate, CI workflow, hardened BrowserWindow defaults. Renderer
  build verified in headless Chromium; Electron shell launch still unverified on a real machine
  (sandbox couldn't download the Electron binary — network policy).
- **Server side is ahead of us**: `dyvoid/formshift-server` has its M0–M2 slices done (HTTP API
  with token auth + sessions, DAG executor with hash-chain cache, potrace module, core raster
  modules, draft, multi-input merges, parallel per-color tracing, progressive streaming). The
  Vector slices of M0–M2 are unblocked.
- No CI yet; add together with the stack toolchain.

## Next

1. **Merge `task/m0-app-scaffold`** (needs human review: it adds dependencies and CI config).
   First run on a real machine: `npm install && npm run dev`, confirm the window opens.
2. **M0 Vector slice** (design doc, Version 1 scope): image drop, live trace parameters with
   per-control throttling, commit-only mode, stale-response discarding, SVG preview, export.
   Dev-mode launch against a manually started server (`uv run formshift-server --port 0` in the
   server repo).

## Open questions

- Dev-mode server connection ergonomics: how the client discovers the port/token of a manually
  started server in M0, before the lifecycle manager exists (paste connection info? read the
  server's stdout via a dev script?).
- CI shape for a client repo whose e2e path needs a running server: mock the contract, or pull the
  server package into CI?

---
*Last updated: 2026-07-12*
