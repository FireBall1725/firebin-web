// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Shared iBOM rendering: parse an Interactive HTML BOM's embedded `pcbdata` and
// draw the board (outline, silkscreen, pads) to a canvas. Used by both the
// full interactive viewer and small board thumbnails.

import LZString from 'lz-string'
import { NEWSTROKE } from './newstroke'

export type Drawing = Record<string, unknown>
export type Side = 'F' | 'B'
export interface Pcb {
  edges_bbox: { minx: number; miny: number; maxx: number; maxy: number }
  edges: Drawing[]
  drawings: { silkscreen?: { F?: Drawing[]; B?: Drawing[] } }
  footprints: Footprint[]
  metadata?: { title?: string; revision?: string }
}
export interface Footprint {
  ref: string
  layer: Side
  bbox: { pos: [number, number]; relpos?: [number, number]; size: [number, number]; angle: number }
  pads?: Pad[]
}
export interface Pad {
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
export interface View { scale: number; ox: number; oy: number }

export const DPR = () => Math.min(window.devicePixelRatio || 1, 2)

// parseIbom pulls the pcbdata (compressed or inline) out of an iBOM HTML file.
export function parseIbom(html: string): Pcb | null {
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

// pcbFromAsset parses board render data from an asset: a real iBOM ('ibom') is
// HTML with compressed pcbdata; our generated render ('pcbrender') is the
// pcbdata JSON directly.
export function pcbFromAsset(text: string, kind: string): Pcb | null {
  if (kind === 'pcbrender') {
    try {
      return JSON.parse(text) as Pcb
    } catch {
      return null
    }
  }
  return parseIbom(text)
}

// buildRefIndex groups footprints by reference designator. It's a multimap
// because a panel repeats every ref once per copy (6 footprints named "BZ1"),
// and selecting a BOM line must highlight all of them, not just one.
export function buildRefIndex(pcb: Pcb | null): Map<string, Footprint[]> {
  const m = new Map<string, Footprint[]>()
  for (const f of pcb?.footprints ?? []) {
    const k = f.ref.toUpperCase()
    const arr = m.get(k)
    if (arr) arr.push(f)
    else m.set(k, [f])
  }
  return m
}

export function fitView(bb: Pcb['edges_bbox'], cssW: number, cssH: number, pad = 24): View {
  const bw = Math.max(1e-6, bb.maxx - bb.minx)
  const bh = Math.max(1e-6, bb.maxy - bb.miny)
  const scale = Math.min((cssW - pad * 2) / bw, (cssH - pad * 2) / bh)
  return { scale, ox: (cssW - bw * scale) / 2 - bb.minx * scale, oy: (cssH - bh * scale) / 2 - bb.miny * scale }
}

// drawBoard renders the board for one side into a canvas context. Pass empty
// selected/placed sets for a plain render (e.g. a thumbnail).
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  pcb: Pcb,
  byRef: Map<string, Footprint[]>,
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
  if (side === 'B') {
    const cx = (pcb.edges_bbox.minx + pcb.edges_bbox.maxx) / 2
    ctx.translate(cx, 0)
    ctx.scale(-1, 1)
    ctx.translate(-cx, 0)
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.strokeStyle = edgeColor
  ctx.lineWidth = 0.15
  for (const e of pcb.edges) strokeDrawing(ctx, e)

  ctx.strokeStyle = silkColor
  ctx.fillStyle = silkColor
  for (const s of pcb.drawings?.silkscreen?.[side] ?? []) drawSilk(ctx, s)

  const onSide = (p: Pad) => !p.layers || p.layers.includes(side)

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

  ctx.strokeStyle = accent
  ctx.lineWidth = 2 / view.scale
  for (const ref of selected) {
    // Highlight every footprint sharing this ref — a panel has one per copy.
    for (const f of byRef.get(ref) ?? []) {
      const pads = f.pads ?? []
      const visible = pads.length ? pads.some(onSide) : f.layer === side
      if (!visible) continue
      const { pos, size, angle } = f.bbox
      const rel = f.bbox.relpos ?? [-size[0] / 2, -size[1] / 2]
      ctx.save()
      ctx.translate(pos[0], pos[1])
      ctx.rotate((-angle * Math.PI) / 180)
      ctx.translate(rel[0], rel[1])
      ctx.fillStyle = accent
      ctx.globalAlpha = 0.22
      ctx.fillRect(0, 0, size[0], size[1])
      ctx.globalAlpha = 1
      ctx.strokeRect(0, 0, size[0], size[1])
      ctx.restore()
    }
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
  if (t === 'text' && typeof d.text === 'string') {
    drawStrokeText(ctx, d)
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

// drawStrokeText renders a generated-render text element with the KiCad
// newstroke stroke font (so silk labels match KiCad, not the browser sans-serif).
// Ports InteractiveHtmlBom's drawText: glyph coords are in text-height units
// (baseline y≈0, caps up to y≈-1); width/height = the text size in mm.
function drawStrokeText(ctx: CanvasRenderingContext2D, d: Drawing) {
  const text = d.text as string
  const pos = (d.pos as number[]) || [0, 0]
  const size = (d.size as number) || 1
  const thickness = (d.thickness as number) || size * 0.15
  const jx = justifyX((d.justify as string) || 'center')
  const jy = justifyY((d.vjustify as string) || 'center')
  const advance = (ch: string) => (NEWSTROKE[ch]?.w ?? 0.6) * size

  ctx.save()
  ctx.translate(pos[0], pos[1])
  ctx.rotate((-(d.angle as number) * Math.PI) / 180)
  ctx.lineWidth = thickness
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const lines = text.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  const interline = size * 1.5 + thickness
  let offsety = ((1 - jy) / 2) * size - ((lines.length - 1) * (jy + 1) * interline) / 2

  for (const line of lines) {
    let lineWidth = 0
    for (const ch of line) lineWidth += advance(ch)
    let offsetx = (-lineWidth * (jx + 1)) / 2
    for (const ch of line) {
      const glyph = NEWSTROKE[ch]
      if (glyph) {
        for (const stroke of glyph.l) {
          ctx.beginPath()
          ctx.moveTo(stroke[0][0] * size + offsetx, stroke[0][1] * size + offsety)
          for (let k = 1; k < stroke.length; k++) ctx.lineTo(stroke[k][0] * size + offsetx, stroke[k][1] * size + offsety)
          ctx.stroke()
        }
      }
      offsetx += advance(ch)
    }
    offsety += interline
  }
  ctx.restore()
}

function justifyX(h: string): number {
  return h === 'left' ? -1 : h === 'right' ? 1 : 0
}
function justifyY(v: string): number {
  return v === 'top' ? -1 : v === 'bottom' ? 1 : 0
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
