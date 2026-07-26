// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ApiError } from '../lib/api'
import { FireBinIcon } from '../components/FireBinIcon'
import { AppFooter } from '../components/AppFooter'

// Rotating login tagline — leans into the open-source, self-hosted spirit.
const TAGLINES = [
  'Open-source parts inventory',
  'By tinkerers, for tinkerers',
  'Your parts. Your server. Your rules.',
  'No cloud, no lock-in, no rent',
  'Yours to run, yours to hack',
  'Free and open, no strings',
]

// Cycle the tagline every few seconds, starting on a random one so a fresh load
// isn't always the same. Holds still when the viewer prefers reduced motion.
function useRotatingTagline(intervalMs = 4500): number {
  const [i, setI] = useState(() => Math.floor(Math.random() * TAGLINES.length))
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setI((n) => (n + 1) % TAGLINES.length), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return i
}

export function LoginPage() {
  const { login, setupRequired } = useAuth()
  const navigate = useNavigate()
  const tagline = useRotatingTagline()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Fresh install with no accounts yet: send them to the setup wizard instead.
  if (setupRequired) return <Navigate to="/setup" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(username, password)
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-app flex min-h-screen flex-col">
      <div className="flex flex-1 items-center justify-center px-4">
      <div className="card w-full" style={{ maxWidth: 380, padding: 32 }}>
        <div className="text-center" style={{ marginBottom: 22 }}>
          <div className="brand-lockup" style={{ justifyContent: 'center', fontSize: 27 }}>
            <FireBinIcon size={42} />
            <span className="brand-name">Fire<b>Bin</b></span>
          </div>
          <p key={tagline} className="eyebrow tagline-rotate" style={{ marginTop: 10, minHeight: '1.2em' }}>{TAGLINES[tagline]}</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Username" value={username} onChange={setUsername} autoFocus />
          <Field label="Password" type="password" value={password} onChange={setPassword} />

          {error && <p className="c-crit text-sm">{error}</p>}

          <button type="submit" disabled={busy} className="btn primary" style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? '…' : 'Sign in'}
          </button>
        </form>
      </div>
      </div>
      <AppFooter />
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
