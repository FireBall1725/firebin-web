// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useState } from 'react'
import { api, type Project } from '../lib/api'

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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>{editing ? 'Edit project' : 'New project'}</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
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
