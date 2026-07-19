# PICKUP

Where the last session left off. Update this when you stop, so the next session starts with context
instead of archaeology.

## Current focus

**M2 (Color) stages 1–3 are merged to `main`** (2026-07-18, fast-forward of
`task/m2-color-trace`, validated in real use). The M2 exit condition is met: a 15/16-color trace
renders progressively in the real app. The hairline-seam issue is fixed (colormask `grow`,
2026-07-19), and palette control has landed with a follow-up UX pass (`fix/palette-editor-ux`,
2026-07-19) — see State. The unused-palette-index gap that briefly blocked full use of custom
palettes (a pinned color matching no pixel failed the whole trace) is **fixed server-side**
(`formshift-server` ADR 0022, 2026-07-19) and verified live: a 32-entry palette on a 4-color test
image now traces cleanly. The palette editor's UX is not considered fully settled (see Open
questions) — revisit if it keeps bothering real use. Remaining M2 scope: the diff overlay
(stage 4), planned separately. Staging and rationale in [docs/ROADMAP.md](docs/ROADMAP.md).

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
- **Palette control + seam overlap** (2026-07-19, `task/palette-seam-control`, verified live):
  the client side of server ADRs 0020 (explicit-palette posterize) and 0021 (colormask grow).
  `QuantizeSettings` gains `grow: number` (default 1) and optional `palette?: string[]`
  (undefined = auto mode driven by `colors`). `posterizeChain` sends `{ palette }` xor
  `{ colors }`; `buildColorTraceGraph` threads `grow` into each `mask{i}` (omitted at 0 to
  preserve pre-grow cache keys). New `pipeline/palette.ts` (normalizeHex / sanitizePalette,
  PALETTE_MIN 2 / PALETTE_MAX 32) sanitizes at the UI and graph edges since the server 422s on
  duplicates. New `PaletteEditor.tsx` in the Quantize fieldset: auto mode shows the last run's
  palette as a proposal + "Customize palette"; explicit mode gives per-swatch `<input
  type=color>`, remove (disabled at 2), Add (disabled at 32), "Pick from image" via the browser
  EyeDropper API (guarded on `window.EyeDropper`), and "Reset to auto". The used palette is
  surfaced on the pipeline done-state (`palette?`) so the editor can propose it. Verified end to
  end against a live server: removing blue from the four-quadrant test image remapped its pixels
  to the nearest remaining color in both the pre-processed source and the traced SVG.
- **Palette editor UX fixes** (2026-07-19, `fix/palette-editor-ux`): real-use follow-up to the
  above. `useCustomPalette: boolean` added to `QuantizeSettings` so custom mode is a remembered
  toggle, not a one-way door — "Use auto palette" leaves custom mode *keeping* the edited
  palette (the palette itself was already remembered-while-off; the mode wasn't), "Use custom
  palette" restores it; leaving also syncs `colors` to the palette length so the auto slider
  resumes near where the user left off instead of snapping back. The eyedropper now forces the
  source figure to show the original raster while open (`SvgPreview`'s `showOriginal` prop) —
  the pre-processed preview has already lost the colors the user is trying to pin, which made
  "Pick from image" a no-op. `pipeline/palette.ts` gained `nextSwatch`, a deterministic
  hue/lightness sweep so "+ Add" always inserts a color not already in the palette — it
  previously always inserted `#808080`, so every add after the first silently deduped away.
  Palette editor shows an entry-count note and flags the 32 cap.
- **Colormask unused-index fix** (server-side, `formshift-server` ADR 0022, 2026-07-19): this
  session also surfaced that a custom-palette entry matching no pixel made `image.colormask`
  reject the whole trace (`index N not present in image`) — two server contracts had disagreed
  since ADR 0020 shipped (median-cut's every-index-used assumption vs. an explicit palette's
  right to carry unused entries). Fixed same-day in the server repo: an in-range unused index now
  yields an empty (all-white) mask instead of raising; bounds check unchanged. No client change
  needed — Vector already sent this shape. Verified live end to end post-fix (32-entry palette,
  4-color image, clean trace) and via `formshift-server`'s own e2e suite.
- No CI yet; add together with the stack toolchain.

## Next

1. **M2 stage 4 — diff overlay** (pixel IoU, recovery metrics): the last M2 item; measurement,
   not capability. Server-first — the client never touches pixels, so the metrics/diff raster
   need server modules before client work starts.
2. **M0 exit**, now unblocked: take a real (multi-color) design from image to
   production-ready SVG using only the app.
3. **Parked M1 remainder** (after M2): packaged installer with embedded Python + server lifecycle
   manager (also the natural owner of the deferred session-cleanup/reconnect findings below);
   interactive crop handles (first real Fabric.js use — the current crop layer UI is numeric
   sliders). Blend/opacity remains blocked on a server-side blend module. A/B compare demoted to
   roadmap Candidate.

### M2 implementation notes (2026-07-18)

- **Palette flow**: the palette only exists inside posterize's output (palette-mode PNG), so the
  posterize path is two jobs — palette discovery, then the fan-out; the re-run is a server cache
  hit. `image/pngPalette.ts` reads the PLTE chunk client-side (transport decode, not processing).
  The used-indices-are-0..N-1 assumption is pinned by `color.integration.test.ts`.
- **SSE**: `EventSource` can't send the Authorization header, so `server/sse.ts` parses the
  fetch body directly. The stream opens *before* job submit (early events buffer in the
  response); a poll backstop covers a stream that dies pre-terminal, strictly sequential.
- **CORS gotcha**: a browser-context renderer (dev preview) needs the server started with
  `--cors-origin http://localhost:5173`; without it, connect fails as a bare "Failed to fetch".
  Worth noting for the M1 lifecycle manager. The Electron shell in production loads via file://
  and may need its own answer here — untested.
- **Verified live**: 15-layer progressive stack observed via MutationObserver timeline, then the
  merged swap; merged result 97% pixel-match against the posterized source (sampling compare);
  draft toggle re-runs immediately. Colors slider soft-capped at 32 in the UI (server allows 256).

## Open questions

- Palette editor UX (2026-07-19): the follow-up pass fixed concrete bugs (see State), but the
  overall interaction — mode toggle + swatch grid + separate seam slider all in one fieldset —
  hasn't been reviewed for whether it's the right shape, only whether it works. Revisit with
  fresh eyes before treating the editor as finished.
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
*Last updated: 2026-07-19 (palette control + seam overlap landed; editor UX fixes and the
server-side unused-index fix followed same-day)*
