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
- **M0 Trace slice merged** (PR #2): typed server client (sessions, payloads, jobs with
  poll-until-terminal and abort→server-side cancel), the interaction triad
  (`createControlStream` throttle/commit-only + `LatestGate` stale-response discarding), connect
  panel, PNG drop, live trace sliders, side-by-side preview, SVG export.
- **M1 layer stack implemented** (`task/m1-layer-stack`): pipeline model (reorderable raster
  stack: crop/rotate/levels; binarize pinned as the one-way door; trace pinned last), pure
  graph builder translating the stack to the server's node/edge graph, LayerStack UI with
  add/remove/reorder/on-off and per-param sliders, global stream settings. 28 tests (19 unit +
  9 live-server integration, incl. reorder-changes-result and toggle-off-equals-absent).
  Electron shell launch still unverified on a real machine (sandbox can't download the Electron
  binary — network policy).
- **Code-review pass over M0+M1** (`claude/code-review-quick-wins-7nkc8q`): fixed the traced-SVG
  blob-URL leak (URL now created and revoked in usePipeline, not in render), waitForJob's
  already-aborted-signal sleep, an out-of-order race between overlapping image drops, unvalidated
  localStorage connection JSON; small wins (throttle input clamped to its max, drop-zone Space no
  longer scrolls). Quality gate green.
- **Server side is ahead of us**: `dyvoid/formshift-server` has its M0–M2 slices done (HTTP API
  with token auth + sessions, DAG executor with hash-chain cache, potrace module, core raster
  modules, draft, multi-input merges, parallel per-color tracing, progressive streaming). The
  Vector slices of M0–M2 are unblocked.
- No CI yet; add together with the stack toolchain.

## Next

1. **M0/M1 validation on a real machine**: start the server (`uv run formshift-server
   --port 0`), `npm install && npm run dev`, paste the printed URL + token into the connect
   panel, and take a real design from PNG to production-ready SVG using only the app (M0 exit),
   exercising the layer stack while at it.
2. **Remaining M1 slice**: A/B compare; blend/opacity per the structural rule (**blocked on a
   server-side blend module** — the server has no image.blend; needs a server-repo task first);
   packaged installer with embedded Python + server lifecycle manager (needs a real machine);
   interactive crop handles on the preview canvas (first real Fabric.js use — the current crop
   layer UI is numeric sliders).

## Open questions

- Dev-mode server connection ergonomics: answered for M0 with a connect panel (paste URL +
  token, persisted in localStorage). The M1 lifecycle manager replaces it for packaged builds;
  keep the panel as a dev/remote-server escape hatch?
- CI shape for the integration tests: they skip without FORMSHIFT_URL/FORMSHIFT_TOKEN. Worth a
  CI job that installs the server (uv + potrace) to run them on GitHub runners?

## Deferred findings from the code-review pass (2026-07-13)

Noticed during the review pass but deliberately not changed — each is either on the AGENTS.md
human-review list or needs a design decision first. Evaluate next session:

- **CSP blocks remote servers**: the renderer CSP's `connect-src` only allows
  `127.0.0.1`/`localhost`, so entering a remote server URL in the connect panel fails silently
  at the network layer. Decide together with the escape-hatch open question above; CSP changes
  are on the human-review list.
- **Sessions are never deleted**: the client calls `createSession` on connect but never
  `deleteSession` (no disconnect UI, nothing on window close), so every app run leaves a
  server-side session behind. Relies on server-side reaping for now; the M1 lifecycle manager
  is the natural owner (it tears down the whole server process on exit).
- **Reconnect is impossible without a restart**: once connected, the ConnectPanel is gone —
  there is no way back to it to switch servers or recover from a dead server/expired session.
  Related to both points above.
- **Slider commits on every keyup**: `onKeyUp` fires for any key, so Tab-navigating through
  sliders re-submits the pipeline. Harmless today (server hash-chain cache makes it a cheap
  cache hit) but noisy; filtering to value-changing keys is a one-liner if it bothers anyone.
- **Levels black/white points can cross**: the black-point slider can exceed the white point
  (black=200, white=100). The server presumably clamps or inverts; decide whether the client
  should constrain the pair (e.g. min-gap) or leave it as a creative degree of freedom.
- **No feedback on rejected drops**: dropping a non-PNG file is silently ignored (DropZone
  filters by `image/png` and does nothing else). A brief "PNG only" hint would help; skipped
  because it adds UI state, not because it's contested.

---
*Last updated: 2026-07-13*
