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
