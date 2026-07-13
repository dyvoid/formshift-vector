// Integration tests against a live Formshift Server. Skipped unless
// FORMSHIFT_URL and FORMSHIFT_TOKEN are set (CI has no server; locally:
// `uv run formshift-server --port 0` in the server repo, then export both).

import { describe, expect, it } from 'vitest'
import { FormshiftClient, ServerError } from './client'
import type { Graph } from './types'

// Vitest runs these in Node; the renderer tsconfig deliberately has no node
// types, so declare the one global the suite needs.
declare const process: { env: Record<string, string | undefined> }

const url = process.env['FORMSHIFT_URL']
const token = process.env['FORMSHIFT_TOKEN']
const live = url !== undefined && token !== undefined

// 64x64 PNG: black circle split by a vertical white bar (two half-moons).
const TEST_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAAAAACPAi4CAAAAz0lEQVR4nO2XwQ6EIAxES7P//8vsaVek0zKEJhKDN5npy7QSxVJl7dLF+gN4B+DjCUVEKryhAAUtQQQEgHIXgWbg1GPFJvDLYQiTIKwHeg8Y1RuHhipB0ECjCLlbmQtw96mzThMyW+ADtN7EBDMBGvfzb6Q8wNwILv9GLRzADoDZw9bPv1EL64C5IfzdmS3MRLi8qUPkIzROddbZ+ux9wEW4uTTQmHrTwpjQOcwMRoRet8e8Gn0iLB49BT8EUOBR1wnBn5UhwslVzn/jAYjIFwjfIYuQDDDHAAAAAElFTkSuQmCC'

function testPng(): Uint8Array<ArrayBuffer> {
  const raw = atob(TEST_PNG_BASE64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function traceGraph(payloadId: string, blacklevel: number): Graph {
  return {
    nodes: [{ id: 'trace', module: 'potrace.trace', params: { blacklevel } }],
    edges: [],
    bindings: [{ payload: payloadId, node: 'trace', port: 'image' }],
    outputs: [{ node: 'trace', port: 'svg' }]
  }
}

describe.skipIf(!live)('FormshiftClient against a live server', () => {
  const client = new FormshiftClient({ baseUrl: url ?? '', token: token ?? '' })

  it('reports health without auth', async () => {
    const health = await client.health()
    expect(health.status).toBe('ok')
  })

  it('lists modules including potrace.trace', async () => {
    const modules = await client.listModules()
    const potrace = modules.find((m) => m.name === 'potrace.trace')
    expect(potrace).toBeDefined()
    expect(potrace?.inputs).toEqual([{ name: 'image', type: 'raster/png' }])
    expect(potrace?.outputs).toEqual([{ name: 'svg', type: 'vector/svg' }])
  })

  it('traces a PNG to SVG end to end', async () => {
    const sessionId = await client.createSession()
    try {
      const payloadId = await client.uploadPayload(sessionId, 'raster/png', testPng())
      const jobId = await client.submitJob(sessionId, traceGraph(payloadId, 0.5))
      const job = await client.waitForJob(sessionId, jobId)

      expect(job.status).toBe('completed')
      const output = job.outputs?.find((o) => o.node === 'trace' && o.port === 'svg')
      expect(output).toBeDefined()
      expect(output?.type).toBe('vector/svg')

      const { data, type } = await client.downloadPayload(sessionId, output?.payload ?? '')
      expect(type).toBe('vector/svg')
      const svg = new TextDecoder().decode(data)
      expect(svg).toContain('<svg')
      expect(svg).toContain('<path')
    } finally {
      await client.deleteSession(sessionId)
    }
  })

  it('parameter changes retrace against the same uploaded payload', async () => {
    const sessionId = await client.createSession()
    try {
      const payloadId = await client.uploadPayload(sessionId, 'raster/png', testPng())
      const svgs: string[] = []
      for (const blacklevel of [0.2, 0.8]) {
        const jobId = await client.submitJob(sessionId, traceGraph(payloadId, blacklevel))
        const job = await client.waitForJob(sessionId, jobId)
        expect(job.status).toBe('completed')
        const output = job.outputs?.find((o) => o.port === 'svg')
        const { data } = await client.downloadPayload(sessionId, output?.payload ?? '')
        svgs.push(new TextDecoder().decode(data))
      }
      expect(svgs[0]).toContain('<svg')
      expect(svgs[1]).toContain('<svg')
    } finally {
      await client.deleteSession(sessionId)
    }
  })

  it('rejects an invalid graph with a ServerError', async () => {
    const sessionId = await client.createSession()
    try {
      const graph: Graph = {
        nodes: [{ id: 'trace', module: 'no.such.module' }],
        edges: [],
        bindings: [],
        outputs: [{ node: 'trace', port: 'svg' }]
      }
      await expect(client.submitJob(sessionId, graph)).rejects.toThrow(ServerError)
    } finally {
      await client.deleteSession(sessionId)
    }
  })

  it('rejects a bad token', async () => {
    const bad = new FormshiftClient({ baseUrl: url ?? '', token: 'wrong-token' })
    await expect(bad.createSession()).rejects.toMatchObject({ status: 401 })
  })
})
