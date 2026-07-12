# ADR 0002: UI stack — Electron shell, Fabric.js canvas

- **Status:** Proposed
- **Date:** 2026-07-12

## Context

The design doc left two load-bearing choices open: the native shell (Electron vs. an alternative
like Tauri) and the canvas interaction library (Fabric.js vs. Konva). Everything in M0+ app code
accretes around both, so they must be decided first (see the Packaging and tech stack section of
[Design](../architecture/design.md)).

What the choices must serve, from the M0–M2 feature list:
- Pixel-accurate raster preview with a pixel-level diff overlay (M2's IoU/recovery metrics are a
  first-class UI element) — rendering differences between platforms are product bugs here, not
  cosmetic quirks.
- Interactive transform handles (M1 crop/rotate), drag-to-reorder layer stack, live parametric
  controls.
- Rendering server-produced SVG, eventually as per-color layers arriving progressively (M2) and a
  manipulable vector post-stack view (M4).
- Embedding the Formshift Server: a bundled Python runtime, spawned as a subprocess, port/token
  captured — and from M3, the server itself spawns per-extension isolated venvs, so the Python
  environment must be a real, relocatable environment, not a frozen single binary.

Evidence gathered (mid-2026):
- Tauri renders through each OS's webview (WebView2 / WKWebView / WebKitGTK), which do not
  implement web standards identically; canvas work is a known sore point (Figma has cited
  WebKit-specific canvas differences as disqualifying; WebKitGTK lags on Linux). Electron ships
  one Chromium everywhere. ([DoltHub comparison](https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/),
  [Tauri docs](https://v2.tauri.app/develop/sidecar/))
- Tauri's sidecar mechanism is built around single external binaries (the documented Python
  pattern is PyInstaller-frozen apps). A frozen single binary conflicts with the server's
  uv-managed package and M3's per-extension venv creation.
- The two apps the design doc already cites as precedent for embedded Python both chose Electron:
  ComfyUI Desktop (Electron + Vue, Python environment provisioned by `uv`, minimal bootstrap
  Python shipped in the installer) and chaiNNer (Electron, downloads an isolated Python build on
  first start). ([Comfy-Desktop](https://github.com/Comfy-Org/Comfy-Desktop))
- Fabric.js parses SVG into first-class canvas objects and serializes back to SVG; Konva does not.
  Fabric ships interactive transform controls (move/scale/rotate handles) by default; Konva
  provides a Transformer but leaves more assembly to the app. Konva's advantage is raw rendering
  performance with very large node counts. Current comparisons consistently slot Fabric for design
  editors and Konva for high-throughput interactive UIs.
  ([PkgPulse comparison](https://www.pkgpulse.com/guides/fabricjs-vs-konva-vs-pixijs-canvas-2d-graphics-2026),
  [Konva's own guide](https://konvajs.org/docs/guides/best-canvas-library.html))
- Fabric.js is actively maintained (v7.4.0, May 2026; TypeScript-native since v6).

## Decision

**Electron** for the shell, **Fabric.js** for canvas interaction.

Electron because rendering consistency is load-bearing for this product (one Chromium, identical
canvas semantics on all three platforms) and because the embedded-runtime pattern Vector needs —
a real, relocatable, uv-managed Python environment spawned as a subprocess — is exactly what the
two closest precedent apps do on Electron, while Tauri's sidecar model is shaped for frozen
single-binary payloads. Tauri's genuine advantages (installer size, idle memory) are mostly eroded
here: the bundled Python runtime dominates the footprint either way.

Fabric.js because SVG-as-objects is the core of this app's output side: trace results can be
rendered, layered, and later manipulated on the same canvas as the raster preview, and M1's
crop/rotate handles come built in. Konva's performance edge targets a workload (thousands of
independently animated nodes) Vector doesn't have.

Left open deliberately: the component framework (React/Vue/Svelte) and bundler are implementation
choices to make when M0 app code starts; neither changes the two decisions above. Fabric is
framework-agnostic.

## Consequences

- One rendering engine across platforms; pixel-level features (diff overlay, A/B compare) are
  testable once, not per-OS.
- Electron's known costs accepted: larger installer and memory footprint, Chromium security
  update cadence to track, and shell-level security surface (preload/IPC, CSP) that AGENTS.md
  already flags for human review.
- The embedded-server lifecycle (spawn, `--port 0`, token capture from stdout) follows a
  well-trodden Electron pattern; M3's extension venvs need no packaging rework.
- Very heavy SVGs (a multi-thousand-path 16-color trace) may be slow as individual Fabric
  objects. Mitigation is already in the design: preview can render the server's SVG rasterized as
  a single image and parse into objects only where interaction needs it. If M2's progressive
  16-color exit condition surfaces a real bottleneck, revisit the canvas layer then — behind the
  same stack UI, this is an internal swap, not a contract break.
- Choosing the incumbent (Electron) trades novelty for boring reliability; if Tauri's webview
  story converges later, migration cost is real but confined to the shell layer, since all
  processing already lives across an HTTP boundary.
