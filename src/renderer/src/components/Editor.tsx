import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { usePipeline } from '../hooks/usePipeline'
import { createControlStream } from '../interaction/throttle'
import type { Pipeline } from '../pipeline/model'
import { DEFAULT_PIPELINE } from '../pipeline/model'
import type { ConnectionInfo } from '../server/types'
import type { ChangePhase } from './LayerStack'
import { LayerStack } from './LayerStack'
import { DropZone } from './DropZone'
import type { PreviewBackdrop } from './SvgPreview'
import { SvgPreview } from './SvgPreview'

interface Props {
  conn: ConnectionInfo
  sessionId: string
  /** Color-trace modules the server lacks; disables Posterize in the stack. */
  missingModules?: readonly string[]
}

function exportSvg(sourceName: string, svg: string): void {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${sourceName.replace(/\.[^.]+$/, '')}.svg`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function Editor({ conn, sessionId, missingModules }: Props): JSX.Element {
  const { source, state, loadImage, run } = usePipeline(conn, sessionId)
  const [pipeline, setPipeline] = useState<Pipeline>(DEFAULT_PIPELINE)
  const [rateMs, setRateMs] = useState(100)
  const [commitOnly, setCommitOnly] = useState(false)
  const [draft, setDraft] = useState(false)
  const [previewBg, setPreviewBg] = useState<PreviewBackdrop>('checker')
  // Palette eyedropper is open: the source figure shows the original raster
  // so the user can pick colors pre-processing dropped.
  const [picking, setPicking] = useState(false)

  const stream = useMemo(
    () => createControlStream<Pipeline>((next) => run(next, { draft }), { rateMs, commitOnly }),
    [run, rateMs, commitOnly, draft]
  )
  useEffect(() => () => stream.dispose(), [stream])

  function change(next: Pipeline, phase: ChangePhase): void {
    setPipeline(next)
    // Structural edits (add/remove/reorder/toggle) arrive as commits and are
    // never dropped; only streamed slider values pass through the throttle.
    if (phase === 'input') stream.input(next)
    else stream.commit(next)
  }

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
        <DropZone onFile={(file) => void loadImage(file, pipeline, { draft })} />
      ) : (
        <div className="workspace">
          <aside>
            <LayerStack
              pipeline={pipeline}
              missingModules={missingModules}
              proposedPalette={state.phase === 'done' ? state.palette : undefined}
              onPickingChange={setPicking}
              onChange={change}
            />
            <div className="stream-settings">
              <label>
                Throttle (ms)
                <input
                  type="number"
                  min={0}
                  max={2000}
                  step={50}
                  value={rateMs}
                  onChange={(event) =>
                    setRateMs(Math.min(2000, Math.max(0, Number(event.target.value))))
                  }
                />
              </label>
              <label className="inline">
                <input
                  type="checkbox"
                  checked={commitOnly}
                  onChange={(event) => setCommitOnly(event.target.checked)}
                />
                Update on release only
              </label>
              <label className="inline">
                <input
                  type="checkbox"
                  checked={draft}
                  onChange={(event) => {
                    const next = event.target.checked
                    setDraft(next)
                    // Re-run immediately at the new quality; the memoized
                    // stream still closes over the old draft value this render.
                    run(pipeline, { draft: next })
                  }}
                />
                Draft quality
              </label>
            </div>
            <DropZone compact onFile={(file) => void loadImage(file, pipeline, { draft })} />
          </aside>
          <SvgPreview
            source={source}
            state={state}
            previewBg={previewBg}
            showOriginal={picking}
            onPreviewBgChange={setPreviewBg}
          />
        </div>
      )}
    </div>
  )
}
