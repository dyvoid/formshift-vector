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

M0 ("Trace") is done and M1 is underway: drop a PNG, edit a reorderable raster stack
(crop/rotate/levels/invert) over the pinned binarize + trace tail, watch the pre-processed
source and traced SVG side by side (with a selectable preview backdrop), export the SVG.
Remaining M1 work: A/B compare, packaged installer with server lifecycle management,
interactive crop handles. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for milestone sequencing,
[`docs/architecture/design.md`](docs/architecture/design.md) for the full design, and
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
