// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Where datasheet files come from and how much room they are allowed.
//
// The auto-mirror toggle is the important one and it ships off. Enrichment
// providers regularly hand back a datasheet in a language you cannot read, and
// downloading every one of those silently is how a volume fills with documents
// nobody asked for. With it off the URL is still recorded and each part offers a
// Save a copy button, so the choice stays with the person looking at the part.

import { useEffect, useState } from 'react'
import { api, type DatasheetSettings as Settings } from '../lib/api'

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const SIZE_CHOICES = [16, 32, 64, 128, 256]

export function DatasheetSettings() {
  const [s, setS] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = () => {
    api.getDatasheetSettings().then(setS).catch(() => setErr('Could not load datasheet settings.'))
  }
  useEffect(load, [])

  const save = async (body: { auto_mirror?: boolean; extract_text?: boolean; max_bytes?: number }) => {
    const before = s
    // Optimistic, then reconciled with what the server actually stored: a toggle
    // that lags a round trip feels broken, and a rejected one has to snap back.
    if (s) setS({ ...s, ...body })
    setErr(null)
    try {
      setS(await api.updateDatasheetSettings(body))
    } catch {
      setS(before)
      setErr('Could not save that setting.')
    }
  }

  const extractPending = async () => {
    setBusy(true)
    setMsg(null)
    setErr(null)
    try {
      const { task_id, datasheets } = await api.extractPendingDatasheets()
      if (!task_id) {
        setMsg('Nothing to read; every datasheet has already been processed.')
        return
      }
      setMsg(`Reading ${datasheets} datasheet${datasheets === 1 ? '' : 's'}…`)
      for (let i = 0; i < 900; i++) {
        await new Promise((r) => setTimeout(r, 700))
        const t = await api.getTask(task_id)
        if (t.status === 'completed') {
          const r = (t.result ?? {}) as { read?: number; scans?: number; failed?: number }
          setMsg(`Read ${r.read ?? 0}. ${r.scans ?? 0} are scans with no text layer, ${r.failed ?? 0} failed.`)
          break
        }
        if (t.status === 'failed' || t.status === 'cancelled') {
          setErr('Extraction stopped. See Activity for the log.')
          break
        }
      }
    } catch {
      setErr('Could not start extraction.')
    } finally {
      setBusy(false)
      load()
    }
  }

  if (!s) {
    return (
      <div className="card">
        <div className="card-h"><h2>Datasheets</h2></div>
        <div style={{ padding: 16 }}>
          <p className="c-faint text-sm" style={{ margin: 0 }}>{err ?? 'Loading…'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-h"><h2>Datasheets</h2></div>
      <div style={{ padding: 16 }} className="space-y-4">
        <div className="ds-set-stats">
          <div>
            <div className="eyebrow">Stored</div>
            <div className="ds-set-val">{s.count}</div>
          </div>
          <div>
            <div className="eyebrow">On disk</div>
            <div className="ds-set-val">{prettyBytes(s.total_bytes)}</div>
          </div>
          <div>
            <div className="eyebrow">Unlinked</div>
            <div className="ds-set-val">{s.unlinked}</div>
          </div>
          <div>
            <div className="eyebrow">Not mirrored</div>
            <div className="ds-set-val">{s.mirror_candidates}</div>
          </div>
        </div>

        <p className="c-faint" style={{ fontSize: 12.5, lineHeight: 1.5, maxWidth: 640, marginTop: 0 }}>
          Files are kept on the server at <code className="mono">{s.storage_path}</code>, not in the database. They do
          not travel in the JSON export, so that directory needs its own backup; a restore reconnects to whatever is
          still there.
        </p>

        <label className="flex items-start gap-2 text-sm c-text" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={s.auto_mirror}
            onChange={(e) => save({ auto_mirror: e.target.checked })}
            style={{ marginTop: 3 }}
          />
          <span>
            Save a copy automatically during enrichment
            <span className="c-faint" style={{ display: 'block', fontSize: 12, marginTop: 2, maxWidth: 560 }}>
              Off by default. Suppliers often return a datasheet in a language you do not read, and each one is
              typically 1–20 MB. With this off the link is still recorded and you can save any datasheet yourself from
              the part.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm c-text" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={s.extract_text}
            onChange={(e) => save({ extract_text: e.target.checked })}
            style={{ marginTop: 3 }}
          />
          <span>
            Read the text out of stored datasheets
            <span className="c-faint" style={{ display: 'block', fontSize: 12, marginTop: 2, maxWidth: 560 }}>
              Needed for the assistant to answer questions about a datasheet. The text is kept beside the PDF and is
              small next to it; deleting it only costs the ability to search, and it can be read again at any time.
            </span>
          </span>
        </label>

        <div>
          <div className="text-sm c-text" style={{ marginBottom: 6 }}>Largest datasheet to accept</div>
          <div className="seg ds-set-sizes">
            {SIZE_CHOICES.map((mb) => (
              <button
                key={mb}
                className={`seg-btn ${s.max_bytes === mb * 1024 * 1024 ? 'on' : ''}`}
                onClick={() => save({ max_bytes: mb * 1024 * 1024 })}
              >
                {mb} MB
              </button>
            ))}
          </div>
          <p className="c-faint" style={{ fontSize: 12, marginTop: 6, marginBottom: 0, maxWidth: 560 }}>
            Applies to uploads and to downloads. A large reference manual can exceed 20 MB, so this is a guard against
            a mistake rather than a budget.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap bd-t" style={{ paddingTop: 14 }}>
          <button className="btn" disabled={busy} onClick={extractPending}>
            {busy ? 'Reading…' : 'Read any datasheets still pending'}
          </button>
          <span className="c-faint text-sm">
            Run this after re-enabling text extraction, or if you cleared the extracted text.
          </span>
        </div>

        {msg && <p className="c-good text-sm" style={{ margin: 0 }}>{msg}</p>}
        {err && <p className="c-crit text-sm" style={{ margin: 0 }}>{err}</p>}
      </div>
    </div>
  )
}
