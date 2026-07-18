// Thin typed client for the Formshift Server v1 HTTP API. Transport rules per
// the design doc: binary bodies (never base64-in-JSON), upload once and
// reference by payload ID, explicit session IDs on every request, bearer
// token on everything except /health.

import type { ConnectionInfo, Graph, JobDoc, ModuleManifest } from './types'
import { TERMINAL_STATUSES } from './types'

export class ServerError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ServerError'
  }
}

const DEFAULT_POLL_MS = 50

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError')
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal === undefined) {
      setTimeout(resolve, ms)
      return
    }
    const sig = signal
    // A listener added after abort never fires; reject up front instead of
    // sleeping a full interval on a signal that is already dead.
    if (sig.aborted) {
      reject(abortReason(sig))
      return
    }
    const timer = setTimeout(() => {
      sig.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort(): void {
      clearTimeout(timer)
      reject(abortReason(sig))
    }
    sig.addEventListener('abort', onAbort, { once: true })
  })
}

export class FormshiftClient {
  constructor(private readonly conn: ConnectionInfo) {}

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${this.conn.token}`)
    const response = await fetch(`${this.conn.baseUrl}${path}`, { ...init, headers })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new ServerError(response.status, detail || `${response.status} on ${path}`)
    }
    return response
  }

  /** Unauthenticated liveness probe. */
  async health(signal?: AbortSignal): Promise<{ status: string; version: string }> {
    const response = await fetch(`${this.conn.baseUrl}/health`, { signal })
    if (!response.ok) throw new ServerError(response.status, 'health check failed')
    return (await response.json()) as { status: string; version: string }
  }

  async createSession(signal?: AbortSignal): Promise<string> {
    const response = await this.request('/v1/sessions', { method: 'POST', signal })
    const doc = (await response.json()) as { id: string }
    return doc.id
  }

  async deleteSession(sessionId: string, signal?: AbortSignal): Promise<void> {
    await this.request(`/v1/sessions/${sessionId}`, { method: 'DELETE', signal })
  }

  async listModules(signal?: AbortSignal): Promise<ModuleManifest[]> {
    const response = await this.request('/v1/modules', { signal })
    return (await response.json()) as ModuleManifest[]
  }

  async uploadPayload(
    sessionId: string,
    type: string,
    data: BodyInit,
    signal?: AbortSignal
  ): Promise<string> {
    const response = await this.request(
      `/v1/sessions/${sessionId}/payloads?type=${encodeURIComponent(type)}`,
      { method: 'POST', body: data, signal }
    )
    const doc = (await response.json()) as { id: string }
    return doc.id
  }

  async downloadPayload(
    sessionId: string,
    payloadId: string,
    signal?: AbortSignal
  ): Promise<{ data: ArrayBuffer; type: string | null }> {
    const response = await this.request(`/v1/sessions/${sessionId}/payloads/${payloadId}`, {
      signal
    })
    return { data: await response.arrayBuffer(), type: response.headers.get('X-Formshift-Type') }
  }

  /**
   * Open the session's SSE event stream. The caller consumes the body via
   * parseSseStream and tears down by aborting `signal` (there is no other
   * way to close a fetch body early). One stream multiplexes all jobs in
   * the session.
   */
  async openEvents(sessionId: string, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
    const response = await this.request(`/v1/sessions/${sessionId}/events`, {
      headers: { Accept: 'text/event-stream' },
      signal
    })
    if (response.body === null) throw new ServerError(response.status, 'event stream has no body')
    return response.body
  }

  async submitJob(
    sessionId: string,
    graph: Graph,
    options: { draft?: boolean; signal?: AbortSignal } = {}
  ): Promise<string> {
    const response = await this.request(`/v1/sessions/${sessionId}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graph, draft: options.draft ?? false }),
      signal: options.signal
    })
    const doc = (await response.json()) as { id: string }
    return doc.id
  }

  async getJob(sessionId: string, jobId: string, signal?: AbortSignal): Promise<JobDoc> {
    const response = await this.request(`/v1/sessions/${sessionId}/jobs/${jobId}`, { signal })
    return (await response.json()) as JobDoc
  }

  async cancelJob(sessionId: string, jobId: string, signal?: AbortSignal): Promise<void> {
    await this.request(`/v1/sessions/${sessionId}/jobs/${jobId}`, { method: 'DELETE', signal })
  }

  /**
   * Poll a job until it reaches a terminal status. Returns the terminal
   * JobDoc; the caller decides how to treat failed/cancelled. Cancels the
   * server-side job (fire and forget) when `signal` aborts, per the design
   * doc: cancellation is a first-class DELETE, not an afterthought.
   */
  async waitForJob(
    sessionId: string,
    jobId: string,
    options: { signal?: AbortSignal; pollMs?: number } = {}
  ): Promise<JobDoc> {
    const { signal, pollMs = DEFAULT_POLL_MS } = options
    try {
      for (;;) {
        const doc = await this.getJob(sessionId, jobId, signal)
        if (TERMINAL_STATUSES.has(doc.status)) return doc
        await sleep(pollMs, signal)
      }
    } catch (error) {
      if (signal?.aborted) {
        void this.cancelJob(sessionId, jobId).catch(() => undefined)
      }
      throw error
    }
  }
}
