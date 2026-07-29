// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useState } from 'react'
import { api } from '../lib/api'
import {
  batches,
  browserScanSupported,
  newScanID,
  pickDirectory,
  readLibTables,
  scanDirectory,
  type ScanItem,
} from '../lib/kicadScan'
import { icon } from '../lib/icons'
import { mdiClose } from '@mdi/js'

type Picked = { name: string; items: ScanItem[] }

function mb(n: number) {
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Import KiCad libraries without installing anything, as an alternative to the
 *  kicad-index CLI. Same endpoints, same result.
 *
 *  The CLI is still the better tool for a repeatable import: it follows the
 *  library tables to wherever they point, while a browser can only read
 *  directories the user hands it. This exists for the one-off case. */
export function KicadScanModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [picked, setPicked] = useState<Picked[]>([])
  const [nicknames, setNicknames] = useState<Map<string, string>>(new Map())
  const [configName, setConfigName] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supported = browserScanSupported()
  const total = picked.reduce((n, p) => n + p.items.length, 0)
  const totalBytes = picked.reduce((n, p) => n + p.items.reduce((m, i) => m + i.source.length, 0), 0)

  const addConfig = async () => {
    const dir = await pickDirectory()
    if (!dir) return
    setBusy(true)
    setError(null)
    try {
      const nick = await readLibTables(dir)
      if (nick.size === 0) {
        setError(`No sym-lib-table or fp-lib-table in "${dir.name}". Pick the KiCad config folder.`)
        return
      }
      setNicknames(nick)
      setConfigName(dir.name)
    } finally {
      setBusy(false)
    }
  }

  const addLibraries = async () => {
    const dir = await pickDirectory()
    if (!dir) return
    setBusy(true)
    setError(null)
    setStatus('Reading…')
    try {
      const items = await scanDirectory(dir, nicknames, (p) => {
        setStatus(`Read ${p.files ?? 0} files, ${p.items ?? 0} items${p.label ? ` — ${p.label}` : ''}`)
      })
      if (items.length === 0) {
        setError(`No .kicad_sym or .kicad_mod files under "${dir.name}".`)
        return
      }
      setPicked((cur) => [...cur.filter((c) => c.name !== dir.name), { name: dir.name, items }])
      setStatus('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that folder.')
    } finally {
      setBusy(false)
    }
  }

  const upload = async () => {
    const all = picked.flatMap((p) => p.items)
    if (all.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const scanID = newScanID()
      let sent = 0
      for (const batch of batches(all)) {
        await api.uploadKicadBatch(scanID, batch)
        sent += batch.length
        setStatus(`Uploaded ${sent} of ${all.length}`)
      }
      // Only now does the new index replace the old one, so an interrupted
      // upload leaves the previous import intact rather than a partial mix.
      await api.finishKicadScan(scanID, `${navigator.platform || 'browser'} (browser scan)`)
      setStatus('Done.')
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>Import KiCad libraries from this browser</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            {icon(mdiClose)}
          </button>
        </div>

        <div className="modal-b" style={{ display: 'grid', gap: 14, fontSize: 13.5 }}>
          {!supported ? (
            <p className="c-dim" style={{ margin: 0, lineHeight: 1.6 }}>
              This browser cannot read local folders. The File System Access API is
              Chromium-only, so use Chrome or Edge, or run the{' '}
              <span className="mono">kicad-index</span> CLI instead.
            </p>
          ) : (
            <>
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>1 · KiCad config folder (recommended)</div>
                <p className="c-dim" style={{ margin: '0 0 8px', lineHeight: 1.55 }}>
                  {/* Nicknames are not cosmetic: a symbol served under the wrong
                      one will not resolve when KiCad goes looking for it. */}
                  Reads <span className="mono">sym-lib-table</span> so libraries keep the names
                  KiCad knows them by. A third-party library lives in a file called
                  SparkFun-Resistor.kicad_sym but is registered as PCM_SparkFun-Resistor, and a
                  symbol served under the wrong name will not resolve.
                </p>
                <button className="btn sm" onClick={addConfig} disabled={busy}>
                  {configName ? `Using ${configName}` : 'Choose config folder…'}
                </button>
                {nicknames.size > 0 && (
                  <span className="c-dim" style={{ marginLeft: 10, fontSize: 12.5 }}>
                    {nicknames.size} library names loaded
                  </span>
                )}
              </div>

              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>2 · Library folders</div>
                <p className="c-dim" style={{ margin: '0 0 8px', lineHeight: 1.55 }}>
                  Add KiCad's shared-support folder for the stock libraries, then your 3rdparty
                  and custom folders. Each is scanned recursively.
                </p>
                <button className="btn sm" onClick={addLibraries} disabled={busy}>
                  Add a folder…
                </button>
                {picked.length > 0 && (
                  <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                    {picked.map((p) => (
                      <li key={p.name} className="c-dim" style={{ fontSize: 12.5 }}>
                        <span className="mono c-text">{p.name}</span> — {p.items.length} items
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {total > 0 && (
                <div className="banner" style={{ fontSize: 12.5 }}>
                  {total} items, {mb(totalBytes)} of source. Uploading replaces the whole index:
                  anything not in this scan is removed, which is how an uninstalled library
                  disappears.
                </div>
              )}

              {status && <p className="c-dim mono" style={{ margin: 0, fontSize: 12 }}>{status}</p>}
              {error && <p style={{ margin: 0, color: 'var(--crit, #c66)', fontSize: 12.5 }}>{error}</p>}
            </>
          )}
        </div>

        <div className="modal-f">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={upload} disabled={busy || total === 0}>
            {busy ? 'Working…' : `Import ${total || ''} items`}
          </button>
        </div>
      </div>
    </div>
  )
}
