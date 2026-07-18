// Runs the whole pipeline graph on every change. The server's hash-chain
// cache makes untouched upstream nodes free, so the client never tries to be
// clever about partial re-execution; the LatestGate discards anything a
// newer edit supersedes before it renders.

import { useCallback, useMemo, useRef, useState } from 'react'
import { readPngPalette } from '../image/pngPalette'
import { toPng } from '../image/toPng'
import { LatestGate } from '../interaction/latest'
import { buildColorTraceGraph, buildPipelineGraph, buildPosterizeGraph } from '../pipeline/graph'
import type { Pipeline } from '../pipeline/model'
import { FormshiftClient } from '../server/client'
import { parseSseStream } from '../server/sse'
import type {
  ConnectionInfo,
  Graph,
  JobFailedEvent,
  JobOutput,
  JobOutputEvent
} from '../server/types'

export interface SourceImage {
  name: string
  payloadId: string
  /** Object URL for previewing the dropped raster. */
  previewUrl: string
}

/** One per-color trace result, streamed in while a posterize run executes. */
export interface ColorLayer {
  node: string
  url: string
}

export type PipelineState =
  | { phase: 'idle' }
  | {
      phase: 'running'
      /** Per-color layers arriving over SSE, in completion order — safe to
       *  stack unordered because the color masks are disjoint. */
      colorLayers?: ColorLayer[]
    }
  | {
      phase: 'done'
      svg: string
      svgUrl: string
      /** The raster as trace saw it (post pre-processing); absent when the
       *  source went into trace untouched. */
      processedUrl?: string
    }
  | { phase: 'error'; message: string }

export interface RunOptions {
  /** Ask the server for draft quality (downsampled at the pipeline boundary). */
  draft?: boolean
}

interface UsePipeline {
  source: SourceImage | undefined
  state: PipelineState
  /** Upload a new source and run `pipeline` against it. */
  loadImage(file: File, pipeline: Pipeline, options?: RunOptions): Promise<void>
  /** Run the current source through `pipeline`; no-op before a source exists. */
  run(pipeline: Pipeline, options?: RunOptions): void
}

interface RunResult {
  svg: string
  /** PNG bytes of the raster as trace saw it; absent when untouched. */
  processed?: ArrayBuffer
}

async function runJob(
  client: FormshiftClient,
  sessionId: string,
  graph: Graph,
  draft: boolean,
  signal: AbortSignal
): Promise<JobOutput[]> {
  const jobId = await client.submitJob(sessionId, graph, { draft, signal })
  const job = await client.waitForJob(sessionId, jobId, { signal })
  if (job.status !== 'completed') throw new Error(job.error ?? `job ${job.status}`)
  return job.outputs ?? []
}

async function runMono(
  client: FormshiftClient,
  sessionId: string,
  payloadId: string,
  pipeline: Pipeline,
  draft: boolean,
  signal: AbortSignal
): Promise<RunResult> {
  const outputs = await runJob(
    client,
    sessionId,
    buildPipelineGraph(payloadId, pipeline),
    draft,
    signal
  )
  const output = outputs.find((o) => o.node === 'trace' && o.port === 'svg')
  if (output === undefined) throw new Error('job completed without an svg output')
  const { data } = await client.downloadPayload(sessionId, output.payload, signal)
  const svg = new TextDecoder().decode(data)
  // The pre-processed raster tap (see buildPipelineGraph); absent when the
  // source went straight into trace.
  const tap = outputs.find((o) => o.port === 'image')
  const processed =
    tap === undefined
      ? undefined
      : (await client.downloadPayload(sessionId, tap.payload, signal)).data
  return { svg, processed }
}

async function runColor(
  client: FormshiftClient,
  sessionId: string,
  payloadId: string,
  pipeline: Pipeline,
  draft: boolean,
  signal: AbortSignal,
  onLayer: (layer: ColorLayer) => void
): Promise<RunResult> {
  // Phase 1: palette discovery. The palette only exists inside posterize's
  // output PNG, so a cheap posterize-only job runs first; phase 2 re-runs
  // posterize as a server cache hit.
  const postOutputs = await runJob(
    client,
    sessionId,
    buildPosterizeGraph(payloadId, pipeline),
    draft,
    signal
  )
  const post = postOutputs.find((o) => o.node === 'post' && o.port === 'image')
  if (post === undefined) throw new Error('posterize completed without an image output')
  const { data: postBytes } = await client.downloadPayload(sessionId, post.payload, signal)
  const palette = readPngPalette(postBytes)

  // Phase 2: the full fan-out, consumed progressively over SSE. The
  // posterized PNG doubles as the source preview — it is exactly what the
  // per-color tracers saw.
  const { graph, merged, branches } = buildColorTraceGraph(payloadId, pipeline, palette)
  const branchNodes = new Set(branches.map((b) => b.node))

  // The stream can only be closed by aborting its fetch, so it gets its own
  // controller, linked to the run's signal and always aborted on the way out.
  const events = new AbortController()
  const onAbort = (): void => events.abort()
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    // Open the stream before submitting: early events buffer in the response
    // stream, so nothing is missed and no client-side event buffer exists.
    const body = await client.openEvents(sessionId, events.signal)
    const jobId = await client.submitJob(sessionId, graph, { draft, signal })

    let mergedPayload: string | undefined
    let completed = false
    for await (const event of parseSseStream(body)) {
      if (event.event === 'job.output') {
        const output = JSON.parse(event.data) as JobOutputEvent
        if (output.job !== jobId) continue
        if (output.node === merged.node && output.port === merged.port) {
          mergedPayload = output.payload
        } else if (branchNodes.has(output.node) && output.port === 'svg') {
          const { data } = await client.downloadPayload(sessionId, output.payload, signal)
          if (signal.aborted) break
          const url = URL.createObjectURL(new Blob([data], { type: 'image/svg+xml' }))
          onLayer({ node: output.node, url })
        }
      } else if (event.event === 'job.completed') {
        if ((JSON.parse(event.data) as { job: string }).job !== jobId) continue
        completed = true
        break
      } else if (event.event === 'job.failed' || event.event === 'job.cancelled') {
        const payload = JSON.parse(event.data) as JobFailedEvent
        if (payload.job !== jobId) continue
        throw new Error(payload.error ?? `job ${event.event.slice('job.'.length)}`)
      }
    }

    // Backstop: if the stream died before a terminal event (dropped
    // connection), fall back to polling — strictly after the stream ended,
    // so the two never race.
    if (!completed || mergedPayload === undefined) {
      const job = await client.waitForJob(sessionId, jobId, { signal })
      if (job.status !== 'completed') throw new Error(job.error ?? `job ${job.status}`)
      const out = job.outputs?.find((o) => o.node === merged.node && o.port === merged.port)
      if (out === undefined) throw new Error('color trace completed without a merged svg output')
      mergedPayload = out.payload
    }

    const { data } = await client.downloadPayload(sessionId, mergedPayload, signal)
    return { svg: new TextDecoder().decode(data), processed: postBytes }
  } finally {
    signal.removeEventListener('abort', onAbort)
    events.abort()
  }
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
  // Progressive per-color layer URLs; drained (revoked) when the latest run
  // reaches a terminal state. Superseded runs stop appending via their
  // aborted signal, so the drain never races an append.
  const partialUrlsRef = useRef<string[]>([])

  const execute = useCallback(
    (payloadId: string, pipeline: Pipeline, options?: RunOptions): void => {
      const draft = options?.draft ?? false
      // Keep the previous result visible while re-running; only show the
      // busy placeholder when there is nothing to show yet.
      setState((previous) => (previous.phase === 'done' ? previous : { phase: 'running' }))
      const drainPartials = (): void => {
        for (const url of partialUrlsRef.current) URL.revokeObjectURL(url)
        partialUrlsRef.current = []
      }
      void gate
        .run('pipeline', (signal) => {
          if (pipeline.quantize.mode !== 'posterize') {
            return runMono(client, sessionId, payloadId, pipeline, draft, signal)
          }
          const onLayer = (layer: ColorLayer): void => {
            if (signal.aborted) {
              URL.revokeObjectURL(layer.url)
              return
            }
            partialUrlsRef.current.push(layer.url)
            // Only transition into (or extend) the running phase — a first
            // layer replaces the previous done result on screen, later ones
            // append in completion order.
            setState((previous) => ({
              phase: 'running',
              colorLayers: [
                ...(previous.phase === 'running' ? (previous.colorLayers ?? []) : []),
                layer
              ]
            }))
          }
          return runColor(client, sessionId, payloadId, pipeline, draft, signal, onLayer)
        })
        .then((result) => {
          if (result === undefined) return
          drainPartials()
          const { svg, processed } = result
          const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
          if (svgUrlRef.current !== undefined) URL.revokeObjectURL(svgUrlRef.current)
          svgUrlRef.current = svgUrl
          // Payload types are Formshift tags ("raster/png"), not MIME types.
          const processedUrl =
            processed === undefined
              ? undefined
              : URL.createObjectURL(new Blob([processed], { type: 'image/png' }))
          if (processedUrlRef.current !== undefined) URL.revokeObjectURL(processedUrlRef.current)
          processedUrlRef.current = processedUrl
          setState({ phase: 'done', svg, svgUrl, processedUrl })
        })
        .catch((error: unknown) => {
          drainPartials()
          setState({
            phase: 'error',
            message: error instanceof Error ? error.message : String(error)
          })
        })
    },
    [client, gate, sessionId]
  )

  const loadImage = useCallback(
    async (file: File, pipeline: Pipeline, options?: RunOptions): Promise<void> => {
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
        execute(payloadId, pipeline, options)
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
    (pipeline: Pipeline, options?: RunOptions): void => {
      const payloadId = payloadRef.current
      if (payloadId !== undefined) execute(payloadId, pipeline, options)
    },
    [execute]
  )

  return { source, state, loadImage, run }
}
