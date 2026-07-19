// The posterize palette editor (server ADR 0020). Auto mode shows a palette
// proposal — the user's remembered custom palette if there is one, otherwise
// the one the last run discovered — with a one-click switch into custom mode,
// where the palette posterize maps to is edited directly.
//
// Custom mode is a remembered toggle, not a one-way door: switching back to
// auto keeps the edited palette so the user can return to it (the same
// remembered-while-off pattern as the other quantize params).
//
// Pinning is implicit: every entry in a custom palette is pinned by
// definition — nearest-color mapping cannot drop it.

import type { JSX } from 'react'
import type { QuantizeSettings } from '../pipeline/model'
import {
  PALETTE_MAX,
  PALETTE_MIN,
  nextSwatch,
  normalizeHex,
  sanitizePalette
} from '../pipeline/palette'
import type { ChangePhase } from './LayerStack'

interface Props {
  quantize: QuantizeSettings
  /** Palette the last completed run used; the auto-mode proposal. */
  proposedPalette?: readonly string[]
  /** Raised while the eyedropper is open, so the source preview can show the
   *  original raster — the pre-processed one has already lost the colors the
   *  user is trying to pin. */
  onPickingChange?(active: boolean): void
  onQuantize(next: QuantizeSettings, phase: ChangePhase): void
}

/** Keep `colors` meaningful when leaving custom mode: auto resumes at the
 *  size the user actually ended up working with. */
function clampColors(count: number): number {
  return Math.min(PALETTE_MAX, Math.max(PALETTE_MIN, count))
}

export function PaletteEditor({
  quantize,
  proposedPalette,
  onPickingChange,
  onQuantize
}: Props): JSX.Element {
  const palette = quantize.palette

  function commitPalette(entries: string[], phase: ChangePhase): void {
    // Sanitize only on commit so a color drag can pass through a value that
    // momentarily duplicates another swatch without it vanishing mid-edit.
    const next = phase === 'commit' ? sanitizePalette(entries) : entries
    if (phase === 'commit' && next.length < PALETTE_MIN) return
    onQuantize({ ...quantize, palette: next }, phase)
  }

  async function pickFromScreen(): Promise<void> {
    if (palette === undefined || window.EyeDropper === undefined) return
    onPickingChange?.(true)
    try {
      // Let the preview repaint the original raster before the screen is
      // sampled — the eyedropper reads pixels as they are on screen.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const { sRGBHex } = await new window.EyeDropper().open()
      const hex = normalizeHex(sRGBHex)
      if (hex !== undefined) commitPalette([...palette, hex], 'commit')
    } catch {
      // The user pressed Esc — a cancel, not an error.
    } finally {
      onPickingChange?.(false)
    }
  }

  if (!quantize.useCustomPalette) {
    // Auto mode: the remembered custom palette if there is one, else the last
    // run's discovered palette, shown read-only as a proposal.
    const proposal = palette ?? proposedPalette
    if (proposal === undefined || proposal.length < PALETTE_MIN) return <></>
    return (
      <div className="palette-editor">
        <div className="swatch-row">
          {proposal.map((fill, i) => (
            <span key={i} className="swatch" style={{ background: fill }} title={fill} />
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            onQuantize(
              {
                ...quantize,
                useCustomPalette: true,
                palette: sanitizePalette(proposal).slice(0, PALETTE_MAX)
              },
              'commit'
            )
          }
        >
          {palette !== undefined ? 'Use custom palette' : 'Customize palette'}
        </button>
      </div>
    )
  }

  const entries = palette ?? []
  const atCap = entries.length >= PALETTE_MAX

  return (
    <div className="palette-editor">
      <div className="swatch-row">
        {entries.map((fill, i) => (
          <span key={i} className="swatch editable">
            <input
              type="color"
              value={fill}
              title={fill}
              onChange={(event) =>
                commitPalette(
                  entries.map((c, j) => (j === i ? event.target.value : c)),
                  'input'
                )
              }
              onBlur={() => commitPalette(entries, 'commit')}
            />
            <button
              type="button"
              aria-label={`Remove color ${fill}`}
              disabled={entries.length <= PALETTE_MIN}
              onClick={() =>
                commitPalette(
                  entries.filter((_, j) => j !== i),
                  'commit'
                )
              }
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className="palette-actions">
        <button
          type="button"
          disabled={atCap}
          onClick={() => commitPalette([...entries, nextSwatch(entries)], 'commit')}
        >
          + Add
        </button>
        {window.EyeDropper !== undefined && (
          <button type="button" disabled={atCap} onClick={() => void pickFromScreen()}>
            Pick from image
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            onQuantize(
              { ...quantize, useCustomPalette: false, colors: clampColors(entries.length) },
              'commit'
            )
          }
        >
          Use auto palette
        </button>
      </div>
      <span className="palette-note">
        {entries.length} color{entries.length === 1 ? '' : 's'}
        {atCap ? ` — ${PALETTE_MAX} max` : ''}
      </span>
    </div>
  )
}
