# Formshift: Vector

A non-destructive raster-to-vector tracing app for print and general design work: any image in,
the best achievable flat vector-art output, with interactive control over raster preprocessing,
the trace step, and vector post-processing — plus the print finishing (spot-color separation,
underbase, trapping) that no general-purpose vectorizer serves.

This repository is the client only. Vector is the first client of
[Formshift Server](https://github.com/dyvoid/formshift-server), a standalone module execution
engine in its own repository; Vector embeds it as a subprocess and routes all processing through
its HTTP API. The client is presentation and interaction only.

## Status

Pre-M0: repository scaffolded, no app code yet. The server side is ahead — its M0–M2 slices
(HTTP API with token auth, DAG executor with hash-chain caching, potrace tracing, core raster
modules, parallel multi-color separation, progressive streaming) are done in the server repo, so
the Vector slices are unblocked through M2. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for milestone
sequencing and [`docs/architecture/design.md`](docs/architecture/design.md) for the full design.

First target (M0, "Trace"): drop an image in, trace it with potrace, adjust live parameters,
export the SVG.

## Getting Started

Nothing to run yet. The UI stack (native shell + canvas library) is deliberately undecided and is
the first ADR of M0 app code; build/run instructions land here with it.

For development against the engine meanwhile, run the server from its own repo:

```
# in ../formshift-server
uv sync
uv run formshift-server --port 0
# prints: formshift-server listening on http://127.0.0.1:<port>
#         token: <bearer token>
```

## Project Structure

```
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
