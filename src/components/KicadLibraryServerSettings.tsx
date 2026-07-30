// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useState } from 'react'
import { api, type CreatedKicadLibraryToken, type KicadLibraryToken } from '../lib/api'

// KicadLibraryServerSettings runs the KiCad HTTP library: the on/off switch, the
// URL workstations use to reach FireBin, and one token per machine.
//
// The download is the point of the whole screen. Hand-writing a .kicad_httplib
// means getting four things right, and KiCad's response to any of them being
// wrong is to discard the entire library with no usable error, so a typo reads as
// "the feature is broken" rather than "fix this line".
export function KicadLibraryServerSettings() {
  const [enabled, setEnabled] = useState(false)
  const [rootURL, setRootURL] = useState('')
  const [routePath, setRoutePath] = useState('/api/kicad-lib')
  const [savedRootURL, setSavedRootURL] = useState('')
  const [tokens, setTokens] = useState<KicadLibraryToken[]>([])
  const [name, setName] = useState('')
  const [created, setCreated] = useState<CreatedKicadLibraryToken | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [stale, setStale] = useState(false)

  const loadTokens = () => api.listKicadLibraryTokens().then(setTokens).catch(() => undefined)

  useEffect(() => {
    api
      .getKicadLibrarySettings()
      .then((s) => {
        setEnabled(s.enabled)
        setRoutePath(s.route_path)
        setSavedRootURL(s.root_url)
        // Suggest, do not assume. The browser's origin is a URL that demonstrably
        // reaches this instance, but the machine running KiCad may resolve
        // FireBin by another name, so this is a prefill the admin confirms.
        setRootURL(s.root_url || window.location.origin + s.route_path)
      })
      .catch(() => setError('Could not load the KiCad library settings.'))
    loadTokens()
  }, [])

  const saveRootURL = async () => {
    setError(null)
    setTestResult(null)
    try {
      const s = await api.updateKicadLibrarySettings({ root_url: rootURL.trim() })
      setRootURL(s.root_url)
      setSavedRootURL(s.root_url)
      // A pending file was rendered against the old URL, so downloading it now
      // would hand over a config pointing somewhere else. Say so rather than let
      // it happen quietly.
      if (created && created.config_file.includes(`"root_url": "${savedRootURL}"`)) {
        setStale(true)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the server URL.')
    }
  }

  const toggle = async (next: boolean) => {
    setEnabled(next)
    setError(null)
    try {
      await api.updateKicadLibrarySettings({ enabled: next })
    } catch {
      setEnabled(!next) // put the switch back; nothing was saved
      setError('Could not change that setting.')
    }
  }

  const create = async () => {
    setError(null)
    if (!name.trim()) return
    if (!savedRootURL) {
      setError('Save the server URL first, so the downloaded file points somewhere.')
      return
    }
    try {
      const res = await api.createKicadLibraryToken(name.trim())
      setCreated(res)
      setStale(false)
      setName('')
      await loadTokens()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the token.')
    }
  }

  const revoke = async (id: string) => {
    await api.revokeKicadLibraryToken(id).catch(() => undefined)
    await loadTokens()
  }

  // The filename is load-bearing: KiCad takes the library nickname from the
  // stem, so this has to be firebin.kicad_httplib for parts to appear as
  // "FireBin:…". Renaming it later orphans every symbol already placed.
  const download = (res: CreatedKicadLibraryToken) => {
    // Written exactly as the server rendered it. Parsing and re-serialising would
    // turn meta.version from 1.0 into 1, which JavaScript cannot avoid and KiCad
    // may not accept.
    const blob = new Blob([res.config_file], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'firebin.kicad_httplib'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  // Fetched from the browser rather than server-side, because what matters is
  // whether the URL works from a machine on this network. Only meaningful when
  // it points at this origin; anywhere else the browser refuses cross-origin and
  // that says nothing about whether KiCad could reach it.
  const test = async (res: CreatedKicadLibraryToken) => {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await fetch(`${savedRootURL}/v1/`, { headers: { Authorization: `Token ${res.token}` } })
      if (!r.ok) {
        setTestResult(`The server answered ${r.status}. KiCad would refuse the library.`)
      } else {
        const body = await r.json()
        setTestResult(
          'categories' in body && 'parts' in body
            ? 'Reachable, and the response looks right.'
            : 'Reachable, but the response was not what KiCad expects.',
        )
      }
    } catch {
      setTestResult(
        savedRootURL.startsWith(window.location.origin)
          ? 'Could not reach it from this browser.'
          : 'Could not check from here: that URL is a different host, so the browser blocks the request. Test it from the workstation instead.',
      )
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="card">
      <div className="card-h"><h2>KiCad library server</h2></div>
      <div style={{ padding: 16 }}>
        <p className="c-dim" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.5 }}>
          Serves your inventory to KiCad's Symbol Chooser, so parts place with their value,
          footprint, MPN and stock already filled in. Read-only: KiCad never changes stock.
        </p>

        <label className="flex items-center gap-2" style={{ cursor: 'pointer', marginTop: 14 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => toggle(e.target.checked)} />
          <span className="c-text" style={{ fontSize: 13.5 }}>Enable the KiCad library server</span>
        </label>

        <div style={{ marginTop: 16 }}>
          <label className="c-dim block" style={{ fontSize: 12, marginBottom: 4 }}>
            Server URL, as a workstation reaches it
          </label>
          <div className="flex gap-2">
            <input
              value={rootURL}
              onChange={(e) => setRootURL(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveRootURL()}
              placeholder={`https://firebin.example${routePath}`}
              className="input mono"
              style={{ fontSize: 12.5 }}
            />
            <button onClick={saveRootURL} className="btn" disabled={rootURL.trim() === savedRootURL}>
              Save
            </button>
          </div>
          <p className="c-faint" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
            {savedRootURL
              ? 'Written into every config file you download below.'
              : 'Suggested from this browser. If the machine running KiCad reaches FireBin by a different name, change it before saving.'}
          </p>
        </div>

        {created && (
          <div className="banner" style={{ marginTop: 16 }}>
            <p className="c-warn text-sm" style={{ fontWeight: 600, margin: 0 }}>
              Download the file now — the token is stored hashed and cannot be shown again.
            </p>
            <code
              className="mono bg-panel bd mt-2 block break-all"
              style={{ borderRadius: 8, padding: '10px 12px', fontSize: 13 }}
            >
              {created.token}
            </code>
            <div className="flex gap-2 mt-2 items-center">
              <button onClick={() => download(created)} className="btn primary sm" disabled={stale}>
                Download firebin.kicad_httplib
              </button>
              <button onClick={() => test(created)} className="btn sm" disabled={testing}>
                {testing ? 'Testing…' : 'Test connection'}
              </button>
              <button onClick={() => { setCreated(null); setTestResult(null); setStale(false) }} className="link" style={{ fontSize: 12 }}>
                Done
              </button>
            </div>
            {stale && (
              <p className="c-warn mt-2 text-sm" style={{ marginBottom: 0 }}>
                You changed the server URL after issuing this token, so this file would point at
                the old one. Add the workstation again to get a config with the new URL.
              </p>
            )}
            {testResult && <p className="c-dim mt-2 text-sm" style={{ marginBottom: 0 }}>{testResult}</p>}
            <p className="c-faint" style={{ fontSize: 11.5, marginTop: 10, marginBottom: 0, lineHeight: 1.6 }}>
              Put it in your KiCad configuration folder, then add it under
              Preferences → Manage Symbol Libraries. Keep the filename: KiCad takes the
              library name from it. Restart KiCad if it was already running.
            </p>
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <label className="c-dim block" style={{ fontSize: 12, marginBottom: 4 }}>
            Workstations
          </label>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              placeholder="Device name (e.g. Workshop iMac)"
              className="input"
            />
            <button onClick={create} className="btn primary">Add</button>
          </div>
          <p className="c-faint" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
            One per machine, so you can cut off a lost laptop without breaking the others.
          </p>
        </div>

        {error && <p className="c-crit mt-2 text-sm">{error}</p>}

        <div className="bd" style={{ borderRadius: 11, marginTop: 14, overflow: 'hidden' }}>
          {tokens.length === 0 && (
            <p className="c-faint p-4 text-sm" style={{ margin: 0 }}>No workstations yet.</p>
          )}
          {tokens.map((t) => (
            <div key={t.id} className="flex items-center justify-between bd-b px-4 py-3">
              <div>
                <div className="c-text" style={{ fontWeight: 600 }}>
                  {t.name}
                  {t.revoked_at && <span className="pill low" style={{ marginLeft: 8 }}>revoked</span>}
                </div>
                <div className="mono c-faint" style={{ fontSize: 11, marginTop: 2 }}>
                  fbin_kicad_…{t.token_suffix} · created {new Date(t.created_at).toLocaleDateString()}
                  {t.last_used_at
                    ? ` · last used ${new Date(t.last_used_at).toLocaleDateString()}`
                    : ' · never used'}
                </div>
              </div>
              {!t.revoked_at && (
                <button onClick={() => revoke(t.id)} className="btn sm danger">Revoke</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
