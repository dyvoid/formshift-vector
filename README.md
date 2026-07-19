# Formshift: Vector

[![CI](https://github.com/dyvoid/formshift-vector/actions/workflows/ci.yml/badge.svg)](https://github.com/dyvoid/formshift-vector/actions/workflows/ci.yml)
[![Status](https://img.shields.io/badge/status-M2_Color_in_flight-yellow)](docs/ROADMAP.md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript&logoColor=white)](tsconfig.json)
[![Electron](https://img.shields.io/badge/Electron-43-47848F?logo=electron&logoColor=white)](docs/adr/0002-ui-stack-electron-fabricjs.md)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](src/renderer)

A non-destructive raster-to-vector tracing app for print and general design work: any image in,
the best achievable flat vector-art output, with interactive control over raster preprocessing,
the trace step, and vector post-processing — plus the print finishing (spot-color separation,
underbase, trapping) that no general-purpose vectorizer serves.

## What this is

Most vectorizers (Inkscape's Trace Bitmap, Illustrator's Image Trace, most one-shot web tools) work
the same way: you pick a few trace-time settings, hit go, and inspect a static result. If the
output is wrong, you either fight sliders blind or round-trip through a separate raster editor to
fix the source image, then re-trace from scratch.

Vector instead treats vectorization as one continuous, editable pipeline, closer to how a
non-destructive photo editor treats a raw file than how a trace dialog works:

- Build a **reorderable stack of raster edits** (crop, rotate, levels, invert, …) on top of the
  source image.
- Watch the **traced SVG update live** as you tune any layer's parameters — no separate "now trace
  it" step.
- Toggle layers on and off, reorder them, and see the result recompute, instead of undoing and
  redoing a one-shot conversion.
- (Planned) Clean up and finish the vector result itself — path simplification, spot-color
  separation, underbase generation, trapping — for garment and print production, not just a flat
  SVG export.

It's a desktop app (Electron), not a web service: drop a PNG in, drag the layer stack around, watch
the preview, export SVG.

## How it works

This repository is **the client only** — the window you interact with. All actual image and vector
processing (cropping, thresholding, tracing, path operations) happens in
[Formshift Server](https://github.com/dyvoid/formshift-server), a separate Python process that this
app spawns (or, in dev mode, connects to) and talks to over a local HTTP + SSE API. Vector never
touches a pixel or a path directly — it renders UI, builds a description of "what should happen to
this image," and displays whatever the server sends back.

```
┌─────────────────────────────────────────────┐
│ Electron desktop shell                       │
│  ┌─────────────────────────────────────────┐ │
│  │ React renderer                           │ │
│  │                                           │ │
│  │  Layer stack UI ── per-layer controls     │ │
│  │        │                                 │ │
│  │  Graph builder (stack → server graph)     │ │
│  │        │                                 │ │
│  │  Interaction layer                        │ │
│  │  (throttle / commit-only /                │ │
│  │   stale-response discarding)              │ │
│  │        │                                 │ │
│  │  Preview (source + traced SVG) ── Export  │ │
│  └─────────────┼─────────────────────────────┘ │
└────────────────┼─────────────────────────────┘
                  │ HTTP (commands) + SSE (progress)
                  ▼
        Formshift Server subprocess
      (bundled Python runtime; separate repo)
```

Concretely, one edit — dragging a slider, toggling a layer, dropping a new image — flows through
the app like this:

1. **You edit the layer stack.** Layers are things like crop, rotate, levels, invert; each is an
   on/off toggle plus its own parameters.
2. **The graph builder translates the stack into a job** for the server: raster layers, then a
   pinned binarize step (color → black/white mask), then a pinned trace step (potrace). This
   ordering is enforced because nothing after binarize can see color again.
3. **The interaction layer decides when to actually send it.** Every streaming control (a slider
   drag, for example) is throttled and can be set to commit-only (fire on release, not every
   pixel of drag). Whichever request is newest always wins — an older, slower response arriving
   late is discarded rather than flashing over a newer result.
4. **The server runs the job and returns results**, which the client downloads and shows: the
   traced SVG next to the pre-processed raster (the image exactly as the tracer saw it, after your
   stack ran), with a choice of preview backdrop.
5. **Export** downloads the current SVG.

## Status

Working today: drop an image, edit a reorderable raster stack (crop/rotate/levels/invert) over
the pinned binarize + trace tail, watch the pre-processed source and traced SVG side by side
(with a selectable preview backdrop), export the SVG. The active milestone is **M2: Color** —
posterized multi-color tracing, a draft toggle, progressive per-color rendering, and a diff
overlay. M1's remainder (packaged installer with server lifecycle management, interactive crop
handles) is parked behind it. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for sequencing and
rationale, [`docs/architecture/design.md`](docs/architecture/design.md) for the full design, and
[`PICKUP.md`](PICKUP.md) for where the last session left off.

## Getting Started

Start the server from its own repo, then the client from here:

```
# in ../formshift-server
uv sync
uv run formshift-server --port 0
# prints: formshift-server listening on http://127.0.0.1:<port>
#         token: <bearer token>
```

```
# in this repo — installs dependencies on first run, then launches the dev app
start.bat     # Windows
./start.sh    # Linux/macOS
```

(Equivalent to `npm install && npm run dev`.) Paste the server's printed URL and token into the
connect panel.

Other useful commands (see [`package.json`](package.json)):

```
npm run lint        # ESLint
npm run format       # Prettier check (format:fix to apply)
npm run typecheck    # tsc, main + renderer
npm test             # Vitest (unit tests always run; integration tests need a live
                      # server via FORMSHIFT_URL / FORMSHIFT_TOKEN, otherwise skipped)
npm run build        # electron-vite production build
```

## Project Structure

```
src/
  main/                 Electron main process (window creation, lifecycle)
  preload/              Electron preload script (context-isolated bridge)
  renderer/              The React app (the UI you actually see)
    src/
      App.tsx             Top-level: connect panel vs. editor
      components/         Editor shell, connect panel, drop zone, layer stack, SVG preview
      hooks/usePipeline.ts  Drives the server job for the current pipeline; owns result state
      pipeline/            Client-side pipeline model + translation to the server's graph
      interaction/         Throttle/commit-only stream + stale-response discarding
      server/              Typed HTTP client for the Formshift Server API
      image/               Client-side image decode/re-encode helpers
docs/       Architecture, design, decisions, and guides
AGENTS.md   Context and instructions for AI agents
PICKUP.md   Session handoff — where the last session left off
```

## Documentation

- [Architecture Overview](docs/architecture/overview.md)
- [Design](docs/architecture/design.md)
- [Architecture Decisions](docs/adr/)
- [Git Strategy](docs/git-strategy.md)
- [Roadmap](docs/ROADMAP.md)
