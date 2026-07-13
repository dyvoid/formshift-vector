// Orchestrates the M0 trace loop: upload once, then every parameter change
// submits a single-node potrace job referencing the stored payload ID. The
// server's hash-chain cache makes repeated parameter values free; the
// LatestGate discards anything superseded before it renders.

import { useCallback, useMemo, useRef, useState } from 'react'
import { LatestGate } from '../interaction/latest'
import { FormshiftClient } from '../server/client'
import type { ConnectionInfo, Graph } from '../server/types'

export interface TraceParams {
  blacklevel: number
  turdsize: number
}

export const DEFAULT_TRACE_PARAMS: TraceParams = { blacklevel: 0.5, turdsize: 2 }

export interface SourceImage {
  name: string
  payloadId: string
  /** Object URL for previewing the dropped raster. */
  previewUrl: string
}

export type TraceState =
  | { phase: 'idle' }
  | { phase: 'tracing' }
  | { phase: 'done'; svg: string }
  | { phase: 'error'; message: string }

interface UseTrace {
  source: SourceImage | undefined
  state: TraceState
  loadImage(file: File): Promise<void>
  trace(params: TraceParams): void
}

function buildTraceGraph(payloadId: string, params: TraceParams): Graph {
  return {
    nodes: [{ id: 'trace', module: 'potrace.trace', params: { ...params } }],
    bindings: [{ payload: payloadId, node: 'trace', port: 'image' }],
    outputs: [{ node: 'trace', port: 'svg' }]
  }
}

export function useTrace(conn: ConnectionInfo, sessionId: string): UseTrace {
  const client = useMemo(() => new FormshiftClient(conn), [conn])
  const gate = useMemo(() => new LatestGate(), [])
  const [source, setSource] = useState<SourceImage>()
  const [state, setState] = useState<TraceState>({ phase: 'idle' })
  // Kept in a ref so trace() closures never capture a stale payload ID.
  const payloadRef = useRef<string | undefined>(undefined)

  const runTrace = useCallback(
    (payloadId: string, params: TraceParams): void => {
      setState((previous) => (previous.phase === 'done' ? previous : { phase: 'tracing' }))
      void gate
        .run('trace', async (signal) => {
          const jobId = await client.submitJob(sessionId, buildTraceGraph(payloadId, params), {
            signal
          })
          const job = await client.waitForJob(sessionId, jobId, { signal })
          if (job.status !== 'completed') {
            throw new Error(job.error ?? `job ${job.status}`)
          }
          const output = job.outputs?.find((o) => o.node === 'trace' && o.port === 'svg')
          if (output === undefined) throw new Error('job completed without an svg output')
          const { data } = await client.downloadPayload(sessionId, output.payload, signal)
          return new TextDecoder().decode(data)
        })
        .then((svg) => {
          if (svg !== undefined) setState({ phase: 'done', svg })
        })
        .catch((error: unknown) => {
          setState({
            phase: 'error',
            message: error instanceof Error ? error.message : String(error)
          })
        })
    },
    [client, gate, sessionId]
  )

  const loadImage = useCallback(
    async (file: File): Promise<void> => {
      gate.abort('trace')
      setState({ phase: 'tracing' })
      try {
        const payloadId = await client.uploadPayload(sessionId, 'raster/png', file)
        payloadRef.current = payloadId
        setSource((previous) => {
          if (previous !== undefined) URL.revokeObjectURL(previous.previewUrl)
          return { name: file.name, payloadId, previewUrl: URL.createObjectURL(file) }
        })
        runTrace(payloadId, DEFAULT_TRACE_PARAMS)
      } catch (error) {
        setState({
          phase: 'error',
          message: error instanceof Error ? error.message : String(error)
        })
      }
    },
    [client, gate, runTrace, sessionId]
  )

  const trace = useCallback(
    (params: TraceParams): void => {
      const payloadId = payloadRef.current
      if (payloadId !== undefined) runTrace(payloadId, params)
    },
    [runTrace]
  )

  return { source, state, loadImage, trace }
}
