// Ambient declaration for the EyeDropper API (Chromium-only; present in
// Electron's renderer). TS ships no lib types for it yet.

interface EyeDropperResult {
  sRGBHex: string
}

interface EyeDropper {
  open(options?: { signal?: AbortSignal }): Promise<EyeDropperResult>
}

interface Window {
  EyeDropper?: new () => EyeDropper
}
