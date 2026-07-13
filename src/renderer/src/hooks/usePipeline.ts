// Runs the whole pipeline graph on every change. The server's hash-chain
// cache makes untouched upstream nodes free, so the client never tries to be
// clever about partial re-execution; the LatestGate discards anything a
// newer edit supersedes before it renders.

import { useCallback, useMemo, useRef, useState } from 'react'
import { LatestGate } from '../interaction/latest'
import { buildPipelineGraph } from '../pipeline/graph'
import type { Pipeline } from '../pipeline/model'
import { FormshiftClient } from '../server/client'
import type { ConnectionInfo } from '../server/types'

export interface SourceImage {
  name: string
  payloadId: string
  /** Object URL for previewing the dropped raster. */
  previewUrl: string
}

export type PipelineState =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'done'; svg: string }
  | { phase: 'error'; message: string }

interface UsePipeline {
  source: SourceImage | undefined
  state: PipelineState
  /** Upload a new source and run `pipeline` against it. */
  loadImage(file: File, pipeline: Pipeline): Promise<void>
  /** Run the current source through `pipeline`; no-op before a source exists. */
  run(pipeline: Pipeline): void
}

export function usePipeline(conn: ConnectionInfo, sessionId: string): UsePipeline {
  const client = useMemo(() => new FormshiftClient(conn), [conn])
  const gate = useMemo(() => new LatestGate(), [])
  const [source, setSource] = useState<SourceImage>()
  const [state, setState] = useState<PipelineState>({ phase: 'idle' })
  // Ref, not state: run() closures must always see the current payload.
  const payloadRef = useRef<string | undefined>(undefined)

  const execute = useCallback(
    (payloadId: string, pipeline: Pipeline): void => {
      // Keep the previous result visible while re-running; only show the
      // busy placeholder when there is nothing to show yet.
      setState((previous) => (previous.phase === 'done' ? previous : { phase: 'running' }))
      void gate
        .run('pipeline', async (signal) => {
          const graph = buildPipelineGraph(payloadId, pipeline)
          const jobId = await client.submitJob(sessionId, graph, { signal })
          const job = await client.waitForJob(sessionId, jobId, { signal })
          if (job.status !== 'completed') throw new Error(job.error ?? `job ${job.status}`)
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
    async (file: File, pipeline: Pipeline): Promise<void> => {
      gate.abort('pipeline')
      setState({ phase: 'running' })
      try {
        const payloadId = await client.uploadPayload(sessionId, 'raster/png', file)
        payloadRef.current = payloadId
        setSource((previous) => {
          if (previous !== undefined) URL.revokeObjectURL(previous.previewUrl)
          return { name: file.name, payloadId, previewUrl: URL.createObjectURL(file) }
        })
        execute(payloadId, pipeline)
      } catch (error) {
        setState({
          phase: 'error',
          message: error instanceof Error ? error.message : String(error)
        })
      }
    },
    [client, execute, gate, sessionId]
  )

  const run = useCallback(
    (pipeline: Pipeline): void => {
      const payloadId = payloadRef.current
      if (payloadId !== undefined) execute(payloadId, pipeline)
    },
    [execute]
  )

  return { source, state, loadImage, run }
}
