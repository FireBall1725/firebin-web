// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useRef, useState } from 'react'
import { api, type Project } from '../lib/api'
import { ProjectCover } from './ProjectCover'
import { icon } from '../lib/icons'
import { mdiClose } from '@mdi/js'

// ProjectFormModal creates or edits a project (name, description, tags). Pass a
// `project` to edit; omit it to create.
export function ProjectFormModal({
  project, onClose, onSaved,
}: {
  project?: Project
  onClose: () => void
  onSaved: (p: Project) => void
}) {
  const editing = !!project
  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [tags, setTags] = useState((project?.tags ?? []).join(', '))
  const [proj, setProj] = useState<Project | undefined>(project)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const coverInput = useRef<HTMLInputElement>(null)

  const refreshCover = async () => {
    if (project) setProj(await api.getProject(project.id).catch(() => proj))
  }
  const uploadCover = async (f: File) => {
    if (!project) return
    setBusy(true); setError(null)
    try { await api.uploadProjectCover(project.id, f); await refreshCover() }
    catch { setError('Could not upload the cover') }
    finally { setBusy(false) }
  }
  const removeCover = async () => {
    if (!project) return
    setBusy(true); setError(null)
    try { await api.removeProjectCover(project.id); await refreshCover() }
    catch { setError('Could not remove the cover') }
    finally { setBusy(false) }
  }
  const hasUploadedCover = !!proj?.cover_asset_id && proj.cover_asset_kind === 'image'

  const save = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    setBusy(true)
    setError(null)
    const body = {
      name: name.trim(),
      description: description.trim() || undefined,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    }
    try {
      const p = editing ? await api.updateProject(project!.id, { ...body, description: body.description ?? '' }) : await api.createProject(body)
      onSaved(p)
    } catch {
      setError(editing ? 'Could not save the project' : 'Could not create project')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay">
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>{editing ? 'Edit project' : 'New project'}</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            {icon(mdiClose)}
          </button>
        </div>
        <div className="modal-b space-y-3">
          <label className="fieldlabel"><span>Name</span>
            <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. Weather Display" />
          </label>
          <label className="fieldlabel"><span>Description <span className="c-faint">(optional)</span></span>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is it?" />
          </label>
          <label className="fieldlabel"><span>Tags <span className="c-faint">(comma-separated)</span></span>
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. wip, client-x, revB" />
          </label>

          {editing && proj && (
            <div>
              <span className="eyebrow">Cover image</span>
              <div className="flex items-center gap-3" style={{ marginTop: 6 }}>
                <div style={{ width: 96, height: 54, borderRadius: 6, background: '#0b0e13', border: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0 }}>
                  <ProjectCover project={proj} />
                </div>
                <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
                  <div className="flex items-center gap-2">
                    <button type="button" className="btn sm" disabled={busy} onClick={() => coverInput.current?.click()}>
                      {hasUploadedCover ? 'Replace' : 'Upload image'}
                    </button>
                    {hasUploadedCover && <button type="button" className="btn sm" disabled={busy} onClick={removeCover}>Use board render</button>}
                  </div>
                  <span className="c-faint" style={{ fontSize: 11 }}>
                    {hasUploadedCover ? 'Showing your uploaded image.' : 'Showing the first board’s render. Upload an image to override it.'}
                  </span>
                </div>
                <input ref={coverInput} type="file" accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.bmp" hidden
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCover(f); e.target.value = '' }} />
              </div>
            </div>
          )}

          {error && <p className="c-crit text-sm">{error}</p>}
        </div>
        <div className="modal-f">
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={save} disabled={busy || !name.trim()} className="btn primary">{busy ? '…' : editing ? 'Save' : 'Create'}</button>
        </div>
      </div>
    </div>
  )
}
