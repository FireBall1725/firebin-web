// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import LZString from 'lz-string'
import { api, type ProjectAsset, type BOMLine } from '../lib/api'

// Minimal shape of the iBOM `pcbdata` we render from.
interface Pcb {
  edges_bbox: { minx: number; miny: number; maxx: number; maxy: number }
  edges: Edge[]
  footprints: Footprint[]
  metadata?: { title?: string; revision?: string }
}
type Edge =
  | { type: 'segment'; start: [number, number]; end: [number, number] }
  | { type: 'arc'; start: [number, number]; radius: number; startangle: number; endangle: number }
  | { type: 'circle'; start: [number, number]; radius: number }
  | { type: string; [k: string]: unknown }
interface Footprint {
  ref: string
  layer: 'F' | 'B'
  bbox: { pos: [number, number]; size: [number, number]; angle: number }
}

// parseIbom pulls the compressed pcbdata out of an iBOM HTML file.
function parseIbom(html: string): Pcb | null {
  try {
    const m = html.match(/var\s+pcbdata\s*=\s*JSON\.parse\(\s*LZString\.decompressFromBase64\(\s*"([^"]*)"/)
    if (m) {
      const json = LZString.decompressFromBase64(m[1])
      if (json) return JSON.parse(json) as Pcb
    }
    // Fallback: uncompressed `var pcbdata = {…}`.
    const start = html.search(/var\s+pcbdata\s*=\s*\{/)
    if (start >= 0) {
      const open = html.indexOf('{', start)
      let depth = 0
      for (let i = open; i < html.length; i++) {
        if (html[i] === '{') depth++
        else if (html[i] === '}' && --depth === 0) return JSON.parse(html.slice(open, i + 1)) as Pcb
      }
    }
  } catch {
    // fall through
  }
  return null
}

const DPR = () => Math.min(window.devicePixelRatio || 1, 2)

// IBomViewer renders the interactive BOM natively: FireBin's own BOM table (with
// inventory links) beside a canvas board view. Selecting a row highlights that
// part on the board; the board data comes from the uploaded iBOM's pcbdata.
export function IBomViewer({ asset, onClose }: { asset: ProjectAsset; onClose: () => void }) {
  const [pcb, setPcb] = useState<Pcb | null>(null)
  const [lines, setLines] = useState<BOMLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selId, setSelId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api
      .assetBlob(asset.id)
      .then((b) => b.text())
      .then((text) => {
        const p = parseIbom(text)
        if (!p) setError('Could not read the iBOM data.')
        else setPcb(p)
      })
      .catch(() => setError('Could not load the iBOM.'))
    if (asset.board_id) {
      api.getBoard(asset.board_id).then((b) => setLines(b.lines ?? [])).catch(() => undefined)
    }
  }, [asset.id, asset.board_id])

  // ref (uppercase) → footprint, for highlight lookup by BOM row.
  const byRef = useMemo(() => {
    const m = new Map<string, Footprint>()
    for (const f of pcb?.footprints ?? []) m.set(f.ref.toUpperCase(), f)
    return m
  }, [pcb])

  const selectedRefs = useMemo(() => {
    const line = lines.find((l) => l.id === selId)
    if (!line) return new Set<string>()
    return new Set(line.refs.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))
  }, [lines, selId])

  // Draw the board whenever data, selection, or size changes.
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap || !pcb) return

    const draw = () => {
      const cssW = wrap.clientWidth
      const cssH = wrap.clientHeight
      const dpr = DPR()
      canvas.width = cssW * dpr
      canvas.height = cssH * dpr
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
      const ctx = canvas.getContext('2d')
      if (ctx) drawBoard(ctx, pcb, byRef, selectedRefs, cssW, cssH, dpr)
    }

    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [pcb, byRef, selectedRefs])

  return (
    <div className="overlay" onClick={onClose}>
      <div className="viewer ibom-viewer" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3 className="truncate">
            Interactive BOM{pcb?.metadata?.title ? ` · ${pcb.metadata.title}` : ''}
          </h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="ibom-body">
          <div className="ibom-bom">
            {error && <p className="c-crit p-4 text-sm">{error}</p>}
            <table className="tbl">
              <thead>
                <tr><th className="num" style={{ width: 40 }}>Qty</th><th>Refs</th><th>Value</th><th>Inventory</th></tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr
                    key={l.id}
                    className={`ibom-row ${selId === l.id ? 'on' : ''}`}
                    onMouseEnter={() => setSelId(l.id)}
                    onClick={() => setSelId(l.id)}
                  >
                    <td className="num c-text">{l.quantity}</td>
                    <td className="mono c-dim" style={{ fontSize: 11.5 }}>{l.refs}</td>
                    <td className="c-text" style={{ fontSize: 12.5 }}>{l.value || '—'}</td>
                    <td>
                      {l.part_id ? (
                        <Link to={`/parts/${l.part_id}`} className="pill ok" style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                          in stock ↗
                        </Link>
                      ) : (
                        <span className="c-faint" style={{ fontSize: 11 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ibom-canvas" ref={wrapRef}>
            {!pcb && !error && <p className="c-faint" style={{ padding: 24 }}>Rendering board…</p>}
            <canvas ref={canvasRef} />
          </div>
        </div>
      </div>
    </div>
  )
}

// drawBoard renders the outline and footprint boxes, highlighting selected refs.
function drawBoard(
  ctx: CanvasRenderingContext2D,
  pcb: Pcb,
  byRef: Map<string, Footprint>,
  selected: Set<string>,
  cssW: number,
  cssH: number,
  dpr: number,
) {
  const css = getComputedStyle(document.documentElement)
  const accent = (css.getPropertyValue('--accent') || '#f5a524').trim()
  const outline = '#8a94a6'
  const front = 'rgba(96,165,250,0.5)'
  const back = 'rgba(244,114,182,0.45)'

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssW, cssH)

  const bb = pcb.edges_bbox
  const bw = Math.max(1e-6, bb.maxx - bb.minx)
  const bh = Math.max(1e-6, bb.maxy - bb.miny)
  const pad = 18
  const scale = Math.min((cssW - pad * 2) / bw, (cssH - pad * 2) / bh)
  const ox = (cssW - bw * scale) / 2 - bb.minx * scale
  const oy = (cssH - bh * scale) / 2 - bb.miny * scale
  const tx = (x: number) => x * scale + ox
  const ty = (y: number) => y * scale + oy

  // Board outline.
  ctx.strokeStyle = outline
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  for (const e of pcb.edges) {
    ctx.beginPath()
    if (e.type === 'segment' && 'start' in e && 'end' in e) {
      const s = e as Extract<Edge, { type: 'segment' }>
      ctx.moveTo(tx(s.start[0]), ty(s.start[1]))
      ctx.lineTo(tx(s.end[0]), ty(s.end[1]))
    } else if (e.type === 'arc' && 'start' in e) {
      const a = e as Extract<Edge, { type: 'arc' }>
      const a1 = (a.startangle * Math.PI) / 180
      const a2 = (a.endangle * Math.PI) / 180
      ctx.arc(tx(a.start[0]), ty(a.start[1]), a.radius * scale, a1, a2, a.startangle > a.endangle)
    } else if (e.type === 'circle' && 'start' in e) {
      const c = e as Extract<Edge, { type: 'circle' }>
      ctx.arc(tx(c.start[0]), ty(c.start[1]), c.radius * scale, 0, Math.PI * 2)
    }
    ctx.stroke()
  }

  // Footprints, highlighted last so they sit on top.
  const drawFp = (f: Footprint, hi: boolean) => {
    const { pos, size, angle } = f.bbox
    ctx.save()
    ctx.translate(tx(pos[0]), ty(pos[1]))
    ctx.rotate((-angle * Math.PI) / 180)
    const w = Math.max(2, size[0] * scale)
    const h = Math.max(2, size[1] * scale)
    if (hi) {
      ctx.fillStyle = accent
      ctx.globalAlpha = 0.25
      ctx.fillRect(-w / 2, -h / 2, w, h)
      ctx.globalAlpha = 1
      ctx.strokeStyle = accent
      ctx.lineWidth = 2
    } else {
      ctx.strokeStyle = f.layer === 'B' ? back : front
      ctx.lineWidth = 1
    }
    ctx.strokeRect(-w / 2, -h / 2, w, h)
    ctx.restore()
  }

  for (const f of pcb.footprints) if (!selected.has(f.ref.toUpperCase())) drawFp(f, false)
  for (const ref of selected) {
    const f = byRef.get(ref)
    if (f) drawFp(f, true)
  }
}
