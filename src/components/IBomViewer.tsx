// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import LZString from 'lz-string'
import { api, type ProjectAsset, type BOMLine } from '../lib/api'

// Loose shapes of the iBOM `pcbdata` we render from (pads/drawings are varied,
// so they're typed permissively and guarded at draw time).
interface Pcb {
  edges_bbox: { minx: number; miny: number; maxx: number; maxy: number }
  edges: Drawing[]
  drawings: { silkscreen?: { F?: Drawing[]; B?: Drawing[] } }
  footprints: Footprint[]
  metadata?: { title?: string }
}
type Drawing = Record<string, unknown>
interface Footprint {
  ref: string
  layer: 'F' | 'B'
  bbox: { pos: [number, number]; size: [number, number]; angle: number }
  pads?: Pad[]
}
interface Pad {
  pos: [number, number]
  size: [number, number]
  angle: number
  shape: string
  radius?: number
  type: string
  drillshape?: string
  drillsize?: [number, number]
  offset?: [number, number]
  polygons?: number[][][]
  layers?: string[]
}

function parseIbom(html: string): Pcb | null {
  try {
    const m = html.match(/var\s+pcbdata\s*=\s*JSON\.parse\(\s*LZString\.decompressFromBase64\(\s*"([^"]*)"/)
    if (m) {
      const json = LZString.decompressFromBase64(m[1])
      if (json) return JSON.parse(json) as Pcb
    }
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
const placedKey = (boardID: string) => `firebin.placed.${boardID}`

// IBomViewer renders the interactive BOM natively: FireBin's BOM table (with
// inventory links + a placed checkbox) beside a canvas board render — board
// outline, silkscreen, and pads. Selecting a row highlights that part; checking
// "placed" dims it on the board and persists per board.
export function IBomViewer({ asset, onClose }: { asset: ProjectAsset; onClose: () => void }) {
  const boardID = asset.board_id ?? ''
  const [pcb, setPcb] = useState<Pcb | null>(null)
  const [lines, setLines] = useState<BOMLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selId, setSelId] = useState<string | null>(null)
  const [placed, setPlaced] = useState<Set<string>>(new Set())
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
    if (boardID) api.getBoard(boardID).then((b) => setLines(b.lines ?? [])).catch(() => undefined)
  }, [asset.id, boardID])

  // Load persisted "placed" checkmarks for this board.
  useEffect(() => {
    if (!boardID) return
    try {
      const saved = JSON.parse(localStorage.getItem(placedKey(boardID)) || '[]')
      if (Array.isArray(saved)) setPlaced(new Set(saved))
    } catch {
      // ignore malformed storage
    }
  }, [boardID])

  const togglePlaced = useCallback((lineID: string) => {
    setPlaced((prev) => {
      const next = new Set(prev)
      if (next.has(lineID)) next.delete(lineID)
      else next.add(lineID)
      if (boardID) {
        try {
          localStorage.setItem(placedKey(boardID), JSON.stringify([...next]))
        } catch {
          // storage full/unavailable — checkmarks just won't persist
        }
      }
      return next
    })
  }, [boardID])

  const byRef = useMemo(() => {
    const m = new Map<string, Footprint>()
    for (const f of pcb?.footprints ?? []) m.set(f.ref.toUpperCase(), f)
    return m
  }, [pcb])

  const refsOf = (line: BOMLine | undefined) =>
    new Set((line?.refs ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))

  const selectedRefs = useMemo(() => refsOf(lines.find((l) => l.id === selId)), [lines, selId])
  const placedRefs = useMemo(() => {
    const s = new Set<string>()
    for (const l of lines) if (placed.has(l.id)) for (const r of refsOf(l)) s.add(r)
    return s
  }, [lines, placed])

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
      if (ctx) drawBoard(ctx, pcb, byRef, selectedRefs, placedRefs, cssW, cssH, dpr)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [pcb, byRef, selectedRefs, placedRefs])

  const placedCount = lines.filter((l) => placed.has(l.id)).length

  return (
    <div className="overlay" onClick={onClose}>
      <div className="viewer ibom-viewer" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3 className="truncate">Interactive BOM{pcb?.metadata?.title ? ` · ${pcb.metadata.title}` : ''}</h3>
          {lines.length > 0 && (
            <span className="pill ghost" style={{ marginLeft: 10 }}>{placedCount}/{lines.length} placed</span>
          )}
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="ibom-body">
          <div className="ibom-bom">
            {error && <p className="c-crit p-4 text-sm">{error}</p>}
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 34 }} title="Placed"></th>
                  <th className="num" style={{ width: 34 }}>Qty</th>
                  <th>Refs</th>
                  <th>Value</th>
                  <th>Inventory</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr
                    key={l.id}
                    className={`ibom-row ${selId === l.id ? 'on' : ''} ${placed.has(l.id) ? 'placed' : ''}`}
                    onMouseEnter={() => setSelId(l.id)}
                    onClick={() => setSelId(l.id)}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={placed.has(l.id)} onChange={() => togglePlaced(l.id)} aria-label={`Placed ${l.refs}`} />
                    </td>
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

// ── Canvas rendering ─────────────────────────────────────────────────────────

function drawBoard(
  ctx: CanvasRenderingContext2D,
  pcb: Pcb,
  byRef: Map<string, Footprint>,
  selected: Set<string>,
  placed: Set<string>,
  cssW: number,
  cssH: number,
  dpr: number,
) {
  const accent = (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#f5a524').trim()
  const silkColor = 'rgba(214,218,226,0.72)'
  const padColor = '#b58e4c'
  const holeColor = '#0b0e13'
  const edgeColor = '#6b7280'

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssW, cssH)

  const bb = pcb.edges_bbox
  const bw = Math.max(1e-6, bb.maxx - bb.minx)
  const bh = Math.max(1e-6, bb.maxy - bb.miny)
  const pad = 18
  const scale = Math.min((cssW - pad * 2) / bw, (cssH - pad * 2) / bh)
  const ox = (cssW - bw * scale) / 2 - bb.minx * scale
  const oy = (cssH - bh * scale) / 2 - bb.miny * scale

  // Work in board millimetres; line widths are then in mm too.
  ctx.save()
  ctx.translate(ox, oy)
  ctx.scale(scale, scale)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Board outline.
  ctx.strokeStyle = edgeColor
  ctx.lineWidth = 0.15
  for (const e of pcb.edges) strokeDrawing(ctx, e)

  // Silkscreen (front).
  ctx.strokeStyle = silkColor
  ctx.fillStyle = silkColor
  for (const s of pcb.drawings?.silkscreen?.F ?? []) drawSilk(ctx, s)

  // Pads (placed footprints dimmed).
  for (const f of pcb.footprints) {
    ctx.globalAlpha = placed.has(f.ref.toUpperCase()) ? 0.22 : 1
    for (const p of f.pads ?? []) drawPad(ctx, p, padColor, holeColor)
  }
  ctx.globalAlpha = 1

  // Highlight selected footprints (bounding box).
  ctx.strokeStyle = accent
  ctx.lineWidth = 2 / scale
  for (const ref of selected) {
    const f = byRef.get(ref)
    if (!f) continue
    const { pos, size, angle } = f.bbox
    ctx.save()
    ctx.translate(pos[0], pos[1])
    ctx.rotate((-angle * Math.PI) / 180)
    ctx.fillStyle = accent
    ctx.globalAlpha = 0.22
    ctx.fillRect(-size[0] / 2, -size[1] / 2, size[0], size[1])
    ctx.globalAlpha = 1
    ctx.strokeRect(-size[0] / 2, -size[1] / 2, size[0], size[1])
    ctx.restore()
  }

  ctx.restore()
}

// strokeDrawing renders an outline drawing (board edge or silk stroke).
function strokeDrawing(ctx: CanvasRenderingContext2D, d: Drawing) {
  const t = d.type as string | undefined
  if (t === 'segment' && d.start && d.end) {
    const s = d.start as number[], e = d.end as number[]
    ctx.beginPath()
    ctx.moveTo(s[0], s[1])
    ctx.lineTo(e[0], e[1])
    ctx.stroke()
  } else if (t === 'arc' && d.start) {
    const c = d.start as number[]
    const a1 = ((d.startangle as number) * Math.PI) / 180
    const a2 = ((d.endangle as number) * Math.PI) / 180
    ctx.beginPath()
    ctx.arc(c[0], c[1], d.radius as number, a1, a2, (d.startangle as number) > (d.endangle as number))
    ctx.stroke()
  } else if (t === 'circle' && d.start) {
    const c = d.start as number[]
    ctx.beginPath()
    ctx.arc(c[0], c[1], d.radius as number, 0, Math.PI * 2)
    ctx.stroke()
  }
}

// drawSilk renders a silkscreen item: strokes, filled polygons, and text (which
// iBOM stores as an SVG path).
function drawSilk(ctx: CanvasRenderingContext2D, d: Drawing) {
  const t = d.type as string | undefined
  if (typeof d.svgpath === 'string') {
    // Text / curved graphics as an SVG path stroke.
    ctx.lineWidth = (d.thickness as number) || 0.1
    ctx.stroke(new Path2D(d.svgpath))
    return
  }
  if (t === 'polygon' && Array.isArray(d.polygons)) {
    const pos = (d.pos as number[]) || [0, 0]
    const angle = ((d.angle as number) || 0) * (Math.PI / 180)
    ctx.save()
    ctx.translate(pos[0], pos[1])
    ctx.rotate(angle)
    for (const poly of d.polygons as number[][][]) {
      ctx.beginPath()
      poly.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])))
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
    return
  }
  ctx.lineWidth = (d.width as number) || 0.12
  strokeDrawing(ctx, d)
}

// drawPad fills a pad in its shape, punching a drill hole for through-hole pads.
function drawPad(ctx: CanvasRenderingContext2D, p: Pad, padColor: string, holeColor: string) {
  const [w, h] = p.size
  ctx.save()
  ctx.translate(p.pos[0], p.pos[1])
  ctx.rotate((-p.angle * Math.PI) / 180)
  ctx.fillStyle = padColor
  padPath(ctx, p, w, h)
  ctx.fill()
  if (p.type === 'th' && p.drillsize) {
    ctx.fillStyle = holeColor
    ctx.beginPath()
    if (p.drillshape === 'oval') roundRect(ctx, -p.drillsize[0] / 2, -p.drillsize[1] / 2, p.drillsize[0], p.drillsize[1], Math.min(p.drillsize[0], p.drillsize[1]) / 2)
    else ctx.arc(0, 0, p.drillsize[0] / 2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function padPath(ctx: CanvasRenderingContext2D, p: Pad, w: number, h: number) {
  ctx.beginPath()
  if (p.shape === 'circle') {
    ctx.arc(0, 0, w / 2, 0, Math.PI * 2)
  } else if (p.shape === 'oval') {
    roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) / 2)
  } else if (p.shape === 'roundrect') {
    roundRect(ctx, -w / 2, -h / 2, w, h, p.radius ?? Math.min(w, h) * 0.25)
  } else if (p.shape === 'custom' && p.polygons) {
    for (const poly of p.polygons) poly.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])))
  } else {
    ctx.rect(-w / 2, -h / 2, w, h)
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2))
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}
