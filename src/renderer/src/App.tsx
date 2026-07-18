import { useCallback, useState } from 'react'
import type { JSX } from 'react'
import { ConnectPanel } from './components/ConnectPanel'
import { Editor } from './components/Editor'
import { COLOR_TRACE_MODULES } from './pipeline/graph'
import { FormshiftClient } from './server/client'
import type { ConnectionInfo } from './server/types'
import './app.css'

const STORAGE_KEY = 'formshift-vector.connection'

function loadStoredConnection(): ConnectionInfo {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Partial<ConnectionInfo> | null
      if (typeof parsed?.baseUrl === 'string' && typeof parsed.token === 'string') {
        return { baseUrl: parsed.baseUrl, token: parsed.token }
      }
    }
  } catch {
    // Corrupt stored value; fall through to the default.
  }
  return { baseUrl: 'http://127.0.0.1:5000', token: '' }
}

interface ActiveConnection {
  conn: ConnectionInfo
  sessionId: string
  /** Color-trace modules the server lacks; disables Posterize in the UI. */
  missingModules: string[]
}

export default function App(): JSX.Element {
  const [active, setActive] = useState<ActiveConnection>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  // Lazy state, not a plain call: reads localStorage once, not every render.
  const [storedConn] = useState(loadStoredConnection)

  const connect = useCallback(async (conn: ConnectionInfo): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const client = new FormshiftClient(conn)
      await client.health()
      const sessionId = await client.createSession()
      // Capability probe, fail-open: if it errs, Posterize stays enabled and
      // an actual submit surfaces the server's own error instead.
      const missingModules = await client
        .listModules()
        .then((manifests) => {
          const present = new Set(manifests.map((m) => m.name))
          return COLOR_TRACE_MODULES.filter((name) => !present.has(name))
        })
        .catch(() => [])
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conn))
      setActive({ conn, sessionId, missingModules })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [])

  if (active !== undefined) {
    return (
      <Editor
        conn={active.conn}
        sessionId={active.sessionId}
        missingModules={active.missingModules}
      />
    )
  }
  return (
    <ConnectPanel
      initial={storedConn}
      busy={busy}
      error={error}
      onConnect={(conn) => void connect(conn)}
    />
  )
}
