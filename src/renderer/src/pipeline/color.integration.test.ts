// The posterize (color-trace) path against a live Formshift Server: palette
// discovery from the posterized PNG, then the per-color fan-out graph. Also
// pins the used-indices assumption readPngPalette relies on (posterize with
// N colors yields a PLTE with exactly the N used entries, indices 0..N-1).
// Skipped without FORMSHIFT_URL/FORMSHIFT_TOKEN — see client.integration.test.ts.

import { describe, expect, it } from 'vitest'
import { readPngPalette } from '../image/pngPalette'
import { FormshiftClient } from '../server/client'
import { buildColorTraceGraph, buildPosterizeGraph } from './graph'
import type { Pipeline } from './model'
import { DEFAULT_PIPELINE } from './model'

declare const process: { env: Record<string, string | undefined> }

const url = process.env['FORMSHIFT_URL']
const token = process.env['FORMSHIFT_TOKEN']
const live = url !== undefined && token !== undefined

// 64x64 RGB PNG, four flat color quadrants (red, green, blue, white) — flat
// tones so posterize(4) recovers them exactly.
const TEST_COLOR_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAbUlEQVR4nO3PsQ3AQAwDMe+/dDJDCkUQwMfVb/Geu2jZ33+ovwBgvP4CgPH6CwDG6y8AGK+/AGC8/gKA8foLAMbrLwAYr78AYLz+AoDx8gfCF9IPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAODzewFEtelaXpxHoAAAAABJRU5ErkJggg=='

function testColorPng(): Uint8Array<ArrayBuffer> {
  const raw = atob(TEST_COLOR_PNG_BASE64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function posterizePipeline(colors: number): Pipeline {
  return { ...DEFAULT_PIPELINE, quantize: { mode: 'posterize', level: 128, colors } }
}

describe.skipIf(!live)('color tracing against a live server', () => {
  const client = new FormshiftClient({ baseUrl: url ?? '', token: token ?? '' })

  it('posterize output carries a readable palette of exactly N colors', async () => {
    const sessionId = await client.createSession()
    try {
      const payloadId = await client.uploadPayload(sessionId, 'raster/png', testColorPng())
      const graph = buildPosterizeGraph(payloadId, posterizePipeline(4))
      const jobId = await client.submitJob(sessionId, graph)
      const job = await client.waitForJob(sessionId, jobId)
      expect(job.status).toBe('completed')
      const output = job.outputs?.find((o) => o.node === 'post' && o.port === 'image')
      expect(output).toBeDefined()
      const { data } = await client.downloadPayload(sessionId, output?.payload ?? '')
      // Pins the used-indices assumption: exactly N palette entries, so the
      // client may address colormask indices 0..N-1.
      const palette = readPngPalette(data)
      expect(palette).toHaveLength(4)
      for (const entry of palette) expect(entry).toMatch(/^#[0-9a-f]{6}$/)
    } finally {
      await client.deleteSession(sessionId)
    }
  })

  it('traces a four-color image into a merged multi-fill SVG', async () => {
    const sessionId = await client.createSession()
    try {
      const payloadId = await client.uploadPayload(sessionId, 'raster/png', testColorPng())
      const pipeline = posterizePipeline(4)

      // Phase 1: palette discovery.
      const postGraph = buildPosterizeGraph(payloadId, pipeline)
      const postJobId = await client.submitJob(sessionId, postGraph)
      const postJob = await client.waitForJob(sessionId, postJobId)
      expect(postJob.status).toBe('completed')
      const post = postJob.outputs?.find((o) => o.node === 'post' && o.port === 'image')
      const { data: postBytes } = await client.downloadPayload(sessionId, post?.payload ?? '')
      const palette = readPngPalette(postBytes)

      // Phase 2: the fan-out.
      const { graph, merged, branches } = buildColorTraceGraph(payloadId, pipeline, palette)
      const jobId = await client.submitJob(sessionId, graph)
      const job = await client.waitForJob(sessionId, jobId)
      expect(job.status).toBe('completed')

      const out = job.outputs?.find((o) => o.node === merged.node && o.port === merged.port)
      expect(out).toBeDefined()
      const { data } = await client.downloadPayload(sessionId, out?.payload ?? '')
      const svg = new TextDecoder().decode(data)
      expect(svg).toContain('<svg')
      const fills = new Set(svg.match(/fill="#[0-9a-fA-F]{6}"/g) ?? [])
      expect(fills.size).toBeGreaterThanOrEqual(2)

      // Every per-branch output materialized too (progressive rendering will
      // consume these).
      for (const branch of branches) {
        const branchOut = job.outputs?.find((o) => o.node === branch.node && o.port === 'svg')
        expect(branchOut).toBeDefined()
      }
    } finally {
      await client.deleteSession(sessionId)
    }
  })
})
