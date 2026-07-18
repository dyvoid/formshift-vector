# Roadmap

This is the "what might come next" document for the Vector client. It is not a sprint board or a
commitment list. Anyone should be able to scan it without archaeology.

Status values:
- **Candidate** — idea worth tracking; no decision made yet
- **Planned** — decision made, not started; ADR exists or is in progress
- **In flight** — actively being worked on; see [PICKUP.md](../PICKUP.md) for current state
- **Parked** — committed work deliberately paused in favor of something more important
- **Done** — shipped; kept here for a while for context, then archived

Milestones below are defined in the Milestones section of [Design](architecture/design.md). Each
has a testable exit condition, not a date — see that document for full detail; this table tracks
status only. Milestone numbers are shared vocabulary with the server repo, not an execution order:
the server ([dyvoid/formshift-server](https://github.com/dyvoid/formshift-server), public) has
completed its slices ahead of this client, so every Vector slice below is unblocked. For current
server capability or status, consult the server repo's roadmap or the live module manifests
(`listModules`) — server status is deliberately not recorded here (link, don't copy; copied status
goes stale).

Execution order is set by the statuses below, not by milestone number: **M2 (Color) is the active
milestone**, prioritized over M1's remainder (color output matters more than the installer, crop
handles, or A/B compare — and most real designs are multi-color, so M2 also unblocks M0's exit
condition).

| Feature | Status | Description | ADR |
|---|---|---|---|
| UI stack choice (shell + canvas library) | Done | Electron + Fabric.js, accepted 2026-07-12 | [0002](adr/0002-ui-stack-electron-fabricjs.md) |
| M0: Trace (Vector slice) | In flight | Code complete: image drop, live trace parameters w/ throttling, commit-only mode, stale-response discarding, SVG preview, export. Exit (real design → production SVG using only the app) pending — most real designs are multi-color, so M2 feeds this exit | — |
| M1: Pipeline (Vector slice) | Parked (core done) | Layer stack UI w/ reorder + on/off and binarize pinned late: done — this is what M2 builds on. Parked until after M2: packaged installer w/ embedded Python + server lifecycle, interactive crop handles (first real Fabric.js work). Blend/opacity blocked on a server-side blend module. A/B compare demoted to Candidate (below) | — |
| M2: Color (Vector slice) | In flight | The active milestone, staged: (1) posterized multi-color tracing — quantize stage in the pipeline model, fan-out graph builder, module names from server manifests, delivered via the existing poll path; (2) draft toggle (flag already plumbed in the client); (3) progressive layer rendering — SSE consumer + completion-order compositing (the exit condition: a 16-color trace renders progressively); (4) diff overlay (pixel IoU, recovery metrics) | — |
| M3: Extensions (Vector slice) | Candidate | Background-removal layer; extension-discovery UX decision forced here | — |
| M4: Print (Vector slice) | Candidate | Vector post-stack (simplify, corner smoothing), spot-color separation, underbase, trapping, garment mockup preview | — |
| A/B compare | Candidate | Demoted from M1 (2026-07-18): M2's diff overlay covers much of the same need quantitatively; revisit if the overlay proves insufficient | — |
| Paintable per-layer mask | Candidate | The natural third per-layer control alongside blend/opacity (Affinity Live Filter Layers pattern); regional rather than global adjustments. Explicitly deferred in the design doc | — |

---

## Archive

_Nothing archived yet._
