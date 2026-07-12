# AGENTS.md

This file is the primary context source for AI agents working in this repository. Read it before
doing anything else, and follow the instructions here. For deeper context on a specific topic,
follow the links in the index at the bottom.

This is the one place that governs how AI agents behave in this repo. The linked docs carry context
and decisions; they deliberately avoid AI-specific directives so there's no second source of truth.

**Before doing any git work** (commits, branches, merges) **read [Git Strategy](docs/git-strategy.md)
in full.** Do not commit, branch, or merge based on assumption or partial recollection of the rules.

---

## Project Overview

Formshift: Vector is a non-destructive raster-to-vector tracing app for print and general design
work: any arbitrary image in, best achievable flat vector-art output, with interactive control over
raster preprocessing, the trace step, and vector post-processing — plus print finishing (spot-color
separation, underbase, trapping) that no general-purpose vectorizer serves.

**This repository is the client only.** Vector is the first client of Formshift Server (a module
execution engine, in its own repository at `dyvoid/formshift-server`) and embeds it as a
subprocess. All processing routes through the server's HTTP API; this app is presentation and
interaction only. Do not implement image or vector processing in the client, and do not add engine
concepts (executor, caching, module internals) here — a new processing capability is a new server
module, consumed from here through the protocol.

The full design — problem, scope, pipeline architecture, interaction model, packaging, milestones,
open risks — lives in [Design](docs/architecture/design.md). Treat it as the source of truth for
this repo's scope and sequencing. (The original two-part proposal that also covered the server is
preserved in git history as `formshift-proposal.md` in the first commit.)

---

## Architecture

A web frontend (canvas-based layer-stack UI) wrapped in a native desktop shell, talking HTTP + SSE
to a Formshift Server process. Vector's linear layer stack is a degenerate case of the server's
graph: the client translates the stack into a graph of module instances and typed connections, and
never computes pixels or paths itself. From M1 the app bundles its own Python runtime and the
server package, spawns the server on launch, captures the port and auth token, and shuts it down on
exit; in M0 dev mode, a manually started server is fine. See
[Architecture Overview](docs/architecture/overview.md) for the full picture, and
[the ADR log](docs/adr/) for the reasoning behind specific decisions.

The UI stack is **Electron** (shell) and **Fabric.js** (canvas interaction) per
[ADR 0002](docs/adr/0002-ui-stack-electron-fabricjs.md). The component framework and bundler are
implementation choices made when M0 app code starts; they don't reopen the ADR.

---

## AI Instructions

### You can do these freely
- Write, edit, and refactor code that follows the patterns already in the codebase
- Create new files consistent with existing conventions
- Update documentation to match code changes
- Add tests for new or existing functionality

### These need human review before they land
- `.gitignore` and `.gitattributes`
- Anything touching the server connection: auth-token handling, port capture, request signing
- Packaging and installer configuration (it distributes a GPL-2.0 potrace binary — a licensing
  boundary, see the Packaging section of [Design](docs/architecture/design.md))
- Shell-level security surface (e.g. Electron preload/IPC, content security policy), once the
  shell exists
- Dependency changes (lockfiles, package manifests)
- Refactors that cut across multiple modules
- CI/CD configuration

### Do not do these
- Commit directly to `main`, except the two cases in [Git Strategy](docs/git-strategy.md#branch-protection)
  (non-functional changes, or explicit user sign-off for this change)
- Delete or rename files without being asked
- Change architecture without recording an ADR in `docs/adr/`
- Add third-party dependencies without explicit instruction
- Implement processing (raster ops, tracing, path ops) client-side — processing is a server
  module, always
- Ship an interactive control without the interaction triad from the Design doc's Preview
  interaction section: per-control throttle/debounce, a commit-only option, and stale-response
  discarding. Throttling reduces the out-of-order race; response tracking eliminates it — the
  third is not optional
- Talk to the server through anything but its documented HTTP + SSE contract (no filesystem
  side-channels, no path-passing, no base64-in-JSON payloads)
- Widen scope past the current milestone's exit condition (see `docs/ROADMAP.md`)

---

## Conventions

### Branching
Short-lived branches only: `task/`, `fix/`, `experiment/`. Details in [Git Strategy](docs/git-strategy.md).

### Commits
One commit per task or prompt session. [Conventional Commits](https://www.conventionalcommits.org).
Put AI context in the body, not the subject:

```
feat(scope): short imperative summary

ai-assisted: <model>
```

### Stack specifics
Shell and canvas library are decided ([ADR 0002](docs/adr/0002-ui-stack-electron-fabricjs.md):
Electron + Fabric.js). The scaffold's implementation choices:

- **Toolchain:** npm (commit `package-lock.json`), [electron-vite](https://electron-vite.org)
  (main/preload/renderer builds), React, TypeScript `strict` everywhere.
- **Lint/format/type-check/test:** ESLint (flat config) + Prettier + `tsc` + Vitest. Match this
  toolchain, don't introduce a competing one. Explicit return types on every function (enforced).
- **Quality gate:** `npm run lint`, `npm run format`, `npm run typecheck`, `npm test`,
  `npm run build` — all green before anything merges; CI runs exactly these.
- **Electron security posture is load-bearing:** `contextIsolation: true`, `sandbox: true`,
  `nodeIntegration: false`, strict CSP in the renderer, window-open denied. Changes here are in
  the human-review list above.

Standing rules that hold regardless:

- Commit lockfiles; never commit dependency directories, build output, or bundled runtimes.
- One toolchain per job: whatever linter/formatter/type-checker the stack ADR picks, match it —
  don't introduce a competing one later.
- The embedded Python runtime and the Formshift Server package are **packaging inputs, not source**:
  they are fetched/bundled at build time and never vendored into this repo.

---

## Document Index

| Document | What it covers |
|---|---|
| [Architecture Overview](docs/architecture/overview.md) | System structure, key components, data flow |
| [Design](docs/architecture/design.md) | Full client design: problem, scope, pipeline, interaction model, packaging, milestones, open risks |
| [ADR Log](docs/adr/) | Architecture decisions and their rationale |
| [Roadmap](docs/ROADMAP.md) | Feature candidates, planned work, and status |
| [Git Strategy](docs/git-strategy.md) | Branching, merging, commit rules |
| [PICKUP](PICKUP.md) | Where the last session left off — active work only, not the backlog |
