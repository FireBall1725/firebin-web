// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, type Project, type Board, type ProjectAsset, type BoardPreview } from '../lib/api'
import { useRealtime } from '../lib/useRealtime'
import { BoardThumb } from '../components/BoardThumb'
import { PartPicker } from '../components/PartPicker'

export function ProjectDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [assets, setAssets] = useState<ProjectAsset[]>([])
  const [notFound, setNotFound] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [showNewBoard, setShowNewBoard] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

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
  const renderFor = (board: Board) =>
    assets.find((a) => a.kind === 'ibom' && a.board_id === board.id) ??
    assets.find((a) => a.kind === 'pcbrender' && a.board_id === board.id)

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
          {project.description && <p className="c-dim" style={{ fontSize: 13.5, margin: '0 0 6px' }}>{project.description}</p>}
          {project.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {project.tags.map((t) => <span key={t} className="pill ghost" style={{ fontSize: 11 }}>{t}</span>)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowEdit(true)} className="btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
            Edit
          </button>
          <button onClick={() => setShowNewBoard(true)} className="btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
            New board
          </button>
          <button onClick={() => setShowUpload(true)} className="btn primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16V4M7 9l5-5 5 5M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
            Upload
          </button>
          <button onClick={del} className="btn danger">Delete</button>
        </div>
      </div>

      {/* Boards */}
      <div className="mt-6">
        <div className="tiles-h"><span className="eyebrow">Boards</span></div>
        {boards.length === 0 ? (
          <p className="c-faint text-sm">No boards yet. Use Upload to add one from a KiCad file.</p>
        ) : (
          <div className="tiles">
            {boards.map((b) => {
              const ib = renderFor(b)
              return (
                <Link key={b.id} to={`/projects/${project.id}/boards/${b.id}`} className="tile">
                  <div className="tile-art">
                    {ib ? <BoardThumb assetId={ib.id} kind={ib.kind} /> : <BoardGlyph />}
                  </div>
                  <div className="tile-name truncate">{b.name}</div>
                  <div className="tile-sub">
                    {b.revision && <span className="pill ghost">rev {b.revision}</span>}
                    {b.kind === 'panel' && <span className="pill accent">{b.copies}-up</span>}
                    <span className="c-faint">{b.line_count} lines</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {showUpload && (
        <UploadModal projectID={project.id} onClose={() => setShowUpload(false)} onDone={reload} />
      )}
      {showNewBoard && (
        <NewBoardModal
          projectID={project.id}
          onClose={() => setShowNewBoard(false)}
          onCreated={(id) => navigate(`/projects/${project.id}/boards/${id}`)}
        />
      )}
      {showEdit && (
        <EditProjectModal project={project} onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); reload() }} />
      )}
    </div>
  )
}

// EditProjectModal edits a project's name, description, and tags.
function EditProjectModal({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description ?? '')
  const [tags, setTags] = useState(project.tags.join(', '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    setBusy(true)
    setError(null)
    try {
      await api.updateProject(project.id, {
        name: name.trim(),
        description: description.trim(),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      })
      onSaved()
    } catch {
      setError('Could not save the project')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>Edit project</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="modal-b space-y-3">
          <label className="fieldlabel"><span>Name</span>
            <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="fieldlabel"><span>Description</span>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </label>
          <label className="fieldlabel"><span>Tags <span className="c-faint">(comma-separated)</span></span>
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. wip, client-x, revB" />
          </label>
          {error && <p className="c-crit text-sm">{error}</p>}
        </div>
        <div className="modal-f">
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={save} disabled={busy || !name.trim()} className="btn primary">{busy ? '…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

function BoardGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" width="42" height="42" style={{ color: 'var(--faint)' }}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 7h4v4H7zM7 15h.01M11 15h.01M15 15h4v-4h-4M15 7h.01" />
    </svg>
  )
}

// UploadModal is a two-step wizard: drop a file, then map/confirm what was
// detected (board name, revision, panel, iBOM, renders) before committing.
function UploadModal({ projectID, onClose, onDone }: { projectID: string; onClose: () => void; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<BoardPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [revision, setRevision] = useState('')
  const [keepPanels, setKeepPanels] = useState(true)
  const [keepRenders, setKeepRenders] = useState(true)
  const [attachIbom, setAttachIbom] = useState(true)
  const [matchedKeys, setMatchedKeys] = useState<Set<string>>(new Set())

  const matchOne = async (key: string, part: { id: string; name: string }) => {
    try {
      await api.setProjectMatch(projectID, key, part.id)
      setMatchedKeys((prev) => new Set(prev).add(key))
    } catch {
      setError('Could not save that match')
    }
  }

  const pick = async (f: File) => {
    setFile(f)
    setBusy(true)
    setError(null)
    setMatchedKeys(new Set())
    try {
      const p = await api.previewBoard(projectID, f)
      setPreview(p)
      setName(p.name)
      setRevision(p.revision)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file')
      setFile(null)
    } finally {
      setBusy(false)
    }
  }

  const create = async () => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      await api.uploadBoard(projectID, file, {
        name: name.trim() || undefined,
        revision: revision.trim() || undefined,
        keepPanels,
        keepRenders,
        attachIbom,
      })
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
    const f = e.dataTransfer.files?.[0]
    if (f) pick(f)
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>{preview ? 'Confirm upload' : 'Upload to project'}</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {!preview ? (
          <div className="modal-b">
            <label
              className={`dropzone ${dragging ? 'over' : ''} ${busy ? 'busy' : ''}`}
              onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="26" height="26">
                <path d="M12 16V4M7 9l5-5 5 5M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              <div className="dz-title">{busy ? 'Reading…' : dragging ? 'Drop to read' : 'Drag a KiCad file here, or click to browse'}</div>
              <div className="dz-sub" style={{ textAlign: 'left', maxWidth: 440, lineHeight: 1.7 }}>
                <div><span className="mono">.zip</span> full KiCad project → BOM + interactive layout + renders <span className="c-faint">(best; BOM from the schematic)</span></div>
                <div><span className="mono">.kicad_pcb</span> board → BOM + a layout FireBin renders</div>
                <div><span className="mono">.kicad_sch</span> schematic → BOM only, no layout</div>
                <div><span className="mono">.csv</span> / <span className="mono">.xlsx</span> BOM export (EasyEDA, JLCPCB, LCSC) → BOM only</div>
                <div className="c-faint" style={{ marginTop: 6 }}>Layouts also come from an Interactive HTML BOM; add or replace one anytime from a board's Files.</div>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".zip,.kicad_sch,.kicad_pcb,.csv,.tsv,.xlsx"
                hidden
                disabled={busy}
                onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])}
              />
            </label>
            {error && <p className="c-crit text-sm" style={{ marginTop: 8 }}>{error}</p>}
          </div>
        ) : (
          <>
            <div className="modal-b space-y-4">
              <p className="c-dim" style={{ fontSize: 12.5, margin: 0 }}>
                Detected in <span className="mono">{file?.name}</span>: {preview.line_count}-line BOM
                {preview.panels.length > 0 && `, ${preview.panels.length} panel`}
                {preview.ibom && ', interactive BOM'}
                {preview.renders.length > 0 && `, ${preview.renders.length} render${preview.renders.length === 1 ? '' : 's'}`}.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <label className="fieldlabel"><span>Board name</span>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Board name" />
                </label>
                <label className="fieldlabel">
                  <span>Revision{preview.revision ? ' (from title block)' : ''}</span>
                  <input className="input" value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="A" />
                </label>
              </div>

              <div className="space-y-2">
                {preview.panels.length > 0 && (
                  <label className="flex items-center gap-2 text-sm c-dim">
                    <input type="checkbox" checked={keepPanels} onChange={(e) => setKeepPanels(e.target.checked)} />
                    Include panel as a board ({preview.panels.map((p) => `${p.copies}-up`).join(', ')})
                  </label>
                )}
                {preview.ibom && (
                  <label className="flex items-center gap-2 text-sm c-dim">
                    <input type="checkbox" checked={attachIbom} onChange={(e) => setAttachIbom(e.target.checked)} />
                    Attach the interactive BOM to this board
                  </label>
                )}
                {preview.renders.length > 0 && (
                  <label className="flex items-center gap-2 text-sm c-dim">
                    <input type="checkbox" checked={keepRenders} onChange={(e) => setKeepRenders(e.target.checked)} />
                    Keep {preview.renders.length} render{preview.renders.length === 1 ? '' : 's'}
                  </label>
                )}
              </div>

              {(() => {
                const unmatched = preview.unmatched.filter((u) => !matchedKeys.has(u.key))
                const matched = preview.matched + matchedKeys.size
                if (preview.line_count === 0) return null
                return (
                  <div>
                    <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                      <span className="eyebrow">Inventory match</span>
                      <span className={`pill ${matched === preview.line_count ? 'ok' : 'low'}`} style={{ fontSize: 11 }}>
                        {matched}/{preview.line_count} matched
                      </span>
                    </div>
                    {unmatched.length === 0 ? (
                      <p className="c-faint" style={{ fontSize: 12 }}>
                        {preview.unmatched.length === 0
                          ? 'Every line resolved to inventory automatically.'
                          : 'All set — the rest will match on commit.'}
                      </p>
                    ) : (
                      <>
                        <p className="c-faint" style={{ fontSize: 12, marginBottom: 6 }}>
                          Match the leftovers now (optional). A match applies to every board in this project.
                        </p>
                        <div className="space-y-2" style={{ maxHeight: 220, overflowY: 'auto' }}>
                          {unmatched.map((u) => (
                            <div key={u.key} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                              <div className="flex items-center gap-2" style={{ fontSize: 12.5 }}>
                                <span className="c-text" style={{ fontWeight: 600 }}>{u.value || <span className="c-faint">(no value)</span>}</span>
                                {u.mpn && <span className="mono c-faint" style={{ fontSize: 11 }}>{u.mpn}</span>}
                                <span className="mono c-faint" style={{ fontSize: 11, marginLeft: 'auto' }}>{u.refs}</span>
                              </div>
                              <PartPicker onPick={(p) => matchOne(u.key, p)} placeholder="Match to a part…" />
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )
              })()}

              {error && <p className="c-crit text-sm">{error}</p>}
            </div>
            <div className="modal-f">
              <button className="btn" onClick={() => { setPreview(null); setFile(null); setError(null) }}>Back</button>
              <button className="btn primary" disabled={busy || !name.trim()} onClick={create}>
                {busy ? '…' : 'Create board'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// NewBoardModal creates an empty board to build a BOM by hand (no upload).
function NewBoardModal({ projectID, onClose, onCreated }: { projectID: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [revision, setRevision] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setBusy(true)
    try {
      const b = await api.createBlankBoard(projectID, { name: name.trim(), revision: revision.trim() || undefined })
      onCreated(b.id)
    } catch {
      setError('Could not create board')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>New board</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="modal-b space-y-3">
          <label className="fieldlabel"><span>Board name</span>
            <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. Controller board" />
          </label>
          <label className="fieldlabel"><span>Revision (optional)</span>
            <input className="input" value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="A" />
          </label>
          <p className="c-faint" style={{ fontSize: 12 }}>You'll add BOM lines by hand. Upload a KiCad project later to get the board layout and renders.</p>
          {error && <p className="c-crit text-sm">{error}</p>}
        </div>
        <div className="modal-f">
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={create} disabled={busy} className="btn primary">{busy ? '…' : 'Create board'}</button>
        </div>
      </div>
    </div>
  )
}

