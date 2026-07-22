// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, type Project, type Board, type BOMLine } from '../lib/api'
import { useRealtime } from '../lib/useRealtime'
import { num } from '../lib/format'

export function ProjectDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [notFound, setNotFound] = useState(false)

  const reload = useCallback(() => {
    api.getProject(id).then(setProject).catch(() => setNotFound(true))
  }, [id])

  useEffect(reload, [reload])
  useRealtime(['projects'], reload)

  if (notFound) {
    return (
      <div>
        <Link to="/projects" className="link">← Projects</Link>
        <p className="mt-8 c-dim">Project not found.</p>
      </div>
    )
  }
  if (!project) return <p className="c-faint">Loading…</p>

  const del = async () => {
    if (!confirm(`Delete project "${project.name}" and all its boards?`)) return
    await api.deleteProject(project.id).catch(() => undefined)
    navigate('/projects')
  }

  const boards = project.boards ?? []

  return (
    <div>
      <Link to="/projects" className="btn sm" style={{ marginBottom: 14 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
        Projects
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="eyebrow">Project</span>
          <h1 className="c-text" style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-0.02em', margin: '4px 0 6px' }}>
            {project.name}
          </h1>
          {project.description && <p className="c-dim" style={{ fontSize: 13.5, margin: 0 }}>{project.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="pill ghost">{boards.length} {boards.length === 1 ? 'board' : 'boards'}</span>
          <button onClick={del} className="btn sm danger">Delete</button>
        </div>
      </div>

      <AddBoard projectID={project.id} onAdded={reload} />

      <div className="mt-4 space-y-4">
        {boards.length === 0 ? (
          <div className="card"><p className="c-faint p-6 text-sm">No boards yet. Upload a KiCad schematic above to add one.</p></div>
        ) : (
          boards.map((b) => <BoardCard key={b.id} board={b} onChanged={reload} />)
        )}
      </div>
    </div>
  )
}

// AddBoard uploads a KiCad file (schematic or BOM CSV) as a new board.
function AddBoard({ projectID, onAdded }: { projectID: string; onAdded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      await api.uploadBoard(projectID, file, name.trim() || undefined)
      setName('')
      if (inputRef.current) inputRef.current.value = ''
      onAdded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card mt-5">
      <div className="card-h"><h2>Add a board</h2></div>
      <div className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="fieldlabel" style={{ flex: '1 1 220px' }}>
            <span>Board name (optional)</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main board — defaults to the filename" />
          </label>
          <label className="btn primary" style={{ cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Parsing…' : 'Upload KiCad file'}
            <input
              ref={inputRef}
              type="file"
              accept=".kicad_sch,.csv,.tsv"
              hidden
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </label>
        </div>
        <p className="c-faint" style={{ fontSize: 12, marginTop: 8 }}>
          Upload a <span className="mono">.kicad_sch</span> schematic (or a KiCad BOM <span className="mono">.csv</span>). We parse the components, group them into a BOM, and match each line to your inventory.
        </p>
        {error && <p className="c-crit text-sm" style={{ marginTop: 6 }}>{error}</p>}
      </div>
    </div>
  )
}

// BoardCard loads a board's full BOM and shows it with inventory match status.
function BoardCard({ board, onChanged }: { board: Board; onChanged: () => void }) {
  const [full, setFull] = useState<Board | null>(null)

  const load = useCallback(() => {
    api.getBoard(board.id).then(setFull).catch(() => setFull(null))
  }, [board.id])

  useEffect(load, [load])
  useRealtime(['parts'], load)

  const lines = full?.lines ?? []
  const matched = lines.filter((l) => l.match_kind !== 'none').length
  const totalParts = lines.reduce((s, l) => s + l.quantity, 0)

  const del = async () => {
    if (!confirm(`Remove board "${board.name}"?`)) return
    await api.deleteBoard(board.id).catch(() => undefined)
    onChanged()
  }

  return (
    <section className="card">
      <div className="card-h">
        <div className="min-w-0">
          <span className="eyebrow">Board</span>
          <h2 style={{ marginTop: 1 }}>{board.name}</h2>
        </div>
        <div className="flex items-center gap-2" style={{ marginLeft: 'auto' }}>
          {board.source_filename && <span className="tag mono" style={{ fontSize: 11 }}>{board.source_filename}</span>}
          <span className="pill ghost">{lines.length} lines · {num(totalParts)} parts</span>
          <span className={`pill ${matched === lines.length && lines.length > 0 ? 'ok' : 'low'}`}>
            {matched}/{lines.length} matched
          </span>
          <button onClick={del} className="btn sm danger">Remove</button>
        </div>
      </div>

      <table className="tbl">
        <thead>
          <tr>
            <th style={{ width: 44 }} className="num">Qty</th>
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
          {lines.map((l) => <BomRow key={l.id} line={l} />)}
        </tbody>
      </table>
    </section>
  )
}

function BomRow({ line }: { line: BOMLine }) {
  return (
    <tr>
      <td className="num c-text">{line.quantity}</td>
      <td className="mono c-dim" style={{ fontSize: 12 }}>{line.refs}</td>
      <td className="c-text">{line.value || <span className="c-faint">—</span>}</td>
      <td className="mono c-faint" style={{ fontSize: 11.5 }}>{shortFootprint(line.footprint)}</td>
      <td className="mono c-faint" style={{ fontSize: 11.5 }}>{line.mpn || '—'}</td>
      <td>
        {line.part_id ? (
          <Link to={`/parts/${line.part_id}`} className="pill ok" style={{ whiteSpace: 'nowrap' }}>
            {line.part_name} ↗
          </Link>
        ) : (
          <span className="pill low" style={{ whiteSpace: 'nowrap' }}>no match</span>
        )}
      </td>
    </tr>
  )
}

// shortFootprint trims the KiCad library prefix ("Resistor_SMD:R_0603…" → "R_0603…").
function shortFootprint(fp: string): string {
  if (!fp) return '—'
  const i = fp.indexOf(':')
  return i >= 0 ? fp.slice(i + 1) : fp
}
