// The posterize palette editor (server ADR 0020). Auto mode shows the
// palette the last run discovered, with a one-click handoff into explicit
// mode; explicit mode edits the palette that posterize maps to directly.
// Pinning is implicit: every entry in an explicit palette is pinned by
// definition — nearest-color mapping cannot drop it.

import type { JSX } from 'react'
import type { QuantizeSettings } from '../pipeline/model'
import { PALETTE_MAX, PALETTE_MIN, normalizeHex, sanitizePalette } from '../pipeline/palette'
import type { ChangePhase } from './LayerStack'

interface Props {
  quantize: QuantizeSettings
  /** Palette the last completed run used; shown as the auto-mode proposal. */
  proposedPalette?: readonly string[]
  onQuantize(next: QuantizeSettings, phase: ChangePhase): void
}

export function PaletteEditor({ quantize, proposedPalette, onQuantize }: Props): JSX.Element {
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
    try {
      const { sRGBHex } = await new window.EyeDropper().open()
      const hex = normalizeHex(sRGBHex)
      if (hex !== undefined) commitPalette([...palette, hex], 'commit')
    } catch {
      // The user pressed Esc — a cancel, not an error.
    }
  }

  if (palette === undefined) {
    // Auto mode: read-only proposal from the last run, if any.
    if (proposedPalette === undefined || proposedPalette.length < PALETTE_MIN) return <></>
    return (
      <div className="palette-editor">
        <div className="swatch-row">
          {proposedPalette.map((fill, i) => (
            <span key={i} className="swatch" style={{ background: fill }} title={fill} />
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            onQuantize(
              { ...quantize, palette: sanitizePalette(proposedPalette).slice(0, PALETTE_MAX) },
              'commit'
            )
          }
        >
          Customize palette
        </button>
      </div>
    )
  }

  return (
    <div className="palette-editor">
      <div className="swatch-row">
        {palette.map((fill, i) => (
          <span key={i} className="swatch editable">
            <input
              type="color"
              value={fill}
              title={fill}
              onChange={(event) =>
                commitPalette(
                  palette.map((c, j) => (j === i ? event.target.value : c)),
                  'input'
                )
              }
              onBlur={() => commitPalette(palette, 'commit')}
            />
            <button
              type="button"
              aria-label={`Remove color ${fill}`}
              disabled={palette.length <= PALETTE_MIN}
              onClick={() =>
                commitPalette(
                  palette.filter((_, j) => j !== i),
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
          disabled={palette.length >= PALETTE_MAX}
          onClick={() => commitPalette([...palette, '#808080'], 'commit')}
        >
          + Add
        </button>
        {window.EyeDropper !== undefined && (
          <button
            type="button"
            disabled={palette.length >= PALETTE_MAX}
            onClick={() => void pickFromScreen()}
          >
            Pick from image
          </button>
        )}
        <button
          type="button"
          onClick={() => onQuantize({ ...quantize, palette: undefined }, 'commit')}
        >
          Reset to auto
        </button>
      </div>
    </div>
  )
}
