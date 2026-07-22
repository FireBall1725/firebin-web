// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useState } from 'react'
import { api, type APIToken } from '../lib/api'

export function TokensPage() {
  const [tokens, setTokens] = useState<APIToken[]>([])
  const [name, setName] = useState('')
  const [created, setCreated] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => api.listTokens().then(setTokens).catch(() => undefined)
  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    setError(null)
    if (!name.trim()) return
    try {
      const res = await api.createToken(name.trim())
      setCreated(res.token)
      setName('')
      await load()
    } catch {
      setError('Could not create token')
    }
  }

  const revoke = async (id: string) => {
    await api.revokeToken(id).catch(() => undefined)
    await load()
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <span className="eyebrow">Settings</span>
      <h1 className="c-text" style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-0.02em', margin: '2px 0 4px' }}>
        API Tokens
      </h1>
      <p className="c-dim text-sm">
        Personal access tokens (<span className="mono c-accent">fbin_pat_…</span>) for scripts, the MCP
        server, and integrations.
      </p>

      {created && (
        <div className="banner mt-5">
          <p className="c-warn text-sm" style={{ fontWeight: 600 }}>
            Copy this token now — it won't be shown again.
          </p>
          <code className="mono bg-panel bd mt-2 block break-all" style={{ borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
            {created}
          </code>
          <button onClick={() => setCreated(null)} className="link mt-2" style={{ fontSize: 12 }}>
            Done
          </button>
        </div>
      )}

      <div className="mt-5 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder="Token name (e.g. my-laptop)"
          className="input"
        />
        <button onClick={create} className="btn primary">Create</button>
      </div>
      {error && <p className="c-crit mt-2 text-sm">{error}</p>}

      <div className="card mt-5">
        {tokens.length === 0 && <p className="c-faint p-4 text-sm">No tokens yet.</p>}
        {tokens.map((t) => (
          <div key={t.id} className="flex items-center justify-between bd-b px-4 py-3">
            <div>
              <div className="c-text" style={{ fontWeight: 600 }}>
                {t.name}
                {t.revoked_at && <span className="pill low" style={{ marginLeft: 8 }}>revoked</span>}
              </div>
              <div className="mono c-faint" style={{ fontSize: 11, marginTop: 2 }}>
                fbin_pat_…{t.token_suffix} · created {new Date(t.created_at).toLocaleDateString()}
                {t.last_used_at && ` · last used ${new Date(t.last_used_at).toLocaleDateString()}`}
              </div>
            </div>
            {!t.revoked_at && (
              <button onClick={() => revoke(t.id)} className="btn sm danger">Revoke</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
