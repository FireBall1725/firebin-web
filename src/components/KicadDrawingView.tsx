// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useState } from 'react'
import { api, type KicadDrawing, type KicadDrawItem } from '../lib/api'

// The server hands over primitives already in screen space, with arcs and
// rectangles flattened to polylines, so this only has to draw lines, circles
// and pads. Every KiCad convention that bites (Y-up symbol space, pin angles
// pointing toward the body, `extends` inheritance) is resolved in Go before it
// gets here.

const COPPER_F = '#c9853f'
const COPPER_B = '#4f7fb8'
const SILK = '#9aa4b2'
const SYMBOL_LINE = '#b98f4a'

function padPath(it: KicadDrawItem) {
  const [cx, cy] = it.points![0]
  const [w, h] = it.size!
  const shape = it.shape ?? 'rect'
  const fill = it.layer === 'B' ? COPPER_B : COPPER_F
  const transform = it.angle ? `rotate(${-it.angle} ${cx} ${cy})` : undefined

  if (shape === 'circle' || (shape === 'oval' && Math.abs(w - h) < 1e-6)) {
    return <circle cx={cx} cy={cy} r={w / 2} fill={fill} transform={transform} />
  }
  // roundrect and oval both render as a rounded rectangle; oval is just the
  // degenerate case where the radius is half the short side.
  const r = shape === 'oval' ? Math.min(w, h) / 2 : shape === 'roundrect' ? Math.min(w, h) * 0.25 : 0
  return (
    <rect
      x={cx - w / 2}
      y={cy - h / 2}
      width={w}
      height={h}
      rx={r}
      ry={r}
      fill={fill}
      transform={transform}
    />
  )
}

function Primitives({ d }: { d: KicadDrawing }) {
  const stroke = d.kind === 'symbol' ? SYMBOL_LINE : SILK
  return (
    <>
      {d.items.map((it, i) => {
        if (it.type === 'pad' && it.points?.length && it.size) {
          return <g key={i}>{padPath(it)}</g>
        }
        // "background" fill is KiCad's pale body shading; approximate it with a
        // low-opacity wash so an op-amp triangle reads as solid, not hollow.
        const fill = it.fill === 'background' || it.fill === 'outline' ? stroke : 'none'
        const fillOpacity = it.fill === 'background' ? 0.12 : it.fill === 'outline' ? 0.35 : 0
        if (it.type === 'circle' && it.center) {
          return (
            <circle
              key={i}
              cx={it.center[0]}
              cy={it.center[1]}
              r={it.r}
              fill={fill}
              fillOpacity={fillOpacity}
              stroke={stroke}
              strokeWidth={it.w || 0.15}
            />
          )
        }
        if (it.points && it.points.length > 1) {
          return (
            <polyline
              key={i}
              points={it.points.map((p) => `${p[0]},${p[1]}`).join(' ')}
              fill={fill}
              fillOpacity={fillOpacity}
              stroke={stroke}
              strokeWidth={it.w || 0.15}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )
        }
        return null
      })}
    </>
  )
}

/** Draws one library symbol or footprint, fetching it on demand. */
export function KicadDrawingView({
  kind,
  libID,
  height = 200,
}: {
  kind: 'symbol' | 'footprint'
  libID?: string | null
  height?: number
}) {
  const [drawing, setDrawing] = useState<KicadDrawing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!libID) {
      setDrawing(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .kicadDrawing(kind, libID)
      .then((d) => {
        if (!cancelled) setDrawing(d)
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setDrawing(null)
          setError(e.message || 'could not render')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [kind, libID])

  if (!libID) {
    return <Placeholder height={height}>No {kind} mapped</Placeholder>
  }
  if (loading) {
    return <Placeholder height={height}>Rendering…</Placeholder>
  }
  if (error || !drawing) {
    return (
      <Placeholder height={height}>
        {/* The common cause is a library added since the last scan, so say the
            thing the user can act on rather than just "failed". */}
        Not in the library index. Re-run the indexer, or check the name.
      </Placeholder>
    )
  }

  const { minx, miny, maxx, maxy } = drawing.bbox
  const pad = Math.max((maxx - minx) * 0.08, (maxy - miny) * 0.08, 0.5)
  const vb = [minx - pad, miny - pad, maxx - minx + pad * 2, maxy - miny + pad * 2]

  return (
    <div style={{ height, display: 'grid', placeItems: 'center' }}>
      <svg
        viewBox={vb.join(' ')}
        style={{ width: '100%', height: '100%' }}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${kind} ${libID}`}
      >
        <Primitives d={drawing} />
      </svg>
    </div>
  )
}

function Placeholder({ height, children }: { height: number; children: React.ReactNode }) {
  return (
    <div
      className="c-dim"
      style={{
        height,
        display: 'grid',
        placeItems: 'center',
        fontSize: 13,
        textAlign: 'center',
        padding: 12,
      }}
    >
      {children}
    </div>
  )
}
