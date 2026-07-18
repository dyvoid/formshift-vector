// Mirrors the Formshift Server v1 HTTP contract (see the server repo's ADRs
// 0002-0007). The server's contracts are forward-only; unknown fields in
// responses are ignored here by construction, never rejected.

export interface ConnectionInfo {
  /** e.g. "http://127.0.0.1:35673" — no trailing slash. */
  baseUrl: string
  token: string
}

export interface GraphNode {
  id: string
  module: string
  params?: Record<string, unknown>
}

export interface PayloadBinding {
  payload: string
  node: string
  port: string
}

export interface Edge {
  from_node: string
  from_port: string
  to_node: string
  to_port: string
}

export interface OutputRef {
  node: string
  port: string
}

export interface Graph {
  nodes: GraphNode[]
  edges: Edge[]
  bindings: PayloadBinding[]
  outputs: OutputRef[]
}

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set([
  'completed',
  'failed',
  'cancelled'
])

export interface JobOutput {
  node: string
  port: string
  type: string
  payload: string
}

export interface JobDoc {
  id: string
  status: JobStatus
  outputs?: JobOutput[]
  error?: string
}

// SSE event payloads on GET /v1/sessions/{sid}/events (server ADR 0007).
// One stream per session, multiplexing all jobs — every payload carries the
// job id. Discrimination happens on the SSE `event:` field at the consumer.

export interface JobStatusEvent {
  job: string
  status: JobStatus
}

export interface NodeCompletedEvent {
  job: string
  node: string
  cached: boolean
}

/** Emitted as each requested output materializes; `payload` is immediately
 *  downloadable. The progressive-rendering signal. */
export interface JobOutputEvent {
  job: string
  node: string
  port: string
  type: string
  payload: string
  group?: string
}

export interface JobFailedEvent {
  job: string
  error?: string
}

export interface PortSpec {
  name: string
  type: string
}

export interface ModuleManifest {
  name: string
  version: string
  description: string
  isolation: string
  inputs: PortSpec[]
  outputs: PortSpec[]
}
