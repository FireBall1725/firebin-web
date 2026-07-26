// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Renders a resolved label (its elements, with field values already filled in by
// the server) onto a canvas at the tape's native dot resolution. The same canvas
// backs the designer's tape preview AND the WebUSB print, so what you see is what
// burns. QR via qrcode-generator (zero-dep); Code128 is hand-rolled below.

import qrcode from 'qrcode-generator'
import type { LabelElement } from './api'
import type { Bitmap } from './brotherPtouch'

// ── Code 128 (code set B) ───────────────────────────────────────────────────
// Element-width patterns for values 0..106. Each 6-digit string is the width of
// bar,space,bar,space,bar,space (values 0..105); 106 is the 7-element stop.
const C128 =
  '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(
    ' ',
  )
const START_B = 104
const STOP = 106

// code128Widths returns the run-length widths (starting with a bar) for a Code128-B
// encoding of s, plus the total module count, or null if s has an unencodable char.
function code128Widths(s: string): { widths: number[]; modules: number } | null {
  const values: number[] = [START_B]
  for (const ch of s) {
    const code = ch.charCodeAt(0)
    if (code < 32 || code > 126) return null // code set B covers ASCII 32..126
    values.push(code - 32)
  }
  let sum = START_B
  for (let i = 1; i < values.length; i++) sum += values[i] * i
  values.push(sum % 103) // checksum
  values.push(STOP)

  const widths: number[] = []
  let modules = 0
  for (const v of values) {
    for (const d of C128[v]) {
      const w = Number(d)
      widths.push(w)
      modules += w
    }
  }
  return { widths, modules }
}

function drawBarcode(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  w: number,
  h: number,
  ink: string,
) {
  const enc = code128Widths(value)
  if (!enc) return
  const unit = w / enc.modules // scale bars to fill the box width
  ctx.fillStyle = ink
  let cx = x
  let bar = true // patterns always start with a bar
  for (const width of enc.widths) {
    const bw = width * unit
    if (bar) ctx.fillRect(Math.round(cx), y, Math.ceil(bw), h)
    cx += bw
    bar = !bar
  }
}

function drawQR(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  w: number,
  h: number,
  ink: string,
) {
  const qr = qrcode(0, 'M')
  qr.addData(value)
  qr.make()
  const n = qr.getModuleCount()
  const side = Math.min(w, h)
  const cell = Math.max(1, Math.floor(side / (n + 2))) // 1-module quiet zone each side
  const dim = cell * n
  const ox = x + Math.floor((w - dim) / 2)
  const oy = y + Math.floor((h - dim) / 2)
  ctx.fillStyle = ink
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(ox + c * cell, oy + r * cell, cell, cell)
    }
  }
}

// wrapLines greedily wraps text to a pixel width, clipping to maxLines with an
// ellipsis on the last line — mirrors the server's PDF text handling.
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const word of words) {
    const trial = cur ? cur + ' ' + word : word
    if (ctx.measureText(trial).width <= maxWidth || !cur) {
      cur = trial
    } else {
      lines.push(cur)
      cur = word
    }
  }
  if (cur) lines.push(cur)
  if (lines.length <= maxLines) return lines
  const clipped = lines.slice(0, maxLines)
  let last = clipped[maxLines - 1]
  while (last.length > 0 && ctx.measureText(last + '…').width > maxWidth) {
    last = last.slice(0, -1)
  }
  clipped[maxLines - 1] = last + '…'
  return clipped
}

function drawText(ctx: CanvasRenderingContext2D, el: LabelElement, sx: number, sy: number, ink: string) {
  const value = el.value ?? ''
  if (!value) return
  const fontPx = (el.font ?? 8) * sy
  ctx.fillStyle = ink
  ctx.textBaseline = 'top'
  ctx.font = `${el.italic ? 'italic ' : ''}${el.bold ? 'bold ' : ''}${fontPx}px -apple-system, "Segoe UI", Roboto, sans-serif`
  const boxW = el.w * sx
  const boxH = el.h * sy
  const lineH = fontPx * 1.18
  const maxLines = Math.max(1, Math.floor(boxH / lineH) || 1)
  const lines = wrapLines(ctx, value, boxW, maxLines)
  const align = el.align ?? 'L'
  ctx.textAlign = align === 'C' ? 'center' : align === 'R' ? 'right' : 'left'
  const ax = el.x * sx + (align === 'C' ? boxW / 2 : align === 'R' ? boxW : 0)
  // Vertical alignment: shift the text block by the slack in the box (default top).
  const slack = Math.max(0, boxH - lines.length * lineH)
  const valign = el.valign ?? 'T'
  const startY = el.y * sy + (valign === 'M' ? slack / 2 : valign === 'B' ? slack : 0)
  lines.forEach((line, i) => {
    const y = startY + i * lineH
    ctx.fillText(line, ax, y)
    if (el.underline) {
      const tw = ctx.measureText(line).width
      const ux = align === 'C' ? ax - tw / 2 : align === 'R' ? ax - tw : ax
      const uy = Math.round(y + fontPx * 1.02)
      ctx.fillRect(ux, uy, tw, Math.max(1, Math.round(fontPx / 14)))
    }
  })
}

export interface RenderOptions {
  widthDots: number // label length in dots (along the tape)
  heightDots: number // printable dots across the tape
  labelWpt: number // design width in points
  labelHpt: number // design height in points
}

// renderLabelToCanvas draws the resolved elements onto a fresh canvas sized to the
// tape's dot geometry. Black on white; the caller thresholds for printing or scales
// it up (image-rendering: pixelated) for an on-screen preview.
export function renderLabelToCanvas(
  elements: LabelElement[],
  opts: RenderOptions,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(opts.widthDots))
  canvas.height = Math.max(1, Math.round(opts.heightDots))
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const sx = canvas.width / opts.labelWpt
  const sy = canvas.height / opts.labelHpt

  for (const el of elements) {
    const bx = el.x * sx, by = el.y * sy, bw = el.w * sx, bh = el.h * sy
    // Invert = white content on a solid black box; fill the box then ink white.
    if (el.invert && (el.type === 'text' || el.type === 'qr' || el.type === 'barcode')) {
      ctx.fillStyle = '#000'
      ctx.fillRect(bx, by, bw, bh)
    }
    const ink = el.invert ? '#fff' : '#000'
    switch (el.type) {
      case 'text':
        drawText(ctx, el, sx, sy, ink)
        break
      case 'qr':
        if (el.value) drawQR(ctx, el.value, bx, by, bw, bh, ink)
        break
      case 'barcode':
        if (el.value) drawBarcode(ctx, el.value, bx, by, bw, bh, ink)
        break
      case 'line': {
        const t = el.thickness && el.thickness > 0 ? el.thickness : 1
        ctx.fillStyle = '#000'
        if (el.w >= el.h) {
          const th = Math.max(1, t * sy)
          ctx.fillRect(bx, by + (bh - th) / 2, bw, th) // horizontal, centred
        } else {
          const tw = Math.max(1, t * sx)
          ctx.fillRect(bx + (bw - tw) / 2, by, tw, bh) // vertical, centred
        }
        break
      }
      case 'rect':
        if (el.filled) {
          ctx.fillStyle = '#000'
          ctx.fillRect(bx, by, bw, bh)
        } else {
          const t = el.thickness && el.thickness > 0 ? el.thickness : 1
          const lw = Math.max(1, t * sy)
          ctx.strokeStyle = '#000'
          ctx.lineWidth = lw
          ctx.strokeRect(bx + lw / 2, by + lw / 2, bw - lw, bh - lw)
        }
        break
    }
  }
  return canvas
}

// canvasBitmap wraps a rendered canvas as a 1-bit Bitmap for the WebUSB driver,
// thresholding each pixel at 50% luminance (ink where dark).
export function canvasBitmap(canvas: HTMLCanvasElement): Bitmap {
  const ctx = canvas.getContext('2d')!
  const { width, height } = canvas
  const data = ctx.getImageData(0, 0, width, height).data
  return {
    width,
    height,
    dark: (x, y) => {
      const i = (y * width + x) * 4
      const a = data[i + 3]
      if (a < 128) return false
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3
      return lum < 128
    },
  }
}
