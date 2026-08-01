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
  const [overwrite, setOverwrite] = useState(false)
  // Renames keyed by the name the scan found, so re-picking a folder does not
  // lose an edit and two libraries called the same thing under different kinds
  // stay separate.
  const [renames, setRenames] = useState<Map<string, string>>(new Map())

  const supported = browserScanSupported()
  // macOS defaults to the CLI because the browser path cannot work there.
  // Chrome refuses to open ~/Library or /Applications from the directory
  // picker, and on a Mac that is exactly where KiCad keeps its config and its
  // stock libraries. Offering a folder picker that cannot reach either folder
  // reads as a bug in the app rather than a limit of the browser.
  const isMac = /Mac/i.test(navigator.platform ?? '')
  const [mode, setMode] = useState<'browser' | 'cli'>(supported && !isMac ? 'browser' : 'cli')

  const total = picked.reduce((n, p) => n + p.items.length, 0)
  const totalBytes = picked.reduce((n, p) => n + p.items.reduce((m, i) => m + i.source.length, 0), 0)

  // A library's name is the filename it came from, and a file exported from a
  // vendor's site is often called something like 2026-08-01_09-13-46. That name
  // is what KiCad matches on and what you have to recognise in the chooser
  // later, so it is worth fixing before the import rather than after.
  const detected = (() => {
    const groups = new Map<string, { kind: string; lib: string; count: number }>()
    for (const p of picked) {
      for (const it of p.items) {
        const key = `${it.kind}|${it.lib}`
        const g = groups.get(key)
        if (g) g.count++
        else groups.set(key, { kind: it.kind, lib: it.lib, count: 1 })
      }
    }
    return [...groups.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.lib.localeCompare(b.lib))
  })()

  const nameFor = (kind: string, lib: string) => renames.get(`${kind}|${lib}`) ?? lib
  const setNameFor = (kind: string, lib: string, name: string) =>
    setRenames((cur) => new Map(cur).set(`${kind}|${lib}`, name))

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
      let skipped = 0
      for (const batch of batches(all)) {
        const renamed = batch.map((it) => ({ ...it, lib: nameFor(it.kind, it.lib) }))
        const res = await api.uploadKicadBatch(scanID, renamed, overwrite)
        skipped += res.skipped ?? 0
        sent += batch.length
        setStatus(`Uploaded ${sent} of ${all.length}`)
      }
      // Provenance only. The import adds to the index; nothing is removed, so an
      // interrupted upload leaves everything that was already there.
      await api.finishKicadScan(scanID, `${navigator.platform || 'browser'} (browser scan)`)
      setStatus(skipped > 0
        ? `Done. ${all.length - skipped} imported, ${skipped} already in the index and left alone.`
        : `Done. ${all.length} imported.`)
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
          <h3>Import KiCad libraries</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            {icon(mdiClose)}
          </button>
        </div>

        <div className="tabs" style={{ padding: '10px 16px 0' }}>
          <button className={`tab ${mode === 'cli' ? 'on' : ''}`} onClick={() => setMode('cli')}>
            Command line
          </button>
          <button
            className={`tab ${mode === 'browser' ? 'on' : ''}`}
            onClick={() => setMode('browser')}
            disabled={busy}
          >
            From this browser
          </button>
        </div>

        {mode === 'cli' && <CliInstructions isMac={isMac} />}

        {mode === 'browser' && (
        <div className="modal-b" style={{ display: 'grid', gap: 14, fontSize: 13.5 }}>
          {isMac && (
            <div className="banner" style={{ fontSize: 12.5 }}>
              On macOS this will not reach KiCad's own folders. Chrome's directory picker refuses
              to open <span className="mono">~/Library</span> or{' '}
              <span className="mono">/Applications</span>, which is where the config and the stock
              libraries live. It still works for a library you downloaded somewhere else. For a
              full import, use the command line.
            </div>
          )}
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

              {detected.length > 0 && (
                <div>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>3 · Names</div>
                  <p className="c-dim" style={{ margin: '0 0 8px', lineHeight: 1.55 }}>
                    Each library is named after the file it came from. Change any that will not
                    mean anything to you in KiCad's chooser later.
                  </p>
                  <div style={{ display: 'grid', gap: 6, maxHeight: 190, overflowY: 'auto' }}>
                    {detected.map((g) => (
                      <div key={`${g.kind}|${g.lib}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="pill ghost" style={{ fontSize: 11, minWidth: 74, textAlign: 'center' }}>
                          {g.kind === 'symbol' ? 'symbols' : 'footprints'}
                        </span>
                        <input
                          className="input mono"
                          style={{ flex: 1, fontSize: 12.5 }}
                          value={nameFor(g.kind, g.lib)}
                          onChange={(e) => setNameFor(g.kind, g.lib, e.target.value)}
                          disabled={busy}
                        />
                        <span className="c-dim mono" style={{ fontSize: 11.5, minWidth: 34, textAlign: 'right' }}>
                          {g.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {total > 0 && (
                <div className="banner" style={{ fontSize: 12.5 }}>
                  {total} items, {mb(totalBytes)} of source. Importing adds to the index and
                  removes nothing. A symbol or footprint already stored under the same library and
                  name is left as it is unless you tick the box below.
                </div>
              )}

              {total > 0 && (
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5 }}>
                  <input
                    type="checkbox"
                    checked={overwrite}
                    onChange={(e) => setOverwrite(e.target.checked)}
                    disabled={busy}
                    style={{ marginTop: 2 }}
                  />
                  <span>
                    Replace items that are already in the index
                    <span className="c-dim"> — for re-importing a library you have updated.</span>
                  </span>
                </label>
              )}

              {status && <p className="c-dim mono" style={{ margin: 0, fontSize: 12 }}>{status}</p>}
              {error && <p style={{ margin: 0, color: 'var(--crit, #c66)', fontSize: 12.5 }}>{error}</p>}
            </>
          )}
        </div>
        )}

        <div className="modal-f">
          <button className="btn" onClick={onClose} disabled={busy}>
            {mode === 'cli' ? 'Close' : 'Cancel'}
          </button>
          {mode === 'browser' && (
            <button className="btn primary" onClick={upload} disabled={busy || total === 0}>
              {busy ? 'Working…' : `Import ${total || ''} items`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** What to run, and where to get it.
 *
 *  The CLI is the better importer and on macOS it is the only one that works:
 *  it reads sym-lib-table and fp-lib-table and follows them wherever they
 *  point, instead of being handed folders one at a time. */
function CliInstructions({ isMac }: { isMac: boolean }) {
  const apiURL = window.location.origin
  const [copied, setCopied] = useState<string | null>(null)
  const run = `kicad-index -api ${apiURL} -token fbin_pat_…`

  const copy = (what: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(what)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  const Cmd = ({ id, text }: { id: string; text: string }) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
      <code
        className="mono"
        style={{
          flex: 1, padding: '8px 10px', fontSize: 12, lineHeight: 1.5,
          background: 'var(--bg-sunk, rgba(0,0,0,0.22))', borderRadius: 6,
          border: '1px solid var(--border)', overflowX: 'auto', whiteSpace: 'pre',
        }}
      >
        {text}
      </code>
      <button className="btn sm" style={{ flexShrink: 0 }} onClick={() => copy(id, text)}>
        {copied === id ? 'Copied' : 'Copy'}
      </button>
    </div>
  )

  return (
    <div className="modal-b" style={{ display: 'grid', gap: 14, fontSize: 13.5 }}>
      <p className="c-dim" style={{ margin: 0, lineHeight: 1.6 }}>
        {isMac
          ? 'On macOS this is the only path that reaches KiCad\'s own folders. '
          : ''}
        <span className="mono">kicad-index</span> reads{' '}
        <span className="mono">sym-lib-table</span> and <span className="mono">fp-lib-table</span>{' '}
        and follows them wherever they point, so every library KiCad knows about comes across
        under the name KiCad knows it by.
      </p>

      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>1 · Get it</div>
        <p className="c-dim" style={{ margin: '0 0 8px', lineHeight: 1.55 }}>
          A build for macOS, Linux and Windows is attached to each release. With Go installed you
          can skip the download.
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          <a
            className="btn sm"
            href="https://github.com/FireBall1725/firebin-kicad/releases/latest"
            target="_blank"
            rel="noreferrer noopener"
            style={{ justifySelf: 'start' }}
          >
            Download from GitHub releases
          </a>
          <Cmd id="install" text="go install github.com/FireBall1725/firebin-kicad/cmd/kicad-index@latest" />
        </div>
      </div>

      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>2 · Make a token</div>
        <p className="c-dim" style={{ margin: '0 0 8px', lineHeight: 1.55 }}>
          {/* An import writes to the index, so a viewer token will be rejected
              at the first batch rather than at the end. */}
          Settings → API tokens, on an admin account. It is shown once, so copy it then.
        </p>
        <a className="btn sm" href="/settings?section=tokens" style={{ justifySelf: 'start' }}>
          Open API tokens
        </a>
      </div>

      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>3 · Run it</div>
        <Cmd id="run" text={run} />
        <ul className="c-dim" style={{ margin: '10px 0 0', paddingLeft: 18, lineHeight: 1.7, fontSize: 12.5 }}>
          <li>
            It finds KiCad's shared-support and config folders on its own.{' '}
            <span className="mono">-kicad</span> and <span className="mono">-config</span> override
            that.
          </li>
          <li>
            <span className="mono">-extra-dir ~/Downloads/SomeLib</span> adds a folder KiCad has
            not been told about. Repeatable.
          </li>
          <li>
            <span className="mono">-dry-run</span> reports what it found and uploads nothing. Worth
            running first.
          </li>
          <li>
            An import adds and removes nothing. Something already stored under the same library and
            name is left alone unless you pass <span className="mono">-overwrite</span>.
          </li>
          <li>
            <span className="mono">-names-only</span> skips the source, so there are no previews
            but the upload is a fraction of the size.
          </li>
        </ul>
      </div>
    </div>
  )
}
