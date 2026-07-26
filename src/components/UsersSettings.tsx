// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useState } from 'react'
import { api, ApiError, type User, type UserRole } from '../lib/api'
import { useAuth } from '../auth/AuthContext'
import { icon } from '../lib/icons'
import { mdiPlus, mdiClose } from '@mdi/js'

const ROLES: { value: UserRole; label: string; hint: string }[] = [
  { value: 'admin', label: 'Admin', hint: 'Everything, plus user management and settings' },
  { value: 'member', label: 'Member', hint: 'Full access to parts, stock, locations, projects' },
  { value: 'viewer', label: 'Viewer', hint: 'Read and export only' },
]

// UsersSettings is the admin-only user-management screen.
export function UsersSettings() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [resetFor, setResetFor] = useState<User | null>(null)

  const load = () => api.listUsers().then(setUsers).catch(() => setErr('Could not load users'))
  useEffect(() => { load() }, [])

  const patch = async (u: User, changes: Partial<{ role: UserRole; is_active: boolean }>) => {
    setErr(null)
    try {
      await api.updateUser(u.id, {
        role: changes.role ?? u.role,
        is_active: changes.is_active ?? u.is_active,
        display_name: u.display_name ?? null,
      })
      load()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Update failed')
    }
  }

  const del = async (u: User) => {
    if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return
    setErr(null)
    try {
      await api.deleteUser(u.id)
      load()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Delete failed')
    }
  }

  return (
    <div className="card">
      <div className="card-h">
        <h2>Users</h2>
        <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={() => setShowNew(true)}>
          {icon(mdiPlus)}
          Add user
        </button>
      </div>
      {err && <p className="c-crit text-sm" style={{ padding: '10px 16px 0' }}>{err}</p>}
      <table className="tbl">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Status</th>
            <th className="num">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>
                <span className="c-text">{u.username}</span>
                {u.id === me?.id && <span className="c-faint"> (you)</span>}
                {u.display_name && <div className="c-faint text-sm">{u.display_name}</div>}
              </td>
              <td>
                <select
                  className="input"
                  style={{ width: 'auto', height: 30, padding: '0 8px' }}
                  value={u.role}
                  onChange={(e) => patch(u, { role: e.target.value as UserRole })}
                >
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </td>
              <td>
                <button
                  className={`pill ${u.is_active ? 'ok' : 'low'}`}
                  style={{ cursor: 'pointer', border: 'none' }}
                  onClick={() => patch(u, { is_active: !u.is_active })}
                  title="Toggle active"
                >
                  {u.is_active ? 'Active' : 'Disabled'}
                </button>
              </td>
              <td className="num">
                <button className="btn sm" onClick={() => setResetFor(u)}>Reset password</button>
                {u.id !== me?.id && (
                  <button className="btn sm danger" style={{ marginLeft: 8 }} onClick={() => del(u)}>Delete</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="c-faint text-sm" style={{ padding: '12px 16px' }}>
        {ROLES.map((r) => `${r.label}: ${r.hint}`).join('  ·  ')}
      </p>

      {showNew && <NewUserModal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load() }} />}
      {resetFor && <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} />}
    </div>
  )
}

function NewUserModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('member')
  const [displayName, setDisplayName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setErr(null)
    if (!username.trim() || password.length < 8) {
      setErr('Username required, and password must be at least 8 characters')
      return
    }
    setBusy(true)
    try {
      await api.createUser({ username: username.trim(), password, role, display_name: displayName.trim() || undefined })
      onSaved()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not create user')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>Add user</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">{icon(mdiClose)}</button>
        </div>
        <div className="modal-b space-y-3">
          <label className="fieldlabel"><span>Username</span>
            <input className="input" value={username} autoFocus onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="fieldlabel"><span>Display name (optional)</span>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label className="fieldlabel"><span>Initial password</span>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </label>
          <label className="fieldlabel"><span>Role</span>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          {err && <p className="c-crit text-sm">{err}</p>}
        </div>
        <div className="modal-f">
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={save} disabled={busy} className="btn primary">{busy ? '…' : 'Create user'}</button>
        </div>
      </div>
    </div>
  )
}

function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setErr(null)
    if (password.length < 8) { setErr('Password must be at least 8 characters'); return }
    setBusy(true)
    try {
      await api.resetUserPassword(user.id, password)
      setDone(true)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not reset password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>Reset password — {user.username}</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">{icon(mdiClose)}</button>
        </div>
        <div className="modal-b space-y-3">
          {done ? (
            <p className="c-good text-sm">Password updated. Share the new password with them out of band.</p>
          ) : (
            <>
              <label className="fieldlabel"><span>New password</span>
                <input className="input" type="password" value={password} autoFocus onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
              </label>
              {err && <p className="c-crit text-sm">{err}</p>}
            </>
          )}
        </div>
        <div className="modal-f">
          <button onClick={onClose} className="btn">{done ? 'Done' : 'Cancel'}</button>
          {!done && <button onClick={save} disabled={busy} className="btn primary">{busy ? '…' : 'Set password'}</button>}
        </div>
      </div>
    </div>
  )
}

// AccountSettings lets the signed-in user change their own password.
export function AccountSettings() {
  const { user } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setMsg(null)
    if (next.length < 8) { setMsg({ ok: false, text: 'New password must be at least 8 characters' }); return }
    setBusy(true)
    try {
      await api.changeMyPassword(current, next)
      setCurrent(''); setNext('')
      setMsg({ ok: true, text: 'Password changed.' })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not change password' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="card-h"><h2>Account</h2></div>
      <div className="p-4">
        <p className="c-dim text-sm" style={{ marginBottom: 14 }}>
          Signed in as <span className="c-text">{user?.username}</span> ({user?.role}).
        </p>
        <div className="space-y-3" style={{ maxWidth: 360 }}>
          <label className="fieldlabel"><span>Current password</span>
            <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
          <label className="fieldlabel"><span>New password</span>
            <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="At least 8 characters" />
          </label>
          {msg && <p className={`text-sm ${msg.ok ? 'c-good' : 'c-crit'}`}>{msg.text}</p>}
          <button onClick={save} disabled={busy} className="btn primary">{busy ? '…' : 'Change password'}</button>
        </div>
      </div>
    </div>
  )
}
