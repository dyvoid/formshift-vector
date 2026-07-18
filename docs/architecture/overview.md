# Architecture Overview

## What this is

Formshift: Vector is a non-destructive raster-to-vector tracing app for print and general design
work. It is the first client of Formshift Server (separate repository, `dyvoid/formshift-server`)
and embeds it as a subprocess. The client is presentation and interaction only: every pixel and
path operation happens server-side in modules, reached over the server's HTTP + SSE contract.

This document summarizes the shape for orientation. [Design](design.md) is the authoritative
design source — read it for full rationale; this doc should stay consistent with it, not duplicate
it wholesale.

## Shape

```
┌───────────────────────────────────────────────┐
│ Native desktop shell (Electron-class)         │
│                                               │
│  ┌─────────────────────────────────────────┐  │
│  │ Web frontend (renderer)                 │  │
│  │                                         │  │
│  │  Layer stack UI ── Layer UIs (controls) │  │
│  │        │                                │  │
│  │  Graph builder (stack → server graph)   │  │
│  │        │                                │  │
│  │  Interaction layer                      │  │
│  │  (throttle / commit-only /              │  │
│  │   stale-response tracking)              │  │
│  │        │                                │  │
│  │  Preview canvas ── Export               │  │
│  └────────┼────────────────────────────────┘  │
│           │ HTTP (commands) + SSE (progress)  │
│  ┌────────▼────────────────────────────────┐  │
│  │ Server lifecycle manager                │  │
│  │ (spawn, port + token capture, shutdown) │  │
│  └────────┼────────────────────────────────┘  │
└───────────┼───────────────────────────────────┘
            ▼
   Formshift Server subprocess
   (bundled Python runtime; separate repo)
```

In M0 dev mode the lifecycle manager is a human running the server by hand; from M1 the installer
bundles the runtime and the app owns spawn/shutdown.

## Key components

- **Layer stack UI** — the user's model of the pipeline: a linear, reorderable stack of layers.
  A layer is a module instance; the stack is a degenerate case of the server's graph. Every layer
  has an on/off toggle; blend/opacity appear per the structural rule (only layers that preserve
  pixel-coordinate correspondence get them).
- **Graph builder** — translates the stack into the server's graph model (nodes, typed
  connections, payload bindings) and keeps orderings valid across the binarize boundary (raster
  stack → binarize → trace → vector stack; see the design doc's Pipeline architecture).
- **Interaction layer** — every streaming control (slider, drag handle, held stepper) gets a
  throttle/debounce rate, a commit-only option, and stale-response discarding. The third is
  correctness, not polish: throttling only reduces the out-of-order race, tracking eliminates it.
- **Preview canvas** — renders results progressively as module outputs arrive over SSE:
  completion-order for disjoint outputs, pinned-order for outputs that deliberately overlap
  (underbase under ink colors). Two render paths by design.
- **Export** — SVG out; from M2, decoupled preview vs. export resolution and per-color layer
  export.
- **Server lifecycle manager** — spawns the bundled server, captures the port (`--port 0`) and
  bearer token from stdout, authenticates every request, shuts the server down on exit.

## Data / control flow

1. User drops an image; the client uploads it once to a server session and holds the returned
   payload ID. Interactive parameter changes never re-send the source.
2. Every edit (parameter change, reorder, toggle) rebuilds the graph and submits a job referencing
   the payload ID. The server's hash-chain cache makes untouched-upstream work free; the client
   does not implement caching of its own.
3. Progress and results arrive on one multiplexed SSE channel; the interaction layer drops
   anything superseded by a newer request for the same control.
4. Preview renders progressively; export requests the full-resolution result.

## Constraints

- **No processing in the client.** Raster ops, tracing, path ops are server modules, always. A new
  capability is a new module consumed over the protocol, not client code.
- **Speak only the documented contract.** Payloads are binary bodies referenced by ID — never
  base64-in-JSON, never shared filesystem paths (path-passing breaks the moment client and server
  are different machines). Auth token on every request.
- **The binarize boundary is pinned.** The UI may present a freely editable stack, but orderings
  that move color-dependent work below binarize are invalid and must be prevented or discouraged
  (unresolved UX question — see Open risks in the design doc).
- **The interaction triad ships together.** No streaming control lands without throttle,
  commit-only, and stale-response discarding.
- **Packaging is a licensing boundary.** The installer distributes a GPL-2.0 potrace binary;
  source-availability compliance is routine but mandatory, and nothing may link against potrace.
- **Desktop-first.** A browser deployment stays structurally possible (same server, different
  client) but is deliberately unexercised.

## Decisions

The reasoning behind specific choices lives in the [ADR log](../adr/). Start there before changing
anything structural. The UI stack (Electron shell, Fabric.js canvas) is decided —
[ADR 0002](../adr/0002-ui-stack-electron-fabricjs.md).
