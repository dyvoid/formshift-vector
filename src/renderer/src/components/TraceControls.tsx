// The M0 control panel. Streaming controls (the sliders) route through one
// ControlStream so throttle rate and commit-only behave per the design doc;
// the rate and commit-only settings themselves are discrete controls with
// nothing to throttle.

import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { createControlStream } from '../interaction/throttle'
import type { TraceParams } from '../hooks/useTrace'
import { DEFAULT_TRACE_PARAMS } from '../hooks/useTrace'

interface Props {
  disabled: boolean
  /** Must be referentially stable (useCallback) — a new identity rebuilds the stream. */
  onTrace(params: TraceParams): void
}

export function TraceControls({ disabled, onTrace }: Props): JSX.Element {
  const [params, setParams] = useState<TraceParams>(DEFAULT_TRACE_PARAMS)
  const [rateMs, setRateMs] = useState(100)
  const [commitOnly, setCommitOnly] = useState(false)

  const stream = useMemo(
    () => createControlStream<TraceParams>(onTrace, { rateMs, commitOnly }),
    [onTrace, rateMs, commitOnly]
  )
  useEffect(() => () => stream.dispose(), [stream])

  function update(partial: Partial<TraceParams>, phase: 'input' | 'commit'): void {
    setParams((previous) => {
      const next = { ...previous, ...partial }
      if (phase === 'input') stream.input(next)
      else stream.commit(next)
      return next
    })
  }

  return (
    <fieldset className="trace-controls" disabled={disabled}>
      <legend>Trace</legend>

      <label>
        Detail recovery (blacklevel): {params.blacklevel.toFixed(2)}
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={params.blacklevel}
          onChange={(event) => update({ blacklevel: Number(event.target.value) }, 'input')}
          onPointerUp={() => stream.commit(params)}
          onKeyUp={() => stream.commit(params)}
        />
      </label>

      <label>
        Speckle removal (turdsize): {params.turdsize}px
        <input
          type="range"
          min={0}
          max={20}
          step={1}
          value={params.turdsize}
          onChange={(event) => update({ turdsize: Number(event.target.value) }, 'input')}
          onPointerUp={() => stream.commit(params)}
          onKeyUp={() => stream.commit(params)}
        />
      </label>

      <div className="stream-settings">
        <label>
          Throttle (ms)
          <input
            type="number"
            min={0}
            max={2000}
            step={50}
            value={rateMs}
            onChange={(event) => setRateMs(Math.max(0, Number(event.target.value)))}
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
      </div>
    </fieldset>
  )
}
