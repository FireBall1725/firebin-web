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
type Side = 'F' | 'B'
interface Footprint {
  ref: string
  layer: Side
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
  layers?: string[]
  polygons?: number[][][]
}
interface View { scale: number; ox: number; oy: number }

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

function fitView(bb: Pcb['edges_bbox'], cssW: number, cssH: number): View {
  const bw = Math.max(1e-6, bb.maxx - bb.minx)
  const bh = Math.max(1e-6, bb.maxy - bb.miny)
  const pad = 24
  const scale = Math.min((cssW - pad * 2) / bw, (cssH - pad * 2) / bh)
  return { scale, ox: (cssW - bw * scale) / 2 - bb.minx * scale, oy: (cssH - bh * scale) / 2 - bb.miny * scale }
}

// IBomViewer renders the interactive BOM natively: FireBin's BOM table beside a
// canvas board render (outline, silkscreen, pads) with a front/back toggle,
// pan/zoom, per-row highlight, and a persisted "placed" checkbox.
export function IBomViewer({ asset, onClose }: { asset: ProjectAsset; onClose: () => void }) {
  const boardID = asset.board_id ?? ''
  const [pcb, setPcb] = useState<Pcb | null>(null)
  const [lines, setLines] = useState<BOMLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selId, setSelId] = useState<string | null>(null)
  const [placed, setPlaced] = useState<Set<string>>(new Set())
  const [side, setSide] = useState<Side>('F')

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<View | null>(null)
  const pcbRef = useRef<Pcb | null>(null)
  const byRefRef = useRef<Map<string, Footprint>>(new Map())
  const paramsRef = useRef<{ selected: Set<string>; placed: Set<string>; side: Side }>({ selected: new Set(), placed: new Set(), side: 'F' })

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
      next.has(lineID) ? next.delete(lineID) : next.add(lineID)
      if (boardID) {
        try {
          localStorage.setItem(placedKey(boardID), JSON.stringify([...next]))
        } catch {
          // storage unavailable
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

  // Stable draw fn reads refs so pan/zoom handlers never capture stale state.
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    const p = pcbRef.current
    const view = viewRef.current
    if (!canvas || !wrap || !p || !view) return
    const cssW = wrap.clientWidth
    const cssH = wrap.clientHeight
    const dpr = DPR()
    if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
      canvas.width = cssW * dpr
      canvas.height = cssH * dpr
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { selected, placed: pl, side: sd } = paramsRef.current
    drawBoard(ctx, p, byRefRef.current, selected, pl, sd, view, cssW, cssH, dpr)
  }, [])

  // Keep refs in sync + redraw when the render inputs change.
  useEffect(() => {
    pcbRef.current = pcb
    byRefRef.current = byRef
  }, [pcb, byRef])
  useEffect(() => {
    paramsRef.current = { selected: selectedRefs, placed: placedRefs, side }
    redraw()
  }, [selectedRefs, placedRefs, side, redraw])

  const fit = useCallback(() => {
    const wrap = wrapRef.current
    const p = pcbRef.current
    if (!wrap || !p) return
    viewRef.current = fitView(p.edges_bbox, wrap.clientWidth, wrap.clientHeight)
    redraw()
  }, [redraw])

  // Set up fit, resize, and pan/zoom once the board data is present.
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap || !pcb) return
    if (!viewRef.current) viewRef.current = fitView(pcb.edges_bbox, wrap.clientWidth, wrap.clientHeight)
    redraw()

    const ro = new ResizeObserver(() => redraw())
    ro.observe(wrap)

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = viewRef.current
      if (!v) return
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      v.ox = mx - (mx - v.ox) * factor
      v.oy = my - (my - v.oy) * factor
      v.scale *= factor
      redraw()
    }
    let dragging = false
    let lastX = 0
    let lastY = 0
    const onDown = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      canvas.setPointerCapture(e.pointerId)
      canvas.style.cursor = 'grabbing'
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      const v = viewRef.current
      if (!v) return
      v.ox += e.clientX - lastX
      v.oy += e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      redraw()
    }
    const onUp = (e: PointerEvent) => {
      dragging = false
      canvas.releasePointerCapture?.(e.pointerId)
      canvas.style.cursor = 'grab'
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.style.cursor = 'grab'
    return () => {
      ro.disconnect()
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
    }
  }, [pcb, redraw])

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
            <div className="ibom-tools">
              <div className="seg">
                <button className={`seg-btn ${side === 'F' ? 'on' : ''}`} onClick={() => setSide('F')}>Front</button>
                <button className={`seg-btn ${side === 'B' ? 'on' : ''}`} onClick={() => setSide('B')}>Back</button>
              </div>
              <button className="btn sm" onClick={fit} title="Fit to view">Fit</button>
            </div>
            <div className="ibom-hint c-faint">scroll to zoom · drag to pan</div>
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
  side: Side,
  view: View,
  cssW: number,
  cssH: number,
  dpr: number,
) {
  const accent = (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#f5a524').trim()
  const silkColor = 'rgba(214,218,226,0.72)'
  const padColor = side === 'B' ? '#9a7d47' : '#b58e4c'
  const holeColor = '#0b0e13'
  const edgeColor = '#6b7280'

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssW, cssH)

  ctx.save()
  ctx.translate(view.ox, view.oy)
  ctx.scale(view.scale, view.scale)
  // Back side: mirror horizontally around the board centre so it reads correctly.
  if (side === 'B') {
    const cx = (pcb.edges_bbox.minx + pcb.edges_bbox.maxx) / 2
    ctx.translate(cx, 0)
    ctx.scale(-1, 1)
    ctx.translate(-cx, 0)
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Board outline (both sides).
  ctx.strokeStyle = edgeColor
  ctx.lineWidth = 0.15
  for (const e of pcb.edges) strokeDrawing(ctx, e)

  // Silkscreen for this side.
  ctx.strokeStyle = silkColor
  ctx.fillStyle = silkColor
  for (const s of pcb.drawings?.silkscreen?.[side] ?? []) drawSilk(ctx, s)

  const onSide = (p: Pad) => !p.layers || p.layers.includes(side)

  // Pads in two passes (all copper, then all drills) so no pad's copper covers
  // another's hole. Only pads on the visible side (through-hole pads are both).
  for (const f of pcb.footprints) {
    ctx.globalAlpha = placed.has(f.ref.toUpperCase()) ? 0.22 : 1
    ctx.fillStyle = padColor
    for (const p of f.pads ?? []) if (onSide(p)) fillPadCopper(ctx, p)
  }
  for (const f of pcb.footprints) {
    ctx.globalAlpha = placed.has(f.ref.toUpperCase()) ? 0.22 : 1
    ctx.fillStyle = holeColor
    for (const p of f.pads ?? []) if (p.type === 'th' && p.drillsize) punchPadHole(ctx, p)
  }
  ctx.globalAlpha = 1

  // Highlight selected footprints (bounding box) — only ones actually on this
  // side, so a front SMD part isn't drawn onto the back view.
  ctx.strokeStyle = accent
  ctx.lineWidth = 2 / view.scale
  for (const ref of selected) {
    const f = byRef.get(ref)
    if (!f) continue
    const pads = f.pads ?? []
    const visible = pads.length ? pads.some(onSide) : f.layer === side
    if (!visible) continue
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

function drawSilk(ctx: CanvasRenderingContext2D, d: Drawing) {
  const t = d.type as string | undefined
  if (typeof d.svgpath === 'string') {
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

function fillPadCopper(ctx: CanvasRenderingContext2D, p: Pad) {
  const [w, h] = p.size
  ctx.save()
  ctx.translate(p.pos[0], p.pos[1])
  ctx.rotate((-p.angle * Math.PI) / 180)
  padPath(ctx, p, w, h)
  ctx.fill()
  ctx.restore()
}

function punchPadHole(ctx: CanvasRenderingContext2D, p: Pad) {
  const d = p.drillsize as [number, number]
  ctx.save()
  ctx.translate(p.pos[0], p.pos[1])
  ctx.rotate((-p.angle * Math.PI) / 180)
  ctx.beginPath()
  if (p.drillshape === 'oval') roundRect(ctx, -d[0] / 2, -d[1] / 2, d[0], d[1], Math.min(d[0], d[1]) / 2)
  else ctx.arc(0, 0, d[0] / 2, 0, Math.PI * 2)
  ctx.fill()
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
