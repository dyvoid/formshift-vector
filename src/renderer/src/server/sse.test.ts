import { describe, expect, it } from 'vitest'
import type { SseEvent } from './sse'
import { parseSseStream } from './sse'

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller): void {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    }
  })
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<SseEvent[]> {
  const events: SseEvent[] = []
  for await (const event of parseSseStream(stream)) events.push(event)
  return events
}

describe('parseSseStream', () => {
  it('parses a single event', async () => {
    const events = await collect(streamOf('event: job.status\ndata: {"job":"J1"}\n\n'))
    expect(events).toEqual([{ event: 'job.status', data: '{"job":"J1"}', id: undefined }])
  })

  it('captures the id field and defaults event to message', async () => {
    const events = await collect(streamOf('id: 7\ndata: hello\n\n'))
    expect(events).toEqual([{ event: 'message', data: 'hello', id: '7' }])
  })

  it('joins multi-line data with newlines', async () => {
    const events = await collect(streamOf('data: one\ndata: two\n\n'))
    expect(events).toEqual([{ event: 'message', data: 'one\ntwo', id: undefined }])
  })

  it('reassembles events split across chunk boundaries', async () => {
    const events = await collect(
      streamOf('event: job.ou', 'tput\nda', 'ta: {"node":"color0"}\n', '\n')
    )
    expect(events).toEqual([{ event: 'job.output', data: '{"node":"color0"}', id: undefined }])
  })

  it('skips comment keepalive lines', async () => {
    const events = await collect(streamOf(': keepalive\n\n: keepalive\ndata: real\n\n'))
    expect(events).toEqual([{ event: 'message', data: 'real', id: undefined }])
  })

  it('handles CRLF line endings', async () => {
    const events = await collect(streamOf('event: e\r\ndata: d\r\n\r\n'))
    expect(events).toEqual([{ event: 'e', data: 'd', id: undefined }])
  })

  it('parses multiple sequential events', async () => {
    const events = await collect(streamOf('data: a\n\ndata: b\n\ndata: c\n\n'))
    expect(events.map((e) => e.data)).toEqual(['a', 'b', 'c'])
  })

  it('drops an incomplete trailing event at stream end', async () => {
    const events = await collect(streamOf('data: complete\n\ndata: dangling\n'))
    expect(events).toEqual([{ event: 'message', data: 'complete', id: undefined }])
  })
})
