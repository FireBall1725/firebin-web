// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ApiError } from '../lib/api'

export function LoginPage() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') await login(username, password)
      else await register(username, password, email)
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-app flex min-h-screen items-center justify-center px-4">
      <div className="card w-full" style={{ maxWidth: 380, padding: 32 }}>
        <div className="text-center" style={{ marginBottom: 22 }}>
          <img src="/firelabs-mark.png" alt="FireLabs" className="mx-auto" style={{ height: 52, width: 52, filter: 'drop-shadow(0 2px 6px rgba(245,165,36,0.3))' }} />
          <div className="brand-name" style={{ fontSize: 22, marginTop: 10 }}>
            Fire<b>Bin</b>
          </div>
          <p className="eyebrow" style={{ marginTop: 4 }}>Electronics component inventory</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Username" value={username} onChange={setUsername} autoFocus />
          {mode === 'register' && <Field label="Email (optional)" type="email" value={email} onChange={setEmail} />}
          <Field label="Password" type="password" value={password} onChange={setPassword} />

          {error && <p className="c-crit text-sm">{error}</p>}

          <button type="submit" disabled={busy} className="btn primary" style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setError(null)
          }}
          className="c-dim hover-accent"
          style={{ marginTop: 16, width: '100%', textAlign: 'center', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {mode === 'login' ? 'No account? Register' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  autoFocus,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoFocus?: boolean
}) {
  return (
    <label className="fieldlabel">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className="input"
      />
    </label>
  )
}
