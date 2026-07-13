import type { JSX } from 'react'
import { useTrace } from '../hooks/useTrace'
import type { ConnectionInfo } from '../server/types'
import { DropZone } from './DropZone'
import { SvgPreview } from './SvgPreview'
import { TraceControls } from './TraceControls'

interface Props {
  conn: ConnectionInfo
  sessionId: string
}

function exportSvg(sourceName: string, svg: string): void {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${sourceName.replace(/\.png$/i, '')}.svg`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function Editor({ conn, sessionId }: Props): JSX.Element {
  const { source, state, loadImage, trace } = useTrace(conn, sessionId)

  return (
    <div className="editor">
      <header>
        <span className="brand">Formshift: Vector</span>
        {source !== undefined && <span className="source-name">{source.name}</span>}
        <button
          type="button"
          disabled={state.phase !== 'done' || source === undefined}
          onClick={() => {
            if (state.phase === 'done' && source !== undefined) exportSvg(source.name, state.svg)
          }}
        >
          Export SVG
        </button>
      </header>

      {source === undefined ? (
        <DropZone onFile={(file) => void loadImage(file)} />
      ) : (
        <div className="workspace">
          <aside>
            <TraceControls disabled={false} onTrace={trace} />
            <DropZone compact onFile={(file) => void loadImage(file)} />
          </aside>
          <SvgPreview source={source} state={state} />
        </div>
      )}
    </div>
  )
}
