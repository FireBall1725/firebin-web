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
    <div>
      <h1 className="text-2xl font-semibold">API Tokens</h1>
      <p className="mt-1 text-zinc-500">
        Personal access tokens (<code className="text-xs">fbin_pat_…</code>) for scripts,
        the MCP server, and integrations.
      </p>

      {created && (
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Copy this token now — it won't be shown again.
          </p>
          <code className="mt-2 block break-all rounded bg-white px-3 py-2 font-mono text-sm dark:bg-zinc-900">
            {created}
          </code>
          <button
            onClick={() => setCreated(null)}
            className="mt-2 text-xs text-amber-700 hover:underline dark:text-amber-400"
          >
            Done
          </button>
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Token name (e.g. my-laptop)"
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-800"
        />
        <button
          onClick={create}
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
        >
          Create
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-6 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {tokens.length === 0 && (
          <p className="p-4 text-sm text-zinc-500">No tokens yet.</p>
        )}
        {tokens.map((t) => (
          <div key={t.id} className="flex items-center justify-between p-4">
            <div>
              <div className="font-medium">
                {t.name}
                {t.revoked_at && (
                  <span className="ml-2 text-xs text-red-500">revoked</span>
                )}
              </div>
              <div className="text-xs text-zinc-500">
                fbin_pat_…{t.token_suffix} · created{' '}
                {new Date(t.created_at).toLocaleDateString()}
                {t.last_used_at &&
                  ` · last used ${new Date(t.last_used_at).toLocaleDateString()}`}
              </div>
            </div>
            {!t.revoked_at && (
              <button
                onClick={() => revoke(t.id)}
                className="text-sm text-zinc-500 hover:text-red-600"
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
