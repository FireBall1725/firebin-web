// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Symbol picker over the bundled electronic-symbols set (public/symbols/,
// MIT © Chris Pikul) plus an "upload your own image" option. A picked symbol is
// a "/symbols/<name>.svg" path; an upload is handed back as a File for the caller
// to POST once the part exists.

import { useEffect, useMemo, useState } from 'react'
import { CATEGORY_COLOR } from '../lib/symbols'
import { icon } from '../lib/icons'
import { mdiClose } from '@mdi/js'

interface SymbolMeta {
  id: string
  name: string
  category: string
  standard: string // COMMON | IEEE | IEC
  filename: string
}

export function symbolSrc(filename: string): string {
  return `/symbols/${filename}.svg`
}

// Bundled symbols use stroke="currentColor", so inlining the SVG and setting the
// container's `color` tints them (and stays theme-aware). We fetch each once and
// cache the markup. Uploaded photos render as a plain image so their real colours
// survive.
const svgCache = new Map<string, string>()

export function PartGraphic({ src, color, size = 24 }: { src: string; color?: string; size?: number }) {
  const isSymbol = src.startsWith('/symbols/')
  const [markup, setMarkup] = useState<string>(() => (isSymbol ? svgCache.get(src) ?? '' : ''))

  useEffect(() => {
    if (!isSymbol) return
    const cached = svgCache.get(src)
    if (cached !== undefined) { setMarkup(cached); return }
    let alive = true
    fetch(src)
      .then((r) => (r.ok ? r.text() : ''))
      .then((t) => { svgCache.set(src, t); if (alive) setMarkup(t) })
      .catch(() => undefined)
    return () => { alive = false }
  }, [src, isSymbol])

  if (isSymbol) {
    return (
      <span
        aria-hidden
        className="part-graphic"
        style={{ display: 'inline-flex', width: size, height: size, color: color ?? 'currentColor' }}
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    )
  }
  return <img src={src} alt="" style={{ width: size, height: size, objectFit: 'contain' }} />
}

export function SymbolPicker({
  onPick,
  onUpload,
  onClose,
}: {
  onPick: (src: string) => void
  onUpload: (file: File) => void
  onClose: () => void
}) {
  const [all, setAll] = useState<SymbolMeta[]>([])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')

  useEffect(() => {
    fetch('/symbols/manifest.json')
      .then((r) => r.json())
      .then((d: SymbolMeta[]) => setAll(d))
      .catch(() => setAll([]))
  }, [])

  const cats = useMemo(() => Array.from(new Set(all.map((s) => s.category))).sort(), [all])
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all.filter(
      (s) =>
        (!cat || s.category === cat) &&
        (!needle || s.name.toLowerCase().includes(needle) || s.category.toLowerCase().includes(needle)),
    )
  }, [all, q, cat])

  return (
    <div className="overlay">
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>Choose a symbol</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            {icon(mdiClose)}
          </button>
        </div>
        <div className="modal-b">
          <input className="input" placeholder="Search symbols…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="flex flex-wrap gap-2" style={{ margin: '10px 0 12px' }}>
            <button type="button" className={`chipbtn ${cat === '' ? 'on' : ''}`} onClick={() => setCat('')}>All</button>
            {cats.map((c) => (
              <button type="button" key={c} className={`chipbtn ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}
                style={cat === c ? undefined : { color: CATEGORY_COLOR[c] }}>
                {c}
              </button>
            ))}
          </div>
          <div className="sym-grid">
            {shown.map((s) => (
              <button
                type="button"
                key={s.id}
                className="sym-cell"
                title={s.standard ? `${s.name} · ${s.standard}` : s.name}
                onClick={() => { onPick(symbolSrc(s.filename)); onClose() }}
              >
                <PartGraphic src={symbolSrc(s.filename)} color={CATEGORY_COLOR[s.category] ?? 'currentColor'} size={40} />
                <span className="sym-name">{s.name}</span>
              </button>
            ))}
            {all.length > 0 && shown.length === 0 && <p className="c-faint" style={{ gridColumn: '1 / -1' }}>No symbols match.</p>}
          </div>
        </div>
        <div className="modal-f" style={{ justifyContent: 'space-between' }}>
          <label className="btn">
            Upload image…
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { onUpload(f); onClose() } }}
            />
          </label>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
