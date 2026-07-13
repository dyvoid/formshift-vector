# Roadmap

This is the "what might come next" document for the Vector client. It is not a sprint board or a
commitment list. Anyone should be able to scan it without archaeology.

Status values:
- **Candidate** — idea worth tracking; no decision made yet
- **Planned** — decision made, not started; ADR exists or is in progress
- **In flight** — actively being worked on; see [PICKUP.md](../PICKUP.md) for current state
- **Done** — shipped; kept here for a while for context, then archived

Milestones below are defined in the Milestones section of [Design](architecture/design.md). Each
has a testable exit condition, not a date — see that document for full detail; this table tracks
status only. Milestones are one track shared with the server repo: each server capability ships
alongside the Vector feature that consumes it. The server slices of M0–M2 are already **done** in
`dyvoid/formshift-server`, so the Vector slices below are unblocked through M2.

| Feature | Status | Description | ADR |
|---|---|---|---|
| UI stack choice (shell + canvas library) | Done | Electron + Fabric.js, accepted 2026-07-12 | [0002](adr/0002-ui-stack-electron-fabricjs.md) |
| M0: Trace (Vector slice) | In flight | Code complete: image drop, live trace parameters w/ throttling, commit-only mode, stale-response discarding, SVG preview, export. Exit (real PNG → production SVG using only the app, on a real machine) pending | — |
| M1: Pipeline (Vector slice) | In flight | Layer stack UI w/ reorder + on/off and binarize pinned late: done. Remaining: A/B compare, blend/opacity (blocked on a server-side blend module), interactive crop handles (Fabric), packaged installer w/ embedded Python | — |
| M2: Color (Vector slice) | Candidate | Posterized multi-color tracing, progressive layer rendering, draft toggle, diff overlay (pixel IoU, recovery metrics) | — |
| M3: Extensions (Vector slice) | Candidate | Background-removal layer; extension-discovery UX decision forced here | — |
| M4: Print (Vector slice) | Candidate | Vector post-stack (simplify, corner smoothing), spot-color separation, underbase, trapping, garment mockup preview | — |
| Paintable per-layer mask | Candidate | The natural third per-layer control alongside blend/opacity (Affinity Live Filter Layers pattern); regional rather than global adjustments. Explicitly deferred in the design doc | — |

---

## Archive

_Nothing archived yet._
