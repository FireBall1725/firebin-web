// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, type Project, type Board, type BOMLine, type ProjectAsset } from '../lib/api'
import { useRealtime } from '../lib/useRealtime'
import { num } from '../lib/format'

export function ProjectDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [assets, setAssets] = useState<ProjectAsset[]>([])
  const [notFound, setNotFound] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [viewing, setViewing] = useState<ProjectAsset | null>(null)

  const reload = useCallback(() => {
    api.getProject(id).then(setProject).catch(() => setNotFound(true))
    api.listProjectAssets(id).then(setAssets).catch(() => setAssets([]))
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
  const ibom = assets.filter((a) => a.kind === 'ibom')
  const images = assets.filter((a) => a.kind === 'image')

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
          <button onClick={() => setShowUpload(true)} className="btn primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16V4M7 9l5-5 5 5M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
            Upload
          </button>
          <button onClick={del} className="btn sm danger">Delete</button>
        </div>
      </div>

      {/* Interactive BOM + renders pulled from the uploaded project zip. */}
      {(ibom.length > 0 || images.length > 0) && (
        <section className="card mt-5">
          <div className="card-h"><h2>Renders &amp; files</h2></div>
          <div className="p-4 space-y-4">
            {ibom.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {ibom.map((a) => (
                  <button key={a.id} onClick={() => setViewing(a)} className="btn primary">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v18H3zM3 9h18M9 21V9" /></svg>
                    Interactive BOM
                  </button>
                ))}
              </div>
            )}
            {images.length > 0 && (
              <div className="asset-grid">
                {images.map((a) => (
                  <AssetThumb key={a.id} asset={a} onOpen={() => setViewing(a)} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Boards + their BOMs. */}
      <div className="mt-4 space-y-4">
        {boards.length === 0 ? (
          <div className="card"><p className="c-faint p-6 text-sm">No boards yet. Use Upload to add one from a KiCad file.</p></div>
        ) : (
          boards.map((b) => <BoardCard key={b.id} board={b} onChanged={reload} />)
        )}
      </div>

      {showUpload && (
        <UploadModal projectID={project.id} onClose={() => setShowUpload(false)} onDone={reload} />
      )}
      {viewing && <AssetViewer asset={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

// UploadModal wraps the dropzone so an Upload button brings up the upload box.
function UploadModal({ projectID, onClose, onDone }: { projectID: string; onClose: () => void; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      await api.uploadBoard(projectID, file, name.trim() || undefined)
      onDone()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (busy) return
    const file = e.dataTransfer.files?.[0]
    if (file) upload(file)
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>Upload to project</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="modal-b space-y-3">
          <label className="fieldlabel">
            <span>Board name (optional)</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main board — defaults to the filename" />
          </label>
          <label
            className={`dropzone ${dragging ? 'over' : ''} ${busy ? 'busy' : ''}`}
            onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="26" height="26">
              <path d="M12 16V4M7 9l5-5 5 5M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            <div className="dz-title">{busy ? 'Parsing…' : dragging ? 'Drop to upload' : 'Drag a KiCad file here, or click to browse'}</div>
            <div className="dz-sub">
              A zipped KiCad project <span className="mono">.zip</span> (best — merges all sheets and pulls in renders/iBOM), a single <span className="mono">.kicad_sch</span>, or a KiCad BOM <span className="mono">.csv</span>.
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".zip,.kicad_sch,.csv,.tsv"
              hidden
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </label>
          {error && <p className="c-crit text-sm">{error}</p>}
        </div>
      </div>
    </div>
  )
}

// AssetThumb lazily loads an image asset as an object URL and shows a thumbnail.
function AssetThumb({ asset, onOpen }: { asset: ProjectAsset; onOpen: () => void }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let revoked = false
    let objectURL = ''
    api.assetBlob(asset.id).then((blob) => {
      if (revoked) return
      objectURL = URL.createObjectURL(blob)
      setUrl(objectURL)
    }).catch(() => undefined)
    return () => { revoked = true; if (objectURL) URL.revokeObjectURL(objectURL) }
  }, [asset.id])

  return (
    <button className="asset-thumb" onClick={onOpen} title={asset.name}>
      {url ? <img src={url} alt={asset.name} /> : <span className="c-faint" style={{ fontSize: 11 }}>…</span>}
      <span className="asset-name">{asset.name}</span>
    </button>
  )
}

// AssetViewer renders an asset full-screen: an image, or the iBOM in a sandboxed
// iframe (it's self-contained HTML+JS).
function AssetViewer({ asset, onClose }: { asset: ProjectAsset; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let revoked = false
    let objectURL = ''
    api.assetBlob(asset.id).then((blob) => {
      if (revoked) return
      objectURL = URL.createObjectURL(blob)
      setUrl(objectURL)
    }).catch(() => undefined)
    return () => { revoked = true; if (objectURL) URL.revokeObjectURL(objectURL) }
  }, [asset.id])

  const isIbom = asset.kind === 'ibom'

  return (
    <div className="overlay" onClick={onClose}>
      <div className="viewer" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3 className="truncate">{isIbom ? 'Interactive BOM' : asset.name}</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="viewer-body">
          {!url ? (
            <p className="c-faint" style={{ padding: 24 }}>Loading…</p>
          ) : isIbom ? (
            <iframe title={asset.name} src={url} sandbox="allow-scripts allow-popups allow-downloads" />
          ) : (
            <img src={url} alt={asset.name} />
          )}
        </div>
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
