// Renders the traced SVG next to the source raster. The SVG goes through a
// Blob object URL into an <img>, which is inert by construction (no script
// execution) — safer than injecting server-produced markup into the DOM.

import { useEffect, useMemo } from 'react'
import type { JSX } from 'react'
import type { PipelineState, SourceImage } from '../hooks/usePipeline'

interface Props {
  source: SourceImage
  state: PipelineState
}

export function SvgPreview({ source, state }: Props): JSX.Element {
  const svgUrl = useMemo(() => {
    if (state.phase !== 'done') return undefined
    return URL.createObjectURL(new Blob([state.svg], { type: 'image/svg+xml' }))
  }, [state])
  useEffect(
    () => () => {
      if (svgUrl !== undefined) URL.revokeObjectURL(svgUrl)
    },
    [svgUrl]
  )

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
