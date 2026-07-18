# PICKUP

Where the last session left off. Update this when you stop, so the next session starts with context
instead of archaeology.

## Current focus

**M2 (Color) is the active milestone**, re-prioritized ahead of M1's remainder on 2026-07-18:
color output matters more than the installer/crop handles/A/B compare, and most real designs are
multi-color, so M2 is also the practical path to M0's exit condition. Staging and rationale in
[docs/ROADMAP.md](docs/ROADMAP.md); milestone definitions in the Milestones section of
[docs/architecture/design.md](docs/architecture/design.md).

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
- **Server side is finished ahead of us**: `dyvoid/formshift-server` (now public) has completed
  its milestone slices through M4, so every Vector slice is unblocked. Per the new AGENTS.md rule,
  server status is no longer duplicated here — check the server repo's roadmap or the live module
  manifests. A server-side ADR (2026-07-18) keeps per-color masks disjoint, with an optional
  `grow`/dilation param deferred until seams are actually visible in a real trace.
- **Invert layer + preview upgrades** (2026-07-18, validated on a real machine): `image.invert`
  as a fourth raster module (param-less, data-only addition to `RASTER_LAYER_DEFS`); a
  Default/Black/White/Transparent backdrop picker above the Trace figure (view-only local state
  in Editor, CSS-only override of the checkerboard); the Source panel now shows the raster as
  trace saw it — the graph taps the `image` port of the node feeding trace as a second output,
  usePipeline downloads it alongside the SVG (`processedUrl` on the done state, same
  revoke-on-supersede lifecycle), falling back to the raw drop when the stack is empty.
  `start.bat`/`start.sh` at the root wrap install-if-needed + `npm run dev`.
- No CI yet; add together with the stack toolchain.

## Next

1. **M2 stage 1 — posterized color tracing, non-progressive**: generalize the pipeline model's
   pinned tail (binarize becomes the 2-color case of a quantize stage with a color count),
   fan-out in `buildPipelineGraph` (posterize → N× colormask→trace branches; the current builder
   assumes one linear chain), module names/ports read from the server's manifests (`listModules`)
   instead of hard-coded. Delivered through the existing poll-until-terminal path — color output
   lands here.
2. **M2 stage 2 — draft toggle**: nearly free; `submitJob` already plumbs the `draft` flag,
   nothing sets it. A checkbox next to throttle/commit-only.
3. **M2 stage 3 — progressive rendering**: SSE consumer in the client (none exists — the client
   is poll-only today) surfacing per-node outputs as they complete, plus completion-order
   compositing of per-color layers in the preview. This is the M2 exit condition (16-color trace
   renders progressively). Correct without ordering logic because per-color masks are disjoint
   per the server-side ADR.
4. **M2 stage 4 — diff overlay** (pixel IoU, recovery metrics): measurement, not capability;
   last.
5. **M0 exit**, best attempted once color works: take a real (multi-color) design from image to
   production-ready SVG using only the app.
6. **Parked M1 remainder** (after M2): packaged installer with embedded Python + server lifecycle
   manager (also the natural owner of the deferred session-cleanup/reconnect findings below);
   interactive crop handles (first real Fabric.js use — the current crop layer UI is numeric
   sliders). Blend/opacity remains blocked on a server-side blend module. A/B compare demoted to
   roadmap Candidate.

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
- **No feedback on rejected drops**: dropping a non-image file is silently ignored (DropZone
  filters by `image/*` and does nothing else — any decodable image is accepted since 2026-07-18,
  re-encoded to PNG client-side before upload). A brief "images only" hint would help; skipped
  because it adds UI state, not because it's contested.

---
*Last updated: 2026-07-18*
