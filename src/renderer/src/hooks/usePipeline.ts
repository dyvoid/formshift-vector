// Runs the whole pipeline graph on every change. The server's hash-chain
// cache makes untouched upstream nodes free, so the client never tries to be
// clever about partial re-execution; the LatestGate discards anything a
// newer edit supersedes before it renders.

import { useCallback, useMemo, useRef, useState } from 'react'
import { toPng } from '../image/toPng'
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
  | {
      phase: 'done'
      svg: string
      svgUrl: string
      /** The raster as trace saw it (post pre-processing); absent when the
       *  source went into trace untouched. */
      processedUrl?: string
    }
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
  // Orders overlapping loadImage calls: only the newest drop may become the
  // source, even when an older upload resolves after it.
  const loadSeqRef = useRef(0)
  // The one live object URL for the traced SVG; revoked when superseded so
  // stale results don't pin their blobs in memory.
  const svgUrlRef = useRef<string | undefined>(undefined)
  // Same lifecycle for the pre-processed raster preview.
  const processedUrlRef = useRef<string | undefined>(undefined)

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
          const svg = new TextDecoder().decode(data)
          // The pre-processed raster tap (see buildPipelineGraph); absent when
          // the source went straight into trace.
          const tap = job.outputs?.find((o) => o.port === 'image')
          const processed =
            tap === undefined
              ? undefined
              : await client.downloadPayload(sessionId, tap.payload, signal)
          return { svg, processed }
        })
        .then((result) => {
          if (result === undefined) return
          const { svg, processed } = result
          const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
          if (svgUrlRef.current !== undefined) URL.revokeObjectURL(svgUrlRef.current)
          svgUrlRef.current = svgUrl
          // Payload types are Formshift tags ("raster/png"), not MIME types.
          const processedUrl =
            processed === undefined
              ? undefined
              : URL.createObjectURL(new Blob([processed.data], { type: 'image/png' }))
          if (processedUrlRef.current !== undefined) URL.revokeObjectURL(processedUrlRef.current)
          processedUrlRef.current = processedUrl
          setState({ phase: 'done', svg, svgUrl, processedUrl })
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
      loadSeqRef.current += 1
      const seq = loadSeqRef.current
      gate.abort('pipeline')
      setState({ phase: 'running' })
      try {
        // Any decodable image is accepted; the upload is always PNG.
        const png = await toPng(file)
        if (seq !== loadSeqRef.current) return
        const payloadId = await client.uploadPayload(sessionId, 'raster/png', png)
        if (seq !== loadSeqRef.current) return
        payloadRef.current = payloadId
        setSource((previous) => {
          if (previous !== undefined) URL.revokeObjectURL(previous.previewUrl)
          return { name: file.name, payloadId, previewUrl: URL.createObjectURL(file) }
        })
        execute(payloadId, pipeline)
      } catch (error) {
        if (seq !== loadSeqRef.current) return
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
