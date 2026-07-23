// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type Board, type Project, type ProjectAsset } from '../lib/api'
import { useRealtime } from '../lib/useRealtime'
import { num } from '../lib/format'
import { IBomViewer } from '../components/IBomViewer'

export function BoardDetailPage() {
  const { projectId = '', boardId = '' } = useParams()
  const [project, setProject] = useState<Project | null>(null)
  const [board, setBoard] = useState<Board | null>(null)
  const [ibom, setIbom] = useState<ProjectAsset | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [viewing, setViewing] = useState(false)

  const reload = useCallback(() => {
    api.getBoard(boardId).then(setBoard).catch(() => setNotFound(true))
  }, [boardId])

  useEffect(() => {
    reload()
    api.getProject(projectId).then(setProject).catch(() => undefined)
    api
      .listProjectAssets(projectId)
      .then((as) => setIbom(as.find((a) => a.kind === 'ibom' && a.board_id === boardId) ?? null))
      .catch(() => undefined)
  }, [projectId, boardId, reload])

  useRealtime(['projects', 'parts'], reload)

  if (notFound) {
    return (
      <div>
        <Link to={`/projects/${projectId}`} className="link">← Project</Link>
        <p className="mt-8 c-dim">Board not found.</p>
      </div>
    )
  }
  if (!board) return <p className="c-faint">Loading…</p>

  const isPanel = board.kind === 'panel'
  const copies = board.copies || 1
  const lines = board.lines ?? []
  const matched = lines.filter((l) => l.match_kind !== 'none').length
  const totalParts = lines.reduce((s, l) => s + l.quantity, 0) * copies

  return (
    <div>
      <Link to={`/projects/${projectId}`} className="btn sm" style={{ marginBottom: 14 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
        {project?.name ?? 'Project'}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="eyebrow">{isPanel ? 'Panel' : 'Board'}</span>
          <h1 className="c-text" style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-0.02em', margin: '4px 0 6px' }}>
            {board.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {board.source_filename && <span className="tag mono" style={{ fontSize: 11 }}>{board.source_filename}</span>}
            {isPanel && <span className="pill accent">{copies}-up</span>}
            <span className="pill ghost">{lines.length} lines · {num(totalParts)} parts</span>
            <span className={`pill ${matched === lines.length && lines.length > 0 ? 'ok' : 'low'}`}>{matched}/{lines.length} matched</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ibom && (
            <button className="btn primary" onClick={() => setViewing(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v18H3zM3 9h18M9 21V9" /></svg>
              Interactive BOM
            </button>
          )}
        </div>
      </div>

      <section className="card mt-5" style={{ overflow: 'hidden' }}>
        <div className="card-h"><h2>Bill of materials</h2></div>
        <table className="tbl">
          <thead>
            <tr>
              <th className="num" style={{ width: 52 }}>Qty</th>
              <th>References</th>
              <th>Value</th>
              <th>Footprint</th>
              <th>MPN</th>
              <th>Inventory</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr><td colSpan={6} className="c-faint" style={{ textAlign: 'center', padding: 20 }}>No BOM lines parsed.</td></tr>
            )}
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="num c-text">
                  {l.quantity * copies}
                  {copies > 1 && <span className="c-faint" style={{ fontSize: 10 }}> ({l.quantity}×{copies})</span>}
                </td>
                <td className="mono c-dim" style={{ fontSize: 12 }}>{l.refs}</td>
                <td className="c-text">{l.value || <span className="c-faint">—</span>}</td>
                <td className="mono c-faint" style={{ fontSize: 11.5 }}>{shortFootprint(l.footprint)}</td>
                <td className="mono c-faint" style={{ fontSize: 11.5 }}>{l.mpn || '—'}</td>
                <td>
                  {l.part_id ? (
                    <Link to={`/parts/${l.part_id}`} className="pill ok" style={{ whiteSpace: 'nowrap' }}>{l.part_name} ↗</Link>
                  ) : (
                    <span className="pill low" style={{ whiteSpace: 'nowrap' }}>no match</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {viewing && ibom && <IBomViewer asset={ibom} onClose={() => setViewing(false)} showPlaced={false} />}
    </div>
  )
}

function shortFootprint(fp: string): string {
  if (!fp) return '—'
  const i = fp.indexOf(':')
  return i >= 0 ? fp.slice(i + 1) : fp
}
