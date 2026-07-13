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
- M0 app scaffold merged (PR #1): electron-vite + React + TS strict skeleton, quality gate, CI.
- **M0 Trace slice implemented** (`task/m0-trace`): typed server client (sessions, payloads,
  jobs with poll-until-terminal and abort→server-side cancel), the interaction triad
  (`createControlStream` throttle/commit-only + `LatestGate` stale-response discarding), and the
  UI (connect panel, PNG drop zone, blacklevel/turdsize sliders with per-control throttle rate
  and update-on-release, side-by-side source/trace preview, SVG export). 19 tests: 13 unit +
  6 integration against a live formshift-server with real potrace (PNG → SVG verified end to
  end). Electron shell launch still unverified on a real machine (sandbox can't download the
  Electron binary — network policy).
- **Server side is ahead of us**: `dyvoid/formshift-server` has its M0–M2 slices done (HTTP API
  with token auth + sessions, DAG executor with hash-chain cache, potrace module, core raster
  modules, draft, multi-input merges, parallel per-color tracing, progressive streaming). The
  Vector slices of M0–M2 are unblocked.
- No CI yet; add together with the stack toolchain.

## Next

1. **M0 exit validation on a real machine**: start the server (`uv run formshift-server
   --port 0`), `npm install && npm run dev`, paste the printed URL + token into the connect
   panel, and take a real design from PNG to production-ready SVG using only the app. That
   closes M0's exit condition.
2. **M1 Pipeline slice** (design doc, Milestones): layer stack UI (crop, rotate, levels,
   threshold), binarize pinned late, per-layer on/off, blend/opacity per the structural rule,
   A/B compare, packaged installer with embedded Python + server lifecycle manager.

## Open questions

- Dev-mode server connection ergonomics: answered for M0 with a connect panel (paste URL +
  token, persisted in localStorage). The M1 lifecycle manager replaces it for packaged builds;
  keep the panel as a dev/remote-server escape hatch?
- CI shape for the integration tests: they skip without FORMSHIFT_URL/FORMSHIFT_TOKEN. Worth a
  CI job that installs the server (uv + potrace) to run them on GitHub runners?

---
*Last updated: 2026-07-12*
