// text/event-stream parsing over a fetch body. EventSource cannot send the
// Authorization header the server requires, so the client reads the stream
// itself. Pull-based: the consumer's for-await controls backpressure, and
// aborting the fetch ends the generator.

export interface SseEvent {
  /** From the `event:` field; 'message' when absent. */
  event: string
  /** Joined multi-line `data:` payload. */
  data: string
  id?: string
}

interface PendingEvent {
  event?: string
  data: string[]
  id?: string
}

function dispatch(pending: PendingEvent): SseEvent | undefined {
  if (pending.data.length === 0 && pending.event === undefined) return undefined
  return { event: pending.event ?? 'message', data: pending.data.join('\n'), id: pending.id }
}

function parseLine(line: string, pending: PendingEvent): void {
  if (line.startsWith(':')) return // comment (keepalive)
  const colon = line.indexOf(':')
  const field = colon === -1 ? line : line.slice(0, colon)
  // Per spec, a single space after the colon is stripped; the rest is value.
  let value = colon === -1 ? '' : line.slice(colon + 1)
  if (value.startsWith(' ')) value = value.slice(1)
  if (field === 'event') pending.event = value
  else if (field === 'data') pending.data.push(value)
  else if (field === 'id') pending.id = value
  // Other fields (retry, unknown) are ignored.
}

/**
 * Parse a text/event-stream body into events. Handles CRLF/LF line endings
 * and chunk boundaries that split lines or events; skips comment lines; an
 * incomplete trailing event at stream end is dropped.
 */
export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<SseEvent, void, undefined> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let pending: PendingEvent = { data: [] }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      for (;;) {
        const newline = buffer.indexOf('\n')
        if (newline === -1) break
        let line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (line.endsWith('\r')) line = line.slice(0, -1)
        if (line === '') {
          const event = dispatch(pending)
          pending = { data: [] }
          if (event !== undefined) yield event
        } else {
          parseLine(line, pending)
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
