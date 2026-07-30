// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, type EnrichmentSettings, type ProviderSettings } from '../lib/api'
import { PARTS_VIEWS, getPartsView, setPartsView, getHardwareScanner, setHardwareScanner, getCameraScan, setCameraScan, type PartsView } from '../lib/prefs'
import { THEMES, getTheme, applyTheme } from '../lib/themes'
import { LabelSheetsSettings } from '../components/LabelSheetsSettings'
import { ApiTokensSettings } from '../components/ApiTokensSettings'
import { JobsSettings } from '../components/JobsSettings'
import { AboutSettings } from '../components/AboutSettings'
import { UsersSettings, AccountSettings } from '../components/UsersSettings'
import { KicadLibraryServerSettings } from '../components/KicadLibraryServerSettings'
import { LabelBuilder } from '../components/LabelBuilder'
import { useAuth } from '../auth/AuthContext'

type Section = { id: string; label: string; desc: string }

export function SettingsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || !!user?.is_instance_admin
  const [params, setParams] = useSearchParams()

  const SECTIONS: Section[] = [
    { id: 'appearance', label: 'Appearance', desc: 'Theme, layout' },
    { id: 'scanning', label: 'Scanning', desc: 'Barcode input' },
    { id: 'labels', label: 'Label sheets', desc: 'Print media' },
    { id: 'labeldesign', label: 'Label designer', desc: 'Custom layouts' },
    ...(isAdmin ? [{ id: 'enrichment', label: 'Enrichment', desc: 'Digi-Key, Nexar' }] : []),
    { id: 'activity', label: 'Activity', desc: 'Background jobs' },
    { id: 'tokens', label: 'API tokens', desc: 'fbin_pat_…' },
    ...(isAdmin ? [{ id: 'kicadserver', label: 'KiCad library server', desc: 'Serve parts to KiCad' }] : []),
    ...(isAdmin ? [{ id: 'users', label: 'Users', desc: 'Members, roles' }] : []),
    ...(isAdmin ? [{ id: 'data', label: 'Data', desc: 'Export / import' }] : []),
    { id: 'account', label: 'Account', desc: 'Your password' },
    { id: 'about', label: 'Licences', desc: 'Open source' },
  ]

  const raw = params.get('section') ?? 'appearance'
  const section = SECTIONS.some((s) => s.id === raw) ? raw : 'appearance'
  const go = (id: string) => setParams(id === 'appearance' ? {} : { section: id }, { replace: true })

  return (
    <div>
      <span className="eyebrow">Settings</span>
      <h1 className="c-text" style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-0.02em', margin: '2px 0 20px' }}>
        Preferences
      </h1>

      <div className="flex gap-8" style={{ maxWidth: 1140, alignItems: 'flex-start' }}>
        <nav className="set-nav" style={{ width: 190, flexShrink: 0 }}>
          {SECTIONS.map((s) => (
            <button key={s.id} className={`set-nav-item ${section === s.id ? 'on' : ''}`} onClick={() => go(s.id)}>
              {s.label}
              <small>{s.desc}</small>
            </button>
          ))}
        </nav>

        <div style={{ flex: 1, minWidth: 0 }}>
          {section === 'appearance' && <AppearanceSection />}
          {section === 'scanning' && <ScanningSection />}
          {section === 'labels' && <LabelSheetsSettings />}
          {section === 'labeldesign' && <LabelBuilder />}
          {section === 'enrichment' && <EnrichmentSection />}
          {section === 'activity' && <JobsSettings />}
          {section === 'tokens' && <ApiTokensSettings />}
          {section === 'kicadserver' && isAdmin && <KicadLibraryServerSettings />}
          {section === 'users' && isAdmin && <UsersSettings />}
          {section === 'data' && isAdmin && <DataSection />}
          {section === 'account' && <AccountSettings />}
          {section === 'about' && <AboutSettings />}
        </div>
      </div>
    </div>
  )
}

function AppearanceSection() {
  const [partsView, setPV] = useState<PartsView>(getPartsView)
  const pickView = (v: PartsView) => { setPartsView(v); setPV(v) }
  const [theme, setTheme] = useState(getTheme)
  const pickTheme = (slug: string) => { applyTheme(slug); setTheme(slug) }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h"><h2>Theme</h2></div>
        <div style={{ padding: 16 }}>
          <div className="theme-grid">
            {THEMES.map((th) => (
              <button
                key={th.slug}
                className={`theme-card ${theme === th.slug ? 'on' : ''}`}
                data-theme={th.slug === 'auto' ? undefined : th.slug}
                onClick={() => pickTheme(th.slug)}
              >
                <div className="theme-prev">
                  <span className="theme-bar" />
                  <span className="theme-dot" style={{ background: 'var(--accent)' }} />
                  <span className="theme-dot" style={{ background: 'var(--cat-cap)' }} />
                  <span className="theme-dot" style={{ background: 'var(--cat-reg)' }} />
                  <span className="theme-dot" style={{ background: 'var(--cat-mod)' }} />
                  <span className="theme-dot" style={{ background: 'var(--cat-con)' }} />
                </div>
                <div className="theme-name">{th.label}</div>
              </button>
            ))}
          </div>
          <p className="c-faint" style={{ fontSize: 12, marginTop: 10 }}>
            Applies everywhere, including the part-category colours. The header ☀/☾ toggles light/dark. Remembered on this device.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-h"><h2>Parts view</h2></div>
        <div style={{ padding: 16 }}>
          <div className="pv-cards">
            {PARTS_VIEWS.map((o) => (
              <button
                key={o.value}
                className={`pv-card2 ${partsView === o.value ? 'on' : ''}`}
                onClick={() => pickView(o.value)}
                aria-pressed={partsView === o.value}
              >
                <PartsViewPreview view={o.value} />
                <div className="pv-card2-label">{o.label}</div>
              </button>
            ))}
          </div>
          <p className="c-faint" style={{ fontSize: 12, marginTop: 10 }}>
            How the Parts page lists items. Remembered on this device.
          </p>
        </div>
      </div>
    </>
  )
}

// PartsViewPreview draws a small wireframe of each list style so the choice is
// obvious without opening the Parts page.
function PartsViewPreview({ view }: { view: PartsView }) {
  if (view === 'table') {
    return (
      <div className="pv-prev">
        <span className="pv-prev-row head" />
        <span className="pv-prev-row" />
        <span className="pv-prev-row" />
        <span className="pv-prev-row" />
        <span className="pv-prev-row" />
      </div>
    )
  }
  if (view === 'grid') {
    return (
      <div className="pv-prev grid">
        {Array.from({ length: 6 }, (_, i) => <span key={i} className="pv-prev-tile" />)}
      </div>
    )
  }
  // list cards
  return (
    <div className="pv-prev">
      {Array.from({ length: 3 }, (_, i) => (
        <span key={i} className="pv-prev-card">
          <span className="pv-prev-thumb" />
          <span className="pv-prev-lines"><span /><span /></span>
        </span>
      ))}
    </div>
  )
}

function ScanningSection() {
  const [hwScanner, setHw] = useState(getHardwareScanner)
  const toggleHw = () => { const v = !hwScanner; setHardwareScanner(v); setHw(v) }
  const [cam, setCamState] = useState(getCameraScan)
  const toggleCam = () => { const v = !cam; setCameraScan(v); setCamState(v) }
  const secure = typeof window !== 'undefined' && window.isSecureContext
  return (
    <div className="card">
      <div className="card-h"><h2>Barcode scanner</h2></div>
      <div style={{ padding: 16 }} className="space-y-4">
        <div>
          <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={hwScanner} onChange={toggleHw} />
            <span className="c-text" style={{ fontSize: 13.5 }}>USB scanner (keyboard-wedge)</span>
          </label>
          <p className="c-faint" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5, maxWidth: 620 }}>
            When on, a USB barcode scanner that types the code and presses Enter (most of them) opens the scan flow
            automatically from any screen. Turn off if a scanner ever interferes with typing.
          </p>
        </div>
        <div>
          <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={cam} onChange={toggleCam} />
            <span className="c-text" style={{ fontSize: 13.5 }}>Webcam scanning</span>
          </label>
          <p className="c-faint" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5, maxWidth: 620 }}>
            Shows the camera Scan button for scanning with a webcam or phone camera. Turn it off if this instance is
            served over plain HTTP, where the browser blocks camera access.
          </p>
          <p className={secure ? 'c-faint' : 'c-crit'} style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5, maxWidth: 620 }}>
            {secure
              ? 'This page is served securely (HTTPS or localhost), so the camera and USB label printing work.'
              : 'This page is not a secure context — the browser will block the camera and WebUSB label printing. Serve FireBin over HTTPS (a reverse proxy like Caddy or Traefik) to enable them.'}
          </p>
        </div>
      </div>
    </div>
  )
}

function EnrichmentSection() {
  const [s, setS] = useState<EnrichmentSettings | null>(null)
  const load = useCallback(() => {
    api.getEnrichmentSettings().then(setS).catch(() => undefined)
  }, [])
  useEffect(load, [load])

  return (
    <>
      <p className="c-faint" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 14, lineHeight: 1.5, maxWidth: 640 }}>
        Auto-fills a scanned part's name, parameters, datasheet, and pricing from its MPN. Lookups try the providers
        top to bottom and stop at the first hit, so Digi-Key answers most parts and Nexar covers the rest.
      </p>
      <div className="flex flex-wrap items-end gap-3" style={{ marginBottom: 16 }}>
        <label className="fieldlabel" style={{ minWidth: 180 }}><span>Preferred currency</span>
          <select className="input" value={s?.currency ?? 'USD'}
            onChange={(e) => api.updateEnrichmentSettings({ currency: e.target.value }).then(setS).catch(() => undefined)}>
            {[...new Set([s?.currency, 'CAD', 'USD', 'EUR', 'GBP', 'AUD', 'JPY'].filter(Boolean))].map((c) => (
              <option key={c} value={c as string}>{c}</option>
            ))}
          </select>
        </label>
        <span className="c-faint text-sm" style={{ maxWidth: 380 }}>Digi-Key returns prices in this currency. Nexar reports whatever the seller quotes.</span>
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        {s?.providers.map((p) => (
          <ProviderCard key={p.provider} p={p} onSaved={load} />
        ))}
      </div>
    </>
  )
}

// Per-provider copy: what it is and how to get keys.
const PROVIDER_HELP: Record<string, ReactNode> = {
  digikey: (
    <>
      Free 2-legged OAuth app from <span className="mono">developer.digikey.com</span> — no Digi-Key credit account
      needed for product lookups. Create an app (Production, Product Information V4), then paste its Client ID and
      secret. Catalogue and prices come back for the Canada site in CAD.
    </>
  ),
  mouser: (
    <>
      Free key from <span className="mono">mouser.com/api-search</span> — one API key, no OAuth app. Limits are 30
      calls a minute and 1000 a day, so Mouser runs after Digi-Key in the chain. Testing the key costs one of those
      calls, because Mouser has no separate endpoint to validate credentials against.
    </>
  ),
  nexar: (
    <>
      Octopart data across many distributors. Create a free app at <span className="mono">nexar.com</span>
      {' '}(supply.domain scope) and paste its client ID and secret. Free tier is ~100 lookups/month; token refresh
      is free.
    </>
  ),
}

function ProviderCard({ p, onSaved }: { p: ProviderSettings; onSaved: () => void }) {
  const [clientID, setClientID] = useState('')
  const [secret, setSecret] = useState('')
  const [scope, setScope] = useState(p.scope ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    setMsg(null)
    try {
      await api.updateEnrichmentSettings({
        provider: p.provider,
        client_id: clientID.trim() || undefined,
        client_secret: secret.trim() || undefined,
        scope: p.provider === 'nexar' ? (scope.trim() || undefined) : undefined,
      })
      setSecret('')
      setClientID('')
      setMsg('Saved.')
      onSaved()
    } catch {
      setMsg('Could not save.')
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setMsg('Testing…')
    try {
      await api.testEnrichment(p.provider)
      setMsg('Connected ✓ — token minted (no lookup spent).')
    } catch {
      setMsg('Test failed — check the client ID and secret.')
    }
  }

  return (
    <div className="card">
      <div className="card-h">
        <h2>{p.label}</h2>
        <label className="flex items-center gap-2 text-sm c-dim" style={{ marginLeft: 'auto' }} title="Include this provider in the lookup chain">
          <input type="checkbox" checked={p.enabled}
            onChange={(e) => api.updateEnrichmentSettings({ provider: p.provider, enabled: e.target.checked }).then(onSaved).catch(() => undefined)} />
          Enabled
        </label>
        <span className={`pill ${p.configured && p.enabled ? 'ok' : 'ghost'}`} style={{ marginLeft: 10 }}>
          {!p.configured ? 'not configured' : p.enabled ? 'connected' : 'disabled'}
        </span>
      </div>
      <div style={{ padding: 16 }}>
        <p className="c-dim" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.5 }}>
          {PROVIDER_HELP[p.provider]}
        </p>

        {/* A key-only provider (Mouser) has no client id, so showing an empty
            "Client ID" box would just invite someone to paste the key twice. */}
        {!p.key_only && (
          <label className="fieldlabel"><span>Client ID</span>
            <input
              className="input mono" value={clientID}
              placeholder={p.client_id || 'client id'}
              onChange={(e) => setClientID(e.target.value)}
            />
          </label>
        )}
        <label className="fieldlabel" style={p.key_only ? undefined : { marginTop: 10 }}>
          <span>{p.key_only ? 'API key' : 'Client secret'}</span>
          <input
            className="input mono" type="password" value={secret}
            placeholder={p.secret_set ? '•••••••• (leave blank to keep)' : (p.key_only ? 'api key' : 'client secret')}
            onChange={(e) => setSecret(e.target.value)}
          />
        </label>
        {p.provider === 'nexar' && (
          <label className="fieldlabel" style={{ marginTop: 10 }}><span>Scope</span>
            <input className="input mono" value={scope} onChange={(e) => setScope(e.target.value)} />
          </label>
        )}

        {p.from_env && (
          <p className="c-faint" style={{ marginTop: 10, fontSize: 12 }}>
            Currently loaded from an environment variable. Saving here overrides it.
          </p>
        )}
        {msg && <p style={{ marginTop: 12, fontSize: 13 }} className="c-dim">{msg}</p>}

        <div className="flex gap-2" style={{ marginTop: 14 }}>
          <button className="btn primary" disabled={busy} onClick={save}>Save</button>
          <button className="btn" disabled={busy || !p.configured} onClick={test}>Test connection</button>
        </div>
      </div>
    </div>
  )
}

// Friendly, ordered labels for the table names in a backup. Order runs from the
// data people care about most to the plumbing.
const BACKUP_LABELS: [string, string][] = [
  ['parts', 'parts'],
  ['stock_items', 'stock items'],
  ['stock_transactions', 'stock movements'],
  ['manufacturers', 'manufacturers'],
  ['manufacturer_parts', 'manufacturer part numbers'],
  ['suppliers', 'suppliers'],
  ['supplier_parts', 'supplier SKUs'],
  ['supplier_part_pricing', 'price breaks'],
  ['categories', 'categories'],
  ['parameter_templates', 'parameter templates'],
  ['part_parameters', 'part parameters'],
  ['storage_locations', 'locations'],
  ['projects', 'projects'],
  ['project_boards', 'boards'],
  ['board_bom_lines', 'BOM lines'],
  ['project_matches', 'project matches'],
  ['project_assets', 'project assets'],
  ['label_templates', 'label templates'],
  ['label_media', 'label media'],
  ['part_images', 'part images'],
  ['attachments', 'attachments'],
  ['users', 'users'],
  ['api_tokens', 'API tokens'],
  ['instance_settings', 'settings'],
]

type Counted = { key: string; label: string; count: number }

// countRows turns a backup table value (an array, or a JSON-encoded array) into a
// row count without trusting the shape.
function countRows(v: unknown): number {
  if (Array.isArray(v)) return v.length
  if (typeof v === 'string') {
    try {
      const a = JSON.parse(v)
      return Array.isArray(a) ? a.length : 0
    } catch {
      return 0
    }
  }
  return 0
}

// summarize returns the non-empty tables in display order, most meaningful first.
function summarize(tables: Record<string, unknown>): Counted[] {
  const out: Counted[] = []
  for (const [key, label] of BACKUP_LABELS) {
    const count = countRows(tables[key])
    if (count > 0) out.push({ key, label, count })
  }
  return out
}

type Staged = { data: { app?: string; format?: number; version?: string; tables: Record<string, unknown> }; summary: Counted[]; date: string }
type ImportResult = { rows: Counted[]; total: number; replaced: boolean }

function DataSection() {
  const { logout } = useAuth()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [staged, setStaged] = useState<Staged | null>(null)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const doExport = async () => {
    setBusy(true); setErr(null)
    try {
      const blob = await api.exportData()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `firebin-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setErr('Export failed.')
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setStaged(null); setResult(null); setErr(null); setMode('merge')
    if (fileRef.current) fileRef.current.value = ''
  }

  // Read and validate the file locally, then show what it holds before touching
  // anything on the server.
  const onPick = async (file: File) => {
    setErr(null); setResult(null)
    try {
      const data = JSON.parse(await file.text())
      if (data?.app !== 'firebin' || data?.format !== 1 || typeof data?.tables !== 'object') {
        setErr('That is not a FireBin backup file.')
        return
      }
      setStaged({ data, summary: summarize(data.tables), date: new Date(file.lastModified).toLocaleDateString() })
    } catch {
      setErr('Could not read that file — it is not valid JSON.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const doRestore = async () => {
    if (!staged) return
    if (mode === 'replace' && !confirm('Replace ALL current data with this backup? Everything in this instance is deleted first and cannot be undone. You will be signed out and must log in with the backup’s credentials.')) return
    setBusy(true); setErr(null)
    try {
      const r = await api.importData(staged.data, mode)
      const rows: Counted[] = []
      for (const [key, label] of BACKUP_LABELS) {
        const count = r.by_table?.[key] ?? 0
        if (count > 0) rows.push({ key, label, count })
      }
      setResult({ rows, total: r.imported, replaced: r.replaced })
      setStaged(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Restore failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-h"><h2>Export and import</h2></div>
        <div style={{ padding: 16 }} className="space-y-4">
          <p className="c-faint" style={{ fontSize: 12.5, lineHeight: 1.5, maxWidth: 640, marginTop: 0 }}>
            A portable JSON snapshot of the whole instance — parts, stock, lots, suppliers, pricing, locations, projects,
            labels, users, and settings. Keep a copy for recovery or for moving to another server.
          </p>

          {/* Idle: export + pick-a-file */}
          {!staged && !result && (
            <div className="flex flex-wrap gap-2">
              <button className="btn primary" disabled={busy} onClick={doExport}>{busy ? '…' : 'Export backup (JSON)'}</button>
              <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>Import backup…</button>
              <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f) }} />
            </div>
          )}

          {/* Staged: preview contents + choose mode */}
          {staged && (
            <div className="card" style={{ background: 'var(--surface-2, rgba(0,0,0,0.02))' }}>
              <div style={{ padding: 16 }} className="space-y-3">
                <div>
                  <p style={{ margin: 0, fontWeight: 600 }}>This backup contains</p>
                  <p className="c-faint" style={{ margin: '2px 0 0', fontSize: 12 }}>
                    {staged.data.version ? `From FireBin ${staged.data.version} · ` : ''}saved {staged.date}
                  </p>
                </div>
                {staged.summary.length === 0
                  ? <p className="c-faint text-sm">The file has no records in it.</p>
                  : (
                    <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '4px 16px', margin: 0, padding: 0, listStyle: 'none' }}>
                      {staged.summary.map((r) => (
                        <li key={r.key} style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span className="c-faint">{r.label}</span>
                          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{r.count.toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                <div className="space-y-2" style={{ borderTop: '1px solid var(--border, rgba(0,0,0,0.1))', paddingTop: 12 }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input type="radio" name="importmode" checked={mode === 'merge'} onChange={() => setMode('merge')} style={{ marginTop: 3 }} />
                    <span>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>Merge</span>
                      <span className="c-faint" style={{ display: 'block', fontSize: 12 }}>Add only records this instance is missing. Nothing existing is changed. Best for filling gaps in a matching instance.</span>
                    </span>
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input type="radio" name="importmode" checked={mode === 'replace'} onChange={() => setMode('replace')} style={{ marginTop: 3 }} />
                    <span>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>Replace <span className="c-crit" style={{ fontWeight: 500 }}>· full restore</span></span>
                      <span className="c-faint" style={{ display: 'block', fontSize: 12 }}>Delete everything here first, then restore this backup exactly. Use when moving to a new instance. You will be signed out and log in with the backup’s credentials.</span>
                    </span>
                  </label>
                </div>

                {mode === 'replace' && (
                  <p className="c-crit" style={{ fontSize: 12.5, margin: 0 }}>⚠ This permanently deletes all current data on this instance.</p>
                )}

                <div className="flex flex-wrap gap-2">
                  <button className="btn primary" disabled={busy || staged.summary.length === 0} onClick={doRestore}>
                    {busy ? 'Restoring…' : mode === 'replace' ? 'Delete all and restore' : 'Merge backup'}
                  </button>
                  <button className="btn" disabled={busy} onClick={reset}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="card" style={{ background: 'var(--surface-2, rgba(0,0,0,0.02))' }}>
              <div style={{ padding: 16 }} className="space-y-3">
                <p className="c-good" style={{ margin: 0, fontWeight: 600 }}>
                  {result.replaced ? 'Restore complete.' : 'Import complete.'} {result.total.toLocaleString()} record{result.total === 1 ? '' : 's'} {result.replaced ? 'restored' : 'added'}.
                </p>
                {result.total === 0
                  ? <p className="c-faint text-sm">Nothing was added — every record in the file already exists here. Use a full restore (Replace) into a fresh instance to recover a whole backup.</p>
                  : (
                    <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '4px 16px', margin: 0, padding: 0, listStyle: 'none' }}>
                      {result.rows.map((r) => (
                        <li key={r.key} style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span className="c-faint">{r.label}</span>
                          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{r.count.toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                <div className="flex flex-wrap gap-2">
                  {result.replaced
                    ? <button className="btn primary" onClick={() => logout()}>Sign in with the restored account</button>
                    : <button className="btn primary" onClick={() => window.location.reload()}>Refresh to see them</button>}
                  <button className="btn" onClick={reset}>Done</button>
                </div>
              </div>
            </div>
          )}

          {err && <p className="c-crit text-sm">{err}</p>}
          <p className="c-faint" style={{ fontSize: 12, lineHeight: 1.5, maxWidth: 640 }}>
            This is an application-level backup, not a replacement for a database backup — if you self-host Postgres, set
            up your own dump/restore as well.
          </p>
        </div>
      </div>
      <EmptyLotsCard />
    </div>
  )
}

// EmptyLotsCard controls the opt-in cleanup of zero-quantity, non-barcoded lots.
// Off by default: a lot at zero stock is not one the user necessarily wants gone,
// since they may reorder into it. Turning it on unlocks a one-off purge.
function EmptyLotsCard() {
  const [enabled, setEnabled] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    api.getStockSettings().then((s) => { setEnabled(s.delete_empty_lots); setCount(s.empty_lot_count) }).catch(() => {})
  }, [])

  const toggle = async (v: boolean) => {
    setEnabled(v); setMsg(null)
    try {
      const s = await api.updateStockSettings({ delete_empty_lots: v })
      setCount(s.empty_lot_count)
    } catch {
      setEnabled(!v)
    }
  }

  const purge = async () => {
    if (!confirm('Delete every empty lot now? Barcoded and named lots are kept. This cannot be undone.')) return
    setBusy(true); setMsg(null)
    try {
      const r = await api.cleanupEmptyLots()
      setMsg(`Removed ${r.deleted} empty lot${r.deleted === 1 ? '' : 's'}.`)
      const s = await api.getStockSettings()
      setCount(s.empty_lot_count)
    } catch {
      setMsg('Cleanup failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="card-h"><h2>Empty stock lots</h2></div>
      <div style={{ padding: 16 }} className="space-y-4">
        <p className="c-faint" style={{ fontSize: 12.5, lineHeight: 1.5, maxWidth: 640, marginTop: 0 }}>
          When a lot drops to zero, FireBin keeps the row so its history stays intact and you can reorder into it. Turn
          this on to allow purging empty lots. Lots with a barcode or a name are a cut spool or a tracked unit you made
          on purpose, so they are always kept.
        </p>
        <label className="flex items-center gap-2 text-sm c-text" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} onChange={(e) => toggle(e.target.checked)} />
          Allow deleting empty lots
        </label>
        <div className="flex items-center gap-3 flex-wrap">
          <button className="btn danger" disabled={!enabled || busy || count === 0} onClick={purge}>
            {busy ? '…' : 'Purge empty lots now'}
          </button>
          {count != null && (
            <span className="c-faint text-sm">{count} empty lot{count === 1 ? '' : 's'} right now.</span>
          )}
        </div>
        {msg && <p className="c-good text-sm">{msg}</p>}
      </div>
    </div>
  )
}
