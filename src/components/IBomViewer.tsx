// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type ProjectAsset, type BOMLine } from '../lib/api'
import {
  DPR,
  buildRefIndex,
  drawBoard,
  fitView,
  parseIbom,
  type Footprint,
  type Pcb,
  type Side,
  type View,
} from '../lib/ibom'

const placedKey = (boardID: string) => `firebin.placed.${boardID}`

// IBomViewer renders the interactive BOM natively: FireBin's BOM table beside a
// canvas board render (outline, silkscreen, pads) with a front/back toggle,
// pan/zoom, per-row highlight, and (in the assembly flow) a placed checkbox.
export function IBomViewer({
  asset,
  onClose,
  showPlaced = true,
  inline = false,
}: {
  asset: ProjectAsset
  onClose?: () => void
  showPlaced?: boolean
  inline?: boolean
}) {
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
    if (!boardID || !showPlaced) return
    try {
      const saved = JSON.parse(localStorage.getItem(placedKey(boardID)) || '[]')
      if (Array.isArray(saved)) setPlaced(new Set(saved))
    } catch {
      // ignore malformed storage
    }
  }, [boardID, showPlaced])

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

  const byRef = useMemo(() => buildRefIndex(pcb), [pcb])

  const refsOf = (line: BOMLine | undefined) =>
    new Set((line?.refs ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))
  const selectedRefs = useMemo(() => refsOf(lines.find((l) => l.id === selId)), [lines, selId])
  const placedRefs = useMemo(() => {
    const s = new Set<string>()
    for (const l of lines) if (placed.has(l.id)) for (const r of refsOf(l)) s.add(r)
    return s
  }, [lines, placed])

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

  const body = (
    <>
        {!inline && (
          <div className="modal-h">
            <h3 className="truncate">Interactive BOM{pcb?.metadata?.title ? ` · ${pcb.metadata.title}` : ''}</h3>
            {showPlaced && lines.length > 0 && (
              <span className="pill ghost" style={{ marginLeft: 10 }}>{placedCount}/{lines.length} placed</span>
            )}
            <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}
        <div className="ibom-body">
          <div className="ibom-bom">
            {error && <p className="c-crit p-4 text-sm">{error}</p>}
            <table className="tbl">
              <thead>
                <tr>
                  {showPlaced && <th style={{ width: 34 }} title="Placed"></th>}
                  <th className="num" style={{ width: 34 }}>Qty</th>
                  <th>References</th>
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
                    {showPlaced && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={placed.has(l.id)} onChange={() => togglePlaced(l.id)} aria-label={`Placed ${l.refs}`} />
                      </td>
                    )}
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
    </>
  )

  if (inline) return <div className="viewer ibom-viewer inline">{body}</div>
  return (
    <div className="overlay" onClick={onClose}>
      <div className="viewer ibom-viewer" onClick={(e) => e.stopPropagation()}>
        {body}
      </div>
    </div>
  )
}
