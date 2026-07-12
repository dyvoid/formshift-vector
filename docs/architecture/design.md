# Formshift: Vector — Design

This is the authoritative design document for Formshift: Vector, distilled from the original
two-part project proposal (preserved in git history as `formshift-proposal.md` in the first
commit). The [overview](overview.md) is the short orientation; this document carries the full
design and its rationale. Decisions that get frozen get ADRs in [`docs/adr/`](../adr/); anything
here without an ADR is design intent — stable in direction, explicitly unstable in detail until
its first real consumer exists.

The server half of the proposal (Formshift Server: contracts, caching, security, extension
isolation, transport tiers) lives in the `dyvoid/formshift-server` repository and its own design
doc. This document covers the client, and states server facts only where the client depends on
them.

---

## Problem

Open source raster-to-vector tooling is a black box: image in, SVG out, with at most a handful of
trace-time parameters. But output quality is mostly decided outside the trace step. Preprocessing
(cleanup, background removal, levels, thresholding) determines what the tracer sees;
post-processing (path cleanup, simplification, color separation) determines whether the result is
usable. Interactive control over both sides, with a live view of the result, is essential for a
good vector, and no open source app offers it as one pipeline. One illustration: threshold and
cleanup choices before tracing decide which fine detail survives at all, and single-shot tools make
that choice invisibly, discoverable only by inspecting the output afterward.

Nearest existing things, checked directly (mid-2026):

- **Inkscape's Trace Bitmap**: a modal dialog with trace-time options. Preprocessing means
  round-tripping through a separate raster editor; post-processing is manual path editing.
- **ComfyUI with community ToSVG nodes** (vtracer and potrace variants): the closest working thing.
  Real preprocessing plus trace in one cached graph, and a few post nodes (path simplify,
  quantize). Falls short as a product for this job: queue-and-rerun interaction rather than live
  parametric preview, essentially no vector-side post-processing beyond simplify, and a
  gigabyte-class PyTorch stack plus GPL-3.0 attached to what is fundamentally a diffusion tool.
- **Graphite**: the closest in spirit. Non-destructive layer/node hybrid over raster and vector,
  Apache 2.0, desktop builds in release candidate. Has no bitmap tracing at all today, raster
  support is explicitly experimental, and its processing units are compiled-in Rust with no
  out-of-process module protocol and no path for external dependencies like Python ML models.
- **Commercial tools** (Vectorizer.ai, Illustrator's Image Trace) produce good results but are
  closed and expose little to no pre/post control.

Separately, no general-purpose vectorizer serves print production's downstream needs: spot-color
separation, underbase generation for dark garments, trapping against press misregistration.
Dedicated separation software exists but doesn't trace; tracers don't separate. Vector spans both.

## Scope

Any arbitrary image in, best possible vector out, where "best possible vector" means the best
achievable flat vector-art aesthetic, not photorealistic reproduction. Deliberate scope decision.

Photographic and gradient content is in scope as input, but output is always a flat, posterized,
vector-styled result (the "poster" look). This removes any need for an ML photo-vectorization
backend (gradient mesh fitting, differentiable rendering): posterizing a photo into flat tones and
tracing each tone is a well-established technique on the same potrace pipeline used for line art.
If a future version needs photorealistic vector output, that is a different product with a
different core algorithm, not an extension of this one.

## Pipeline architecture

Two data phases with a hard boundary, expressed as a graph on Formshift Server:

1. **Raster stack**: modules operating on pixel buffers. Crop, rotate, levels, threshold,
   background removal, sketch/line-art extraction, super-resolution, smart region selection.
   Freely reorderable; classical CV and AI modules mix freely since both map pixel buffer to pixel
   buffer.
2. **Binarize**: the one-way door. Continuous pixel values become a binary mask. Pinned near the
   end of the raster stack because nothing downstream of it can see color or gray-level
   information again; free reordering across this boundary produces invalid pipelines (binarizing
   before background removal destroys the color data removal needs), a lesson taken from
   darktable's pixelpipe, which fixes execution order for correctness while presenting an editable
   history.
3. **Potrace**: the trace step, a module like any other to the server. Fed raw grayscale with
   potrace's native blacklevel parameter (`-k`) exposed as a live "detail recovery" dial.
   Mkbitmap-style high-pass pre-filtering is deliberately avoided: it is tuned for OCR document
   cleanup, and on a development test case it visibly destroyed thin organic linework, consistent
   with that documented purpose. Potrace's core is monochrome-only, confirmed against the
   maintainer's own statements. Multi-color output is built on top: posterize to N flat colors,
   one binary mask per color, one potrace run per mask, merge paths with fills. Mature pattern
   (Inkscape's color trace, `node-potrace`'s Posterizer, coltrace).
4. **Vector stack**: modules operating on path data. Corner smoothing, curve simplification,
   spot-color separation, underbase generation, trapping, stroke width adjustment.

All four phases execute server-side as modules; the client's job is to present this as an editable
layer stack, keep the ordering valid across the binarize boundary, and translate the stack into
the server's graph model.

## Terminology

- **Module**: a processing unit defined by its I/O type contract (server concept).
- **Layer**: a module instance placed in a project's stack. Module is the type, layer is the
  placement; Vector's linear stack is a degenerate case of the server's graph.
- **Layer UI**: the control panel for one layer's interactive components.

## Color handling and performance

Per-color tracing scales roughly linearly with color count: one independent potrace call per
color. That structure, not any specific measurement, is the design input.

Color count is not capped to solve the scaling. Real separation tools (InkSplit, Separation
Studio) routinely output 10-16+ ink channels for simulated process work; a cap would amputate that
use case. Instead:

- **Parallelize the per-color calls.** Each color's trace shares no state with any other:
  embarrassingly parallel by structure. (Landed server-side in the server's M2 slice, benchmarked
  at 2.45× on 8 cores for a 1600×1600 16-color separation.)
- **Decouple preview resolution from export resolution**, per darktable's precedent.
- A soft cap on live-preview color count remains available as a low-end-hardware safety valve; a
  UX detail, not a product limit.

## Preview interaction and throttling

Any control that streams intermediate values during one interaction (sliders, color-wheel drags,
crop/rotate handles, drag-to-reorder, held steppers) gets two independent adjustable behaviors: a
throttle/debounce rate, and a commit-only option (fire on mouse-up/enter only). Discrete controls
(checkboxes, dropdowns) have no stream to throttle.

Throttling alone doesn't make fast interaction correct. Multiple in-flight async requests can
resolve out of order, flashing a stale result over a newer one. The client tracks the latest
request per control and discards or cancels superseded responses; throttling reduces the frequency
of the race, tracking eliminates it. These three behaviors — throttle, commit-only, stale-response
discarding — ship together for every streaming control, from M0 onward.

This is a separate axis from the server's draft mode: draft is how expensively a module computes
when asked, throttling is how often it gets asked.

Module-internal throttling exists beneath UI throttling and is not redundant with it: UI throttling
is a courtesy of this one frontend; the server-side limit is the only one that holds for all
callers. That side is the server's concern.

## Layer controls

Every layer has an on/off toggle, no exceptions.

Blend mode and opacity are granted by a structural rule, not a per-type whitelist: any layer whose
output preserves pixel-coordinate correspondence with its input (same canvas dimensions, (x,y) in
means (x,y) out; true of levels, HSL, threshold, background-removal strength) gets blend and
opacity, because blending against the layer below is well-defined at matching coordinates. Layers
that change canvas geometry (crop, arbitrary rotation, resize) don't get the option; there is no
coherent blend target across mismatched coordinate spaces.

Deferred, not current scope: a paintable per-layer mask, the natural third control alongside blend
and opacity (the pattern of Affinity Photo's Live Filter Layers), enabling regional rather than
global application of an adjustment.

## Draft and quality modes (client side)

The server owns the draft flag; the client owns the toggle and what draft means for this workload:
downsampling once at the pipeline boundary, so every module processes fewer pixels for free
without being resolution-aware. Default is full-quality preview, not draft — during design
exploration, a broken vectorization pass looked completely fine as a small thumbnail and was only
caught by pixel-level comparison at full resolution; defaulting to draft would build that failure
mode into every user's workflow. Draft is a global toggle applied to the whole pipeline, an opt-in
speedup, and applies to both preview and export.

## Progressive rendering (client side)

Results stream in as individual module outputs complete rather than waiting for the whole graph.
Safe when outputs are disjoint (non-overlapping regions cannot display incorrectly regardless of
completion order); not safe when outputs deliberately overlap by design (a white underbase layer
beneath other ink colors) — those need a pinned render order or the user sees a wrong composite
while later results are still arriving. Two code paths, decided per output group, not one
implementation assumed to generalize. The client must implement both render paths; the server
decides the delivery order.

## Packaging and tech stack

- **UI shell**: web frontend (canvas interaction library, Fabric.js or Konva) wrapped in a native
  container (Electron or similar). Presentation and interaction only; all processing routes
  through Formshift Server's API. The shell choice is Vector's alone and implies nothing about the
  server. The concrete choice of shell and canvas library is an open decision, recorded as an ADR
  when made (first task of M0 app code).
- **Embedded runtime**: Vector bundles its own Python interpreter and the Formshift Server package
  inside the installer, spawns the server on launch, captures the port and auth token, and shuts
  it down on exit. End users never see Python. Real forum evidence shows ordinary users fighting
  pip, PATH, and interpreter-version issues just to run a single background-removal script; both
  ComfyUI's portable distribution and chaiNNer (which downloads an isolated Python build on first
  start for exactly this reason) demonstrate the pattern works.
- **Desktop-first, by deliberate choice**, for a stack of practical reasons rather than any single
  one: no hosting to run or pay for; a portable build can be handed to a non-technical person and
  just opened, with no separate server process and browser tab to orchestrate; native local file
  handling (open, save, watch folders) instead of upload/download round trips; everything works
  offline; no per-interaction network latency; and local AI modules (background removal,
  segmentation) run as ordinary processes with full hardware access instead of fighting a browser
  sandbox. A browser deployment stays structurally possible later — the server plus a web client
  is the same architecture — but it is a possibility deliberately left unexercised, not a target.

### Licensing note on potrace

Potrace is GPL-2.0. It runs inside the server, strictly as a subprocess (aggregation, not
linking) — that boundary is the server repo's to preserve. What lands on this side: **distributing
the potrace binary alongside the app requires complying with GPL source-availability terms for
that binary**, which is routine, but it makes the installer/packaging configuration a licensing
boundary and not just build plumbing. Never "optimize" any part of the stack into linking against
potrace.

## Feature ideas by category

**Raster preprocessing layers**
- Crop, rotate, levels/curves, threshold: standard classical ops from the server's core extension
- Background removal (U²-Net/rembg-class model, ~1M params, CPU-viable)
- Photo/render-to-line-art extraction, for sources that aren't line art yet, a genuinely separate
  input class
- Smart region selection (MobileSAM-class model) for manually correcting ambiguous thin-line
  regions
- Super-resolution pre-upscale for low-resolution source logos (risk: hallucinated detail; fine
  for casual reuse, wrong where geometric fidelity matters)
- Vesselness/ridge filtering as a conservative detail-recovery mode, measured competitive with
  more aggressive methods specifically at the low-recovery end of the recovery/fattening curve

**Vectorization core**
- Potrace integration with blacklevel as a live parameter
- Live diff overlay against the source raster (pixel-level IoU, gray-band recovery percentage) as
  a first-class UI element, so trace fidelity is measured in the app instead of eyeballed in an
  external editor

**Print-specific post-processing**
- Underbase / highlight-white auto-generation for dark garments (overlapping layer: pinned render
  order)
- Trapping / choke controls against press misregistration (same render-order constraint)
- Live garment-color mockup preview
- Spot-color palette reduction and per-color layer export

---

## Build strategy

Vector and the server are one track, not two: each server capability lands in the same milestone
as the Vector feature that consumes it (the server's final milestone, M5, is the explicit
exception — it is for consumers other than Vector). Development is linear in contracts, not in
code volume: the server's protocol surface is forward-only, and this client codes against it.
Client internals are free to churn behind stable behavior; "never move backwards" here means never
break a shipped user-facing behavior or the server contract this client depends on, not never
rewrite code.

The server-side slices of M0–M2 are already implemented in the server repo. This repo starts at
zero and builds the Vector slices against them.

### Version 1 scope (M0)

Vector v1 does one thing: drop an image in, trace it with potrace, adjust basic controls, export
the SVG. That is already a useful tool and the smallest thing that validates the whole stack end
to end. The Vector slice: image drop, live trace parameters with per-control throttling,
commit-only mode, and stale-response discarding, an SVG preview, and export. Dev-mode launch
suffices; no installer yet.

### Milestones (Vector slices)

Each milestone has a testable exit condition, not a date. Server-slice detail lives in the server
repo's design doc and roadmap.

**M0: Trace.** Image drop, live trace parameters with throttling, commit-only mode,
stale-response discarding, SVG preview, export. Dev-mode launch (manually started server).
Exit: take a real design from PNG to production-ready SVG using only the app.

**M1: Pipeline.** The layer stack UI (crop, rotate, levels, threshold), binarize pinned late,
per-layer on/off, blend/opacity per the structural rule, A/B compare, packaged installer with
embedded Python.
Exit: reordering a mid-stack layer recomputes only downstream; the installer runs on a clean
machine; a client-side performance baseline on target hardware is recorded.

**M2: Color.** Posterized multi-color tracing, progressive layer rendering, draft toggle, diff
overlay (pixel IoU, recovery metrics) as a first-class UI element.
Exit: a 16-color trace renders progressively in the app.

**M3: Extensions.** Background-removal layer (first out-of-core extension); the
extension-discovery UX decision is forced here rather than left open (inline prompt when a
pipeline needs an uninstalled extension vs. upfront installation from an extensions page).
Exit: the extension installs and works from the app on a machine where its dependency pins would
conflict with core.

**M4: Print.** Vector post-stack (simplify, corner smoothing), spot-color separation, underbase
generation, trapping, garment mockup preview.
Exit: produce separations for a real print job fit to hand to a printer.

Sequencing notes: M0 through M2 are dependency-ordered. M3 and M4 can swap depending on which
matters first to real work. The installer sits in M1 rather than M0 deliberately (M0 serves its
own developer; packaging should not delay first real use), and the diff overlay sits in M2 where
multi-color output makes fidelity hardest to eyeball.

---

## Open risks (client side)

- The UI stack (shell, canvas library) is unchosen; the choice is load-bearing for packaging
  complexity and interaction latency and must be recorded as an ADR before app code accretes
  around a default.
- Bundling a Python runtime inside a native app shell adds real packaging complexity versus a
  pure-JS stack.
- Enforcing or softly discouraging invalid raster-stack orderings (across the binarize boundary)
  without frustrating users who want real flexibility is an unresolved UX question.
- Progressive rendering requires two client code paths (completion-order for disjoint outputs,
  pinned-order for overlapping ones); building only the disjoint case and assuming it generalizes
  produces visibly wrong output.
- Extension-discovery UX is undecided; decision forced at M3.
- All performance reasoning is structural until baselines exist on target hardware. The server's
  M1/M2 baselines exist; the client-side budget (interaction-to-preview latency through the full
  HTTP round trip) has no recorded numbers yet.
- No direct competitor was found for the combination (interactive raster prep + tracing + print
  finishing). Either a genuine gap or a sign nobody thought it worth building; worth staying
  honest about which.
