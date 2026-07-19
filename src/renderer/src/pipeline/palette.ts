// Explicit-palette hygiene for image.posterize (server ADR 0020): the server
// 422s on duplicate or malformed entries, so everything is normalized and
// deduped client-side before a palette ever reaches a graph.

/** Server-imposed minimum palette size (a 1-entry palette is a flood fill). */
export const PALETTE_MIN = 2

/** Client UI cap; the server allows 256, but 32 keeps the editor manageable. */
export const PALETTE_MAX = 32

/**
 * Normalize a color to lowercase `#rrggbb`. Accepts `#rgb`, `#rrggbb`, and
 * hashless variants; returns undefined for anything else.
 */
export function normalizeHex(input: string): string | undefined {
  const hex = (input.startsWith('#') ? input.slice(1) : input).toLowerCase()
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
  }
  return undefined
}

/**
 * Normalize every entry, drop invalid ones, and dedupe preserving first
 * occurrence — the shape the server accepts.
 */
export function sanitizePalette(entries: readonly string[]): string[] {
  const out: string[] = []
  for (const entry of entries) {
    const hex = normalizeHex(entry)
    if (hex !== undefined && !out.includes(hex)) out.push(hex)
  }
  return out
}

function hslHex(hue: number, lightness: number): string {
  const a = 0.5 * Math.min(lightness, 1 - lightness)
  const channel = (n: number): string => {
    const k = (n + hue / 30) % 12
    const value = lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${channel(0)}${channel(8)}${channel(4)}`
}

/** Deterministic spread of candidate swatches: mid, dark, then light hues,
 *  followed by a grey ramp. Long enough to outlast PALETTE_MAX. */
const SWATCH_CANDIDATES: readonly string[] = [
  ...[0.5, 0.3, 0.7].flatMap((l) => Array.from({ length: 12 }, (_, i) => hslHex(i * 30, l))),
  ...Array.from({ length: 9 }, (_, i) => hslHex(0, i / 8))
]

/**
 * A swatch not already in `existing`, so "add" never silently dedupes into a
 * no-op. Falls back to the first candidate if every one is taken (only
 * reachable above PALETTE_MAX, where adding is already blocked).
 */
export function nextSwatch(existing: readonly string[]): string {
  const taken = new Set(sanitizePalette(existing))
  return SWATCH_CANDIDATES.find((c) => !taken.has(c)) ?? SWATCH_CANDIDATES[0]
}
