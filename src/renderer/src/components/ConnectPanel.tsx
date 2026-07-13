// M0 dev-mode connection: the user starts Formshift Server by hand and
// pastes the connection info it prints. The embedded lifecycle manager that
// replaces this arrives with the M1 installer.

import { useState } from 'react'
import type { JSX } from 'react'
import type { ConnectionInfo } from '../server/types'

interface Props {
  initial: ConnectionInfo
  error?: string
  busy: boolean
  onConnect(conn: ConnectionInfo): void
}

export function ConnectPanel({ initial, error, busy, onConnect }: Props): JSX.Element {
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl)
  const [token, setToken] = useState(initial.token)

  return (
    <div className="connect-panel">
      <h1>Formshift: Vector</h1>
      <p>
        Start the server (<code>formshift-server --port 0</code>) and paste the connection info it
        prints.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onConnect({ baseUrl: baseUrl.trim().replace(/\/+$/, ''), token: token.trim() })
        }}
      >
        <label>
          Server URL
          <input
            type="url"
            required
            placeholder="http://127.0.0.1:5000"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </label>
        <label>
          Token
          <input
            type="password"
            required
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Connecting…' : 'Connect'}
        </button>
        {error !== undefined && <p className="error">{error}</p>}
      </form>
    </div>
  )
}
