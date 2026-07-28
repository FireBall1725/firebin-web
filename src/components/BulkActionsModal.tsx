// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Everything you can do to a multi-part selection, in one place.
//
// The bulk bar used to hold every action inline, plus an input for each action
// that needed a parameter. That grows two controls per new action and wrapped to
// three lines at six actions. Here the bar keeps only the selection state and
// one button, and each action is a segment in this modal with just its own field
// visible. Adding an action means adding a segment, not touching the bar.
//
// Built to match LotActionMenu: segmented picker, one field for the active
// choice, a primary button whose label says what will happen.

import { useEffect, useState } from 'react'
import type { Part, StorageLocation } from '../lib/api'
import { icon } from '../lib/icons'
import { mdiClose } from '@mdi/js'

// BulkAction is what the parent receives on apply. Kept as a discriminated
// union so a new action cannot be added without handling it at the call site.
export type BulkAction =
  | { kind: 'move'; locationID: string | null }
  | { kind: 'minimumStock'; minimum: number }
  | { kind: 'refresh' }
  | { kind: 'labels' }

type Segment = BulkAction['kind']

export function BulkActionsModal({ parts, locations, canWrite, onApply, onClose }: {
  parts: Part[]
  locations: StorageLocation[]
  canWrite: boolean
  onApply: (action: BulkAction) => void
  onClose: () => void
}) {
  // A viewer can print but cannot change anything, so the write segments are
  // absent rather than present-and-disabled: the API would refuse them anyway.
  const segments: Segment[] = canWrite
    ? ['move', 'minimumStock', 'refresh', 'labels']
    : ['labels']

  const [seg, setSeg] = useState<Segment>(segments[0])
  const [loc, setLoc] = useState('')
  const [min, setMin] = useState('')
  const [err, setErr] = useState<string | null>(null)

  // Escape closes, matching every other modal in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const n = parts.length
  const plural = n === 1 ? 'part' : 'parts'
  const minValue = Number(min)
  const minValid = min.trim() !== '' && Number.isFinite(minValue) && minValue >= 0

  const label: Record<Segment, string> = {
    move: 'Move',
    minimumStock: 'Reorder point',
    refresh: 'Refresh',
    labels: 'Labels',
  }

  const applyLabel = (): string => {
    switch (seg) {
      case 'move': return `Move ${n} ${plural}`
      case 'minimumStock': return min.trim() === '0' ? 'Clear reorder point' : 'Set reorder point'
      case 'refresh': return `Refresh ${n} ${plural}`
      case 'labels': return 'Choose labels…'
    }
  }

  const apply = () => {
    setErr(null)
    switch (seg) {
      case 'move':
        onApply({ kind: 'move', locationID: loc || null })
        break
      case 'minimumStock':
        if (!minValid) { setErr('Enter a reorder point of 0 or more.'); return }
        onApply({ kind: 'minimumStock', minimum: minValue })
        break
      case 'refresh':
        onApply({ kind: 'refresh' })
        break
      case 'labels':
        onApply({ kind: 'labels' })
        break
    }
  }

  // Naming the first few parts turns a blind "12 selected" into something the
  // user can actually check before changing all of them.
  const preview = parts.slice(0, 3).map((p) => p.name).join(', ')
  const rest = n - Math.min(n, 3)

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>Bulk actions</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">{icon(mdiClose)}</button>
        </div>
        <div className="modal-b">
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 600 }}>{n} {plural} selected</div>
            {preview && (
              <div className="c-faint text-sm">{preview}{rest > 0 ? ` and ${rest} more` : ''}</div>
            )}
          </div>

          <div className="seg" style={{ marginBottom: 12 }}>
            {segments.map((k) => (
              <button
                key={k}
                className={`seg-btn ${seg === k ? 'on' : ''}`}
                aria-pressed={seg === k}
                onClick={() => { setSeg(k); setErr(null) }}
              >
                {label[k]}
              </button>
            ))}
          </div>

          {seg === 'move' && (
            <label className="fieldlabel"><span>Move all stock to</span>
              <select className="input" value={loc} onChange={(e) => setLoc(e.target.value)}>
                <option value="">Unassigned</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <span className="c-faint text-sm">Consolidates every lot of each part into one bin.</span>
            </label>
          )}

          {seg === 'minimumStock' && (
            <label className="fieldlabel"><span>Reorder point</span>
              <input
                className="input"
                type="number"
                min={0}
                step="any"
                value={min}
                autoFocus
                onChange={(e) => setMin(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') apply() }}
              />
              <span className="c-faint text-sm">
                A part shows in Low stock once its total drops to this or below.
                Zero removes the reorder point instead of setting it to zero.
              </span>
            </label>
          )}

          {seg === 'refresh' && (
            <p className="c-faint text-sm">
              Re-reads each part's metadata from its primary MPN through the enrichment providers.
              Runs in the background; parts without an MPN are skipped.
            </p>
          )}

          {seg === 'labels' && (
            <p className="c-faint text-sm">
              Opens the label sheet picker for {n} {plural}.
            </p>
          )}

          {err && <p className="c-crit text-sm" style={{ marginTop: 8 }}>{err}</p>}
        </div>
        <div className="modal-f">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            disabled={seg === 'minimumStock' && !minValid}
            onClick={apply}
          >
            {applyLabel()}
          </button>
        </div>
      </div>
    </div>
  )
}
