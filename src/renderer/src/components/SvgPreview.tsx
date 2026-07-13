// Renders the traced SVG next to the source raster. The SVG arrives as a
// Blob object URL (owned by usePipeline) into an <img>, which is inert by
// construction (no script execution) — safer than injecting server-produced
// markup into the DOM.

import type { JSX } from 'react'
import type { PipelineState, SourceImage } from '../hooks/usePipeline'

interface Props {
  source: SourceImage
  state: PipelineState
}

export function SvgPreview({ source, state }: Props): JSX.Element {
  const svgUrl = state.phase === 'done' ? state.svgUrl : undefined

  return (
    <div className="preview">
      <figure>
        <img src={source.previewUrl} alt={`Source: ${source.name}`} />
        <figcaption>Source</figcaption>
      </figure>
      <figure className={state.phase === 'running' ? 'busy' : ''}>
        {svgUrl !== undefined ? (
          <img src={svgUrl} alt="Traced SVG" />
        ) : (
          <div className="placeholder">
            {state.phase === 'error' ? `Trace failed: ${state.message}` : 'Tracing…'}
          </div>
        )}
        <figcaption>Trace</figcaption>
      </figure>
    </div>
  )
}
