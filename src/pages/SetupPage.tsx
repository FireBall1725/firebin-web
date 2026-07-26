// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useState, type FormEvent } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ApiError } from '../lib/api'
import { FireBinIcon } from '../components/FireBinIcon'
import { AppFooter } from '../components/AppFooter'

// First-run wizard. It shows only when the instance has no accounts yet; the
// account created here becomes the instance admin.
export function SetupPage() {
  const { register, setupRequired, user } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  // Already signed in, or already set up: there is nothing to do here.
  if (user && !done) return <Navigate to="/" replace />
  if (!setupRequired && !done && !user) return <Navigate to="/login" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (username.trim().length < 1) {
      setError('Choose a username.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('The passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await register(username.trim(), password)
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-app flex min-h-screen flex-col">
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="card w-full" style={{ maxWidth: 420, padding: 32 }}>
          <div className="text-center" style={{ marginBottom: 20 }}>
            <div className="brand-lockup" style={{ justifyContent: 'center', fontSize: 27 }}>
              <FireBinIcon size={42} />
              <span className="brand-name">Fire<b>Bin</b></span>
            </div>
          </div>

          {!done ? (
            <>
              <div className="text-center" style={{ marginBottom: 20 }}>
                <h1 className="c-text" style={{ fontSize: 19, fontWeight: 650 }}>Welcome. Let's set up FireBin.</h1>
                <p className="c-faint" style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.5 }}>
                  Create your administrator account. It is the first account, and it has full access. You can add more people afterward under Settings.
                </p>
              </div>
              <form onSubmit={submit} className="space-y-4">
                <Field label="Username" value={username} onChange={setUsername} autoFocus />
                <Field label="Password" type="password" value={password} onChange={setPassword} />
                <Field label="Confirm password" type="password" value={confirm} onChange={setConfirm} />
                <p className="c-faint" style={{ fontSize: 12, marginTop: -6 }}>Use at least 8 characters, and keep it somewhere safe.</p>
                {error && <p className="c-crit text-sm">{error}</p>}
                <button type="submit" disabled={busy} className="btn primary" style={{ width: '100%', justifyContent: 'center' }}>
                  {busy ? '…' : 'Create admin account'}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center space-y-4">
              <h1 className="c-text" style={{ fontSize: 19, fontWeight: 650 }}>You're all set.</h1>
              <p className="c-faint" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                Your admin account is ready. To make scanning a distributor bag fill in datasheets and pricing, add a Digi-Key key under Settings, Enrichment, then scan your first part.
              </p>
              <button onClick={() => navigate('/')} className="btn primary" style={{ width: '100%', justifyContent: 'center' }}>
                Enter FireBin
              </button>
            </div>
          )}
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
