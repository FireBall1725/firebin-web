// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { DPR, buildRefIndex, drawBoard, fitView, pcbFromAsset, type Pcb, type Side } from '../lib/ibom'

const EMPTY = new Set<string>()

// BoardThumb renders a small static board image from a render asset's pcbdata
// (a real iBOM or a generated pcbrender). Used on project tiles; no interaction.
export function BoardThumb({ assetId, kind, side = 'F' }: { assetId: string; kind: string; side?: Side }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pcb, setPcb] = useState<Pcb | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .assetBlob(assetId)
      .then((b) => b.text())
      .then((t) => {
        if (!cancelled) setPcb(pcbFromAsset(t, kind))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [assetId, kind])

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas || !pcb) return
    const byRef = buildRefIndex(pcb)
    const draw = () => {
      const cssW = wrap.clientWidth
      const cssH = wrap.clientHeight
      if (cssW === 0 || cssH === 0) return
      const dpr = DPR()
      canvas.width = cssW * dpr
      canvas.height = cssH * dpr
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
      const ctx = canvas.getContext('2d')
      if (ctx) drawBoard(ctx, pcb, byRef, EMPTY, EMPTY, side, fitView(pcb.edges_bbox, cssW, cssH, 8), cssW, cssH, dpr)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [pcb, side])

  return (
    <div className="board-thumb" ref={wrapRef}>
      <canvas ref={canvasRef} />
    </div>
  )
}
