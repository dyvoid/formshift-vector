// Multi-node pipeline against a live Formshift Server (M1 exit behavior:
// chains execute, reorders re-execute correctly). Skipped without
// FORMSHIFT_URL/FORMSHIFT_TOKEN — see client.integration.test.ts.

import { describe, expect, it } from 'vitest'
import { FormshiftClient } from '../server/client'
import { buildPipelineGraph } from './graph'
import type { Pipeline } from './model'
import { DEFAULT_PIPELINE } from './model'

declare const process: { env: Record<string, string | undefined> }

const url = process.env['FORMSHIFT_URL']
const token = process.env['FORMSHIFT_TOKEN']
const live = url !== undefined && token !== undefined

const TEST_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAAAAACPAi4CAAAAz0lEQVR4nO2XwQ6EIAxES7P//8vsaVek0zKEJhKDN5npy7QSxVJl7dLF+gN4B+DjCUVEKryhAAUtQQQEgHIXgWbg1GPFJvDLYQiTIKwHeg8Y1RuHhipB0ECjCLlbmQtw96mzThMyW+ADtN7EBDMBGvfzb6Q8wNwILv9GLRzADoDZw9bPv1EL64C5IfzdmS3MRLi8qUPkIzROddbZ+ux9wEW4uTTQmHrTwpjQOcwMRoRet8e8Gn0iLB49BT8EUOBR1wnBn5UhwslVzn/jAYjIFwjfIYuQDDDHAAAAAElFTkSuQmCC'

function testPng(): Uint8Array<ArrayBuffer> {
  const raw = atob(TEST_PNG_BASE64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function runToSvg(
  client: FormshiftClient,
  sessionId: string,
  payloadId: string,
  pipeline: Pipeline
): Promise<string> {
  const jobId = await client.submitJob(sessionId, buildPipelineGraph(payloadId, pipeline))
  const job = await client.waitForJob(sessionId, jobId)
  expect(job.status).toBe('completed')
  const output = job.outputs?.find((o) => o.node === 'trace' && o.port === 'svg')
  expect(output).toBeDefined()
  const { data } = await client.downloadPayload(sessionId, output?.payload ?? '')
  return new TextDecoder().decode(data)
}

describe.skipIf(!live)('pipeline graphs against a live server', () => {
  const client = new FormshiftClient({ baseUrl: url ?? '', token: token ?? '' })

  it('executes a rotate → levels → binarize → trace chain', async () => {
    const sessionId = await client.createSession()
    try {
      const payloadId = await client.uploadPayload(sessionId, 'raster/png', testPng())
      const svg = await runToSvg(client, sessionId, payloadId, {
        layers: [
          { id: 'rot', module: 'image.rotate', enabled: true, params: { angle: 45 } },
          {
            id: 'lev',
            module: 'image.levels',
            enabled: true,
            params: { black: 20, white: 235, gamma: 1.2 }
          }
        ],
        quantize: { mode: 'binarize', level: 128, colors: 8 },
        trace: { blacklevel: 0.5, turdsize: 2 }
      })
      expect(svg).toContain('<svg')
      expect(svg).toContain('<path')
    } finally {
      await client.deleteSession(sessionId)
    }
  })

  it('reordering the stack still completes and can change the result', async () => {
    const sessionId = await client.createSession()
    try {
      const payloadId = await client.uploadPayload(sessionId, 'raster/png', testPng())
      const crop = {
        id: 'crop',
        module: 'image.crop' as const,
        enabled: true,
        params: { x: 0, y: 0, width: 32, height: 0 }
      }
      const rotate = {
        id: 'rot',
        module: 'image.rotate' as const,
        enabled: true,
        params: { angle: 90 }
      }

      const cropFirst = await runToSvg(client, sessionId, payloadId, {
        ...DEFAULT_PIPELINE,
        layers: [crop, rotate]
      })
      const rotateFirst = await runToSvg(client, sessionId, payloadId, {
        ...DEFAULT_PIPELINE,
        layers: [rotate, crop]
      })

      expect(cropFirst).toContain('<svg')
      expect(rotateFirst).toContain('<svg')
      // crop-then-rotate keeps the left half; rotate-then-crop keeps the
      // bottom half rotated up — different pixels, different paths.
      expect(cropFirst).not.toEqual(rotateFirst)
    } finally {
      await client.deleteSession(sessionId)
    }
  })

  it('toggling a layer off produces the no-layer result', async () => {
    const sessionId = await client.createSession()
    try {
      const payloadId = await client.uploadPayload(sessionId, 'raster/png', testPng())
      const plain = await runToSvg(client, sessionId, payloadId, DEFAULT_PIPELINE)
      const toggledOff = await runToSvg(client, sessionId, payloadId, {
        ...DEFAULT_PIPELINE,
        layers: [{ id: 'rot', module: 'image.rotate', enabled: false, params: { angle: 90 } }]
      })
      expect(toggledOff).toEqual(plain)
    } finally {
      await client.deleteSession(sessionId)
    }
  })
})
