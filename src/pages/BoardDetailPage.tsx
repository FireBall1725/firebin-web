// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type Board, type Project, type ProjectAsset } from '../lib/api'
import { useRealtime } from '../lib/useRealtime'
import { num } from '../lib/format'
import { IBomViewer } from '../components/IBomViewer'
import { BoardThumb } from '../components/BoardThumb'

type Tab = 'info' | 'bom' | 'layout'

export function BoardDetailPage() {
  const { projectId = '', boardId = '' } = useParams()
  const [project, setProject] = useState<Project | null>(null)
  const [board, setBoard] = useState<Board | null>(null)
  const [ibom, setIbom] = useState<ProjectAsset | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState<Tab>('info')

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

      <div className="min-w-0">
        <span className="eyebrow">{isPanel ? 'Panel' : 'Board'}</span>
        <h1 className="c-text" style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-0.02em', margin: '4px 0 6px' }}>
          {board.name}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {board.revision && <span className="pill ghost">rev {board.revision}</span>}
          {board.source_filename && <span className="tag mono" style={{ fontSize: 11 }}>{board.source_filename}</span>}
          {isPanel && <span className="pill accent">{copies}-up</span>}
          <span className="pill ghost">{lines.length} lines · {num(totalParts)} parts</span>
          <span className={`pill ${matched === lines.length && lines.length > 0 ? 'ok' : 'low'}`}>{matched}/{lines.length} matched</span>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'info' ? 'on' : ''}`} onClick={() => setTab('info')}>Board info</button>
        <button className={`tab ${tab === 'bom' ? 'on' : ''}`} onClick={() => setTab('bom')}>Bill of materials</button>
        <button className={`tab ${tab === 'layout' ? 'on' : ''}`} onClick={() => setTab('layout')}>Board layout</button>
      </div>

      {tab === 'info' && <InfoTab board={board} ibom={ibom} matched={matched} totalParts={totalParts} />}
      {tab === 'bom' && <BomTab board={board} copies={copies} />}
      {tab === 'layout' && (
        <div>
          {ibom ? (
            <IBomViewer asset={ibom} inline showPlaced={false} />
          ) : (
            <div className="card"><p className="c-faint p-6 text-sm">No interactive BOM for this board. Upload a project zip that includes an iBOM to see the board layout.</p></div>
          )}
        </div>
      )}
    </div>
  )
}

function InfoTab({ board, ibom, matched, totalParts }: { board: Board; ibom: ProjectAsset | null; matched: number; totalParts: number }) {
  const lines = board.lines ?? []
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0, 320px) 1fr' }}>
      <div className="card" style={{ padding: 12 }}>
        <div style={{ aspectRatio: '4 / 3', borderRadius: 8, background: '#0b0e13', overflow: 'hidden' }}>
          {ibom ? <BoardThumb assetId={ibom.id} /> : <div className="grid place-items-center" style={{ height: '100%' }}><span className="c-faint text-sm">No render</span></div>}
        </div>
      </div>
      <div className="card">
        <div className="card-h"><h2>Details</h2></div>
        <table className="tbl">
          <tbody>
            <Row k="Type" v={board.kind === 'panel' ? `Panel (${board.copies}-up)` : 'Board'} />
            <Row k="Revision" v={board.revision || '—'} />
            <Row k="Source file" v={board.source_filename || '—'} mono />
            <Row k="BOM lines" v={String(lines.length)} />
            <Row k="Total parts" v={num(totalParts)} />
            <Row k="Matched to inventory" v={`${matched} / ${lines.length}`} />
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <tr>
      <td className="c-dim" style={{ width: '42%' }}>{k}</td>
      <td className={`c-text ${mono ? 'mono' : ''}`} style={{ wordBreak: 'break-word' }}>{v}</td>
    </tr>
  )
}

function BomTab({ board, copies }: { board: Board; copies: number }) {
  const lines = board.lines ?? []
  return (
    <section className="card" style={{ overflow: 'hidden' }}>
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
  )
}

function shortFootprint(fp: string): string {
  if (!fp) return '—'
  const i = fp.indexOf(':')
  return i >= 0 ? fp.slice(i + 1) : fp
}
