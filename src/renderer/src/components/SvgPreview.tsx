// Renders the traced SVG next to the source raster. The SVG arrives as a
// Blob object URL (owned by usePipeline) into an <img>, which is inert by
// construction (no script execution) — safer than injecting server-produced
// markup into the DOM.

import type { JSX } from 'react'
import type { PipelineState, SourceImage } from '../hooks/usePipeline'

export type PreviewBackdrop = 'checker' | 'black' | 'white' | 'transparent'

const BACKDROPS: readonly PreviewBackdrop[] = ['checker', 'black', 'white', 'transparent']

const BACKDROP_LABEL: Record<PreviewBackdrop, string> = {
  checker: 'Default',
  black: 'Black',
  white: 'White',
  transparent: 'Transparent'
}

interface Props {
  source: SourceImage
  state: PipelineState
  previewBg: PreviewBackdrop
  /** Force the original raster into the source figure — the palette
   *  eyedropper samples the screen, and the pre-processed raster has already
   *  lost the colors the user is trying to pin. */
  showOriginal?: boolean
  onPreviewBgChange(next: PreviewBackdrop): void
}

export function SvgPreview({
  source,
  state,
  previewBg,
  showOriginal = false,
  onPreviewBgChange
}: Props): JSX.Element {
  const svgUrl = state.phase === 'done' ? state.svgUrl : undefined
  // Show the raster as trace saw it (post pre-processing); the raw drop is
  // the fallback until a result arrives or when the stack is empty.
  const processedUrl = showOriginal || state.phase !== 'done' ? undefined : state.processedUrl
  // Per-color layers streaming in during a posterize run; stacked unordered
  // (completion order) because the color masks are disjoint. The merged SVG
  // replaces the stack on done.
  const colorLayers = state.phase === 'running' ? (state.colorLayers ?? []) : []

  return (
    <div className="preview">
      <figure>
        <img src={processedUrl ?? source.previewUrl} alt={`Source: ${source.name}`} />
        <figcaption>
          {showOriginal
            ? 'Source (original — pick a color)'
            : processedUrl !== undefined
              ? 'Source (pre-processed)'
              : 'Source'}
        </figcaption>
      </figure>
      <div className="trace-column">
        <div className="backdrop-picker" role="group" aria-label="Trace preview background">
          {BACKDROPS.map((opt) => (
            <button
              key={opt}
              type="button"
              className={previewBg === opt ? 'active' : ''}
              onClick={() => onPreviewBgChange(opt)}
            >
              {BACKDROP_LABEL[opt]}
            </button>
          ))}
        </div>
        <figure className={`bg-${previewBg}${state.phase === 'running' ? ' busy' : ''}`}>
          {svgUrl !== undefined ? (
            <img src={svgUrl} alt="Traced SVG" />
          ) : colorLayers.length > 0 ? (
            <div className="color-progress" aria-label="Color layers arriving">
              {colorLayers.map((layer) => (
                <img key={layer.node} src={layer.url} alt="" />
              ))}
            </div>
          ) : (
            <div className="placeholder">
              {state.phase === 'error' ? `Trace failed: ${state.message}` : 'Tracing…'}
            </div>
          )}
          <figcaption>Trace</figcaption>
        </figure>
      </div>
    </div>
  )
}
