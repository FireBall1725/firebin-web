// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useState } from 'react'
import { api, type LabelMedia, type LabelCatalogEntry } from '../lib/api'
import { tapeGeomForMm, dotsPerPt } from '../lib/brotherPtouch'

// Unit helpers: geometry is stored in PDF points (1pt = 1/72").
const ptToIn = (p: number) => p / 72
const ptToMm = (p: number) => (p * 25.4) / 72
const toPt = (v: number, unit: 'in' | 'mm') => (unit === 'in' ? v * 72 : (v * 72) / 25.4)
const round2 = (n: number) => Math.round(n * 100) / 100

// A4-width pages read < 600pt (595.28) vs US Letter 612 — pick the friendlier unit.
function sizeLabel(m: { page_w: number; label_w: number; label_h: number; cols: number; rows: number }): string {
  const metric = m.page_w < 605
  const u = metric ? 'mm' : 'in'
  const w = metric ? ptToMm(m.label_w) : ptToIn(m.label_w)
  const h = metric ? ptToMm(m.label_h) : ptToIn(m.label_h)
  return `${round2(w)} × ${round2(h)} ${u} · ${m.cols}×${m.rows}`
}

export function LabelSheetsSettings() {
  const [media, setMedia] = useState<LabelMedia[]>([])
  const [mode, setMode] = useState<'none' | 'catalog' | 'custom' | 'tape'>('none')
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(() => {
    api.listLabelMedia().then(setMedia).catch(() => setMedia([]))
  }, [])
  useEffect(load, [load])

  const remove = async (m: LabelMedia) => {
    await api.deleteLabelMedia(m.id).catch(() => undefined)
    load()
  }

  const onAdded = (label: string) => {
    setMsg(`Added ${label}.`)
    setMode('none')
    load()
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-h">
        <h2>Label sheets</h2>
      </div>
      <div style={{ padding: 16 }}>
        <p className="c-dim" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.5 }}>
          The sheet stock you print on. Add the Avery sizes you use from the catalogue, or define a custom sheet.
          Cut guides are a property of the paper — leave them off for pre-cut Avery sheets, on for plain full-page
          label stock.
        </p>

        {media.length === 0 && (
          <div className="empty" style={{ fontSize: 13 }}>No sheets yet. Add one below.</div>
        )}

        <div className="space-y-2">
          {media.map((m) => (
            <div key={m.id} className="flex items-center justify-between bd" style={{ borderRadius: 10, padding: '8px 12px' }}>
              <div className="min-w-0">
                <span className="c-text" style={{ fontWeight: 600, fontSize: 13.5 }}>{m.brand} {m.code}</span>
                <span className="c-dim" style={{ marginLeft: 8, fontSize: 12.5 }}>{m.name}</span>
                <div className="c-faint" style={{ fontSize: 12, marginTop: 2 }}>
                  {sizeLabel(m)}
                  {m.cut_guides && <span className="tag" style={{ marginLeft: 8 }}>cut guides</span>}
                </div>
              </div>
              <button onClick={() => remove(m)} className="c-faint" aria-label="Remove sheet"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>✕</button>
            </div>
          ))}
        </div>

        {msg && <p className="c-dim" style={{ fontSize: 12.5, marginTop: 10 }}>{msg}</p>}

        <div className="flex gap-2" style={{ marginTop: 14 }}>
          <button className={`btn sm ${mode === 'catalog' ? 'primary' : ''}`} onClick={() => { setMsg(null); setMode(mode === 'catalog' ? 'none' : 'catalog') }}>
            Add from catalogue
          </button>
          <button className={`btn sm ${mode === 'custom' ? 'primary' : ''}`} onClick={() => { setMsg(null); setMode(mode === 'custom' ? 'none' : 'custom') }}>
            Add custom sheet
          </button>
          <button className={`btn sm ${mode === 'tape' ? 'primary' : ''}`} onClick={() => { setMsg(null); setMode(mode === 'tape' ? 'none' : 'tape') }}>
            Add tape / roll
          </button>
        </div>

        {mode === 'catalog' && <CatalogSearch existing={media} onAdded={onAdded} />}
        {mode === 'custom' && <CustomSheetForm onAdded={onAdded} />}
        {mode === 'tape' && <TapeForm onAdded={onAdded} />}
      </div>
    </div>
  )
}

function CatalogSearch({ existing, onAdded }: { existing: LabelMedia[]; onAdded: (label: string) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<LabelCatalogEntry[]>([])
  const [busy, setBusy] = useState(false)
  const have = new Set(existing.map((m) => `${m.brand}|${m.code}`))

  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      api.searchLabelCatalog(q).then((r) => { if (live) setResults(r) }).catch(() => undefined)
    }, 180)
    return () => { live = false; clearTimeout(t) }
  }, [q])

  const add = async (e: LabelCatalogEntry) => {
    setBusy(true)
    try {
      // page_size is catalogue-only; the media API rejects unknown fields.
      const { page_size: _drop, ...geom } = e
      void _drop
      await api.createLabelMedia({ ...geom, cut_guides: false, kind: 'sheet' })
      onAdded(`${e.brand} ${e.code}`)
    } catch {
      // likely a duplicate; ignore
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bd bg-panel2" style={{ borderRadius: 11, padding: 12, marginTop: 12 }}>
      <input className="input" autoFocus placeholder="Search Avery code or type (e.g. 5163, address, shipping)"
        value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 10 }} className="space-y-1">
        {results.map((e) => {
          const owned = have.has(`${e.brand}|${e.code}`)
          return (
            <div key={`${e.brand}-${e.code}`} className="flex items-center justify-between" style={{ padding: '5px 6px' }}>
              <div className="min-w-0">
                <span className="c-text mono" style={{ fontSize: 13, fontWeight: 600 }}>{e.code}</span>
                <span className="c-dim" style={{ marginLeft: 8, fontSize: 12.5 }}>{e.name}</span>
                <span className="c-faint" style={{ marginLeft: 8, fontSize: 12 }}>{sizeLabel(e)}</span>
              </div>
              {owned
                ? <span className="c-faint" style={{ fontSize: 12 }}>added</span>
                : <button className="btn sm" disabled={busy} onClick={() => add(e)}>Add</button>}
            </div>
          )
        })}
        {results.length === 0 && <p className="c-faint" style={{ fontSize: 12.5, padding: 6 }}>No matches.</p>}
      </div>
    </div>
  )
}

// Module-level so it keeps a stable identity across renders (an inner component
// would remount every keystroke and drop input focus).
function TField({ label, value, onChange, ph }: { label: string; value: string; onChange: (v: string) => void; ph?: string }) {
  return (
    <label className="fieldlabel"><span>{label}</span>
      <input className="input" value={value} placeholder={ph} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

const PAGES: Record<string, [number, number]> = {
  'US-Letter': [612, 792],
  'US-Legal': [612, 1008],
  A4: [595.276, 841.89],
  A5: [419.528, 595.276],
}

function CustomSheetForm({ onAdded }: { onAdded: (label: string) => void }) {
  const [unit, setUnit] = useState<'in' | 'mm'>('mm')
  const [page, setPage] = useState('A4')
  const [f, setF] = useState({
    code: '', name: '', lw: '', lh: '', cols: '1', rows: '1',
    mx: '', my: '', px: '', py: '', corner: '0', cutGuides: false,
  })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }))

  const save = async () => {
    const n = (s: string) => parseFloat(s) || 0
    const cols = parseInt(f.cols) || 0
    const rows = parseInt(f.rows) || 0
    if (!f.code.trim() || cols < 1 || rows < 1 || n(f.lw) <= 0 || n(f.lh) <= 0) {
      setErr('Code, label size, and a 1+ column/row grid are required.')
      return
    }
    const [pw, ph] = PAGES[page]
    setBusy(true)
    setErr(null)
    try {
      await api.createLabelMedia({
        brand: 'Custom', code: f.code.trim(), name: f.name.trim() || 'Custom sheet',
        page_w: pw, page_h: ph,
        label_w: toPt(n(f.lw), unit), label_h: toPt(n(f.lh), unit),
        corner_radius: toPt(n(f.corner), unit),
        cols, rows,
        x0: toPt(n(f.mx), unit), y0: toPt(n(f.my), unit),
        pitch_x: toPt(n(f.px), unit), pitch_y: toPt(n(f.py), unit),
        cut_guides: f.cutGuides, kind: 'sheet',
      })
      onAdded(`Custom ${f.code.trim()}`)
    } catch {
      setErr('Could not add (duplicate code?).')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bd bg-panel2" style={{ borderRadius: 11, padding: 12, marginTop: 12 }}>
      <div className="grid grid-cols-2 gap-2">
        <TField label="Code / name" value={f.code} onChange={(v) => set('code', v)} ph="e.g. MY-2x4" />
        <TField label="Description" value={f.name} onChange={(v) => set('name', v)} ph="optional" />
      </div>
      <div className="grid grid-cols-2 gap-2" style={{ marginTop: 8 }}>
        <label className="fieldlabel"><span>Page</span>
          <select className="input" value={page} onChange={(e) => setPage(e.target.value)}>
            {Object.keys(PAGES).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="fieldlabel"><span>Units</span>
          <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as 'in' | 'mm')}>
            <option value="mm">mm</option>
            <option value="in">inches</option>
          </select>
        </label>
      </div>
      <div className="grid grid-cols-4 gap-2" style={{ marginTop: 8 }}>
        <TField label="Label W" value={f.lw} onChange={(v) => set('lw', v)} />
        <TField label="Label H" value={f.lh} onChange={(v) => set('lh', v)} />
        <TField label="Columns" value={f.cols} onChange={(v) => set('cols', v)} />
        <TField label="Rows" value={f.rows} onChange={(v) => set('rows', v)} />
      </div>
      <div className="grid grid-cols-4 gap-2" style={{ marginTop: 8 }}>
        <TField label="Left margin" value={f.mx} onChange={(v) => set('mx', v)} />
        <TField label="Top margin" value={f.my} onChange={(v) => set('my', v)} />
        <TField label="Pitch X" value={f.px} onChange={(v) => set('px', v)} />
        <TField label="Pitch Y" value={f.py} onChange={(v) => set('py', v)} />
      </div>
      <div className="grid grid-cols-2 gap-2" style={{ marginTop: 8, alignItems: 'end' }}>
        <TField label="Corner radius" value={f.corner} onChange={(v) => set('corner', v)} />
        <label className="flex items-center gap-2" style={{ cursor: 'pointer', fontSize: 13, height: 36 }}>
          <input type="checkbox" checked={f.cutGuides} onChange={(e) => set('cutGuides', e.target.checked)} />
          <span className="c-text">Draw cut guides (plain stock)</span>
        </label>
      </div>
      <p className="c-faint" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.5 }}>
        Margins are from the top-left of the page to the first label. Pitch is centre-to-centre spacing between labels.
      </p>
      {err && <p className="c-crit" style={{ fontSize: 12.5, marginTop: 8 }}>{err}</p>}
      <div className="flex justify-end" style={{ marginTop: 10 }}>
        <button className="btn sm primary" disabled={busy} onClick={save}>Add sheet</button>
      </div>
    </div>
  )
}

// Common Brother TZe tape widths (mm).
const TAPE_WIDTHS = [3.5, 6, 9, 12, 18, 24]

// TapeForm creates a continuous-tape / roll medium (e.g. a Brother TZe 12mm tape):
// one label per page, a chosen length long. Stored as a 1x1 sheet with kind='roll'.
// The stored height is the tape's PRINTABLE band, not the physical width: a P-touch
// only burns the middle dots of the head (12mm tape = 70 of 128 dots ≈ 9.9mm), so
// the design canvas maps 1:1 to what actually prints. Printed straight to a Brother
// P-touch over WebUSB (no driver) from the Label designer.
function TapeForm({ onAdded }: { onAdded: (label: string) => void }) {
  const [width, setWidth] = useState('12')
  const [length, setLength] = useState('40')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const add = async () => {
    setErr(null)
    const w = Number(width), l = Number(length)
    if (!(w > 0) || !(l > 0)) { setErr('Enter a tape width and length'); return }
    // Height = the printable dot band for this tape, converted to points, so the
    // canvas the designer draws on is exactly the printer's printable area.
    const printableDots = tapeGeomForMm(Math.round(w)).printable
    const hPt = printableDots / dotsPerPt
    const lPt = toPt(l, 'mm')
    setBusy(true)
    try {
      await api.createLabelMedia({
        brand: 'Brother', code: `TZe${w}-${l}`, name: `${w}mm tape × ${l}mm`,
        page_w: lPt, page_h: hPt, label_w: lPt, label_h: hPt,
        corner_radius: 0, cols: 1, rows: 1, x0: 0, y0: 0, pitch_x: lPt, pitch_y: hPt,
        cut_guides: false, kind: 'roll',
      })
      onAdded(`Brother TZe ${w}mm × ${l}mm`)
    } catch {
      setErr('Could not add (already have this width and length?)')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 12 }} className="space-y-3">
      <p className="c-faint" style={{ fontSize: 12, lineHeight: 1.5 }}>
        Continuous tape for a Brother P-touch (TZe). One label per cut, as long as you choose.
        Design it in the Label designer, then use Print to Brother to send it straight to the printer over USB — no driver needed.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="fieldlabel"><span>Tape width</span>
          <select className="input" value={width} onChange={(e) => setWidth(e.target.value)}>
            {TAPE_WIDTHS.map((w) => <option key={w} value={w}>{w} mm</option>)}
          </select>
        </label>
        <label className="fieldlabel"><span>Label length (mm)</span>
          <input className="input" type="number" value={length} onChange={(e) => setLength(e.target.value)} />
        </label>
        <button className="btn primary" onClick={add} disabled={busy}>{busy ? '…' : 'Add tape'}</button>
      </div>
      {err && <p className="c-crit text-sm">{err}</p>}
    </div>
  )
}
