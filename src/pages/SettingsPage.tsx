// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useState } from 'react'
import { api, type EnrichmentSettings } from '../lib/api'
import { PARTS_VIEWS, getPartsView, setPartsView, type PartsView } from '../lib/prefs'

export function SettingsPage() {
  const [partsView, setPV] = useState<PartsView>(getPartsView)
  const pickView = (v: PartsView) => { setPartsView(v); setPV(v) }
  const [s, setS] = useState<EnrichmentSettings | null>(null)
  const [clientID, setClientID] = useState('')
  const [secret, setSecret] = useState('')
  const [scope, setScope] = useState('supply.domain')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api.getEnrichmentSettings().then((x) => { setS(x); setScope(x.scope || 'supply.domain') }).catch(() => undefined)
  }, [])
  useEffect(load, [load])

  const save = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const x = await api.updateEnrichmentSettings({
        client_id: clientID.trim() || undefined,
        client_secret: secret.trim() || undefined,
        scope: scope.trim() || undefined,
      })
      setS(x)
      setSecret('')
      setClientID('')
      setMsg('Saved.')
    } catch {
      setMsg('Could not save.')
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setMsg('Testing…')
    try {
      await api.testEnrichment()
      setMsg('Connected ✓ — token minted (no query spent).')
    } catch {
      setMsg('Test failed — check the client ID and secret.')
    }
  }

  return (
    <div style={{ maxWidth: 620 }}>
      <span className="eyebrow">Settings</span>
      <h1 className="c-text" style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-0.02em', margin: '2px 0 20px' }}>
        Preferences
      </h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h"><h2>Parts view</h2></div>
        <div style={{ padding: 16 }}>
          <div className="pv-seg">
            {PARTS_VIEWS.map((o) => (
              <button key={o.value} className={partsView === o.value ? 'on' : ''} onClick={() => pickView(o.value)}>{o.label}</button>
            ))}
          </div>
          <p className="c-faint" style={{ fontSize: 12, marginTop: 10 }}>
            How the Parts page lists items: dense table, card grid, or list cards. Remembered on this device.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>Octopart / Nexar enrichment</h2>
          <span className={`pill ${s?.configured ? 'ok' : 'ghost'}`} style={{ marginLeft: 'auto' }}>
            {s?.configured ? 'connected' : 'not configured'}
          </span>
        </div>
        <div style={{ padding: 16 }}>
          <p className="c-dim" style={{ marginTop: 0, fontSize: 13 }}>
            Auto-fills a scanned part's name, parameters, and datasheet from its MPN. Create a free
            app at <span className="mono">nexar.com</span> (supply.domain scope) and paste its client
            ID and secret. Free tier is ~100 lookups/month; token refresh is free.
          </p>

          <label className="fieldlabel"><span>Client ID</span>
            <input
              className="input mono" value={clientID}
              placeholder={s?.client_id || 'client id'}
              onChange={(e) => setClientID(e.target.value)}
            />
          </label>
          <label className="fieldlabel" style={{ marginTop: 10 }}><span>Client secret</span>
            <input
              className="input mono" type="password" value={secret}
              placeholder={s?.secret_set ? '•••••••• (leave blank to keep)' : 'client secret'}
              onChange={(e) => setSecret(e.target.value)}
            />
          </label>
          <label className="fieldlabel" style={{ marginTop: 10 }}><span>Scope</span>
            <input className="input mono" value={scope} onChange={(e) => setScope(e.target.value)} />
          </label>

          {msg && <p style={{ marginTop: 12, fontSize: 13 }} className="c-dim">{msg}</p>}

          <div className="flex gap-2" style={{ marginTop: 14 }}>
            <button className="btn primary" disabled={busy} onClick={save}>Save</button>
            <button className="btn" disabled={busy || !s?.configured} onClick={test}>Test connection</button>
          </div>
        </div>
      </div>
    </div>
  )
}
