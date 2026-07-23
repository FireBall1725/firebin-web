// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type Project } from '../lib/api'
import { useRealtime } from '../lib/useRealtime'
import { ProjectFormModal } from '../components/ProjectFormModal'

export function ProjectsPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [showNew, setShowNew] = useState(false)

  const load = useCallback(() => {
    api.listProjects().then(setProjects).catch(() => setProjects([]))
  }, [])

  useEffect(load, [load])
  useRealtime(['projects'], load)

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <span className="eyebrow">Workspace</span>
          <h1 className="c-text" style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-0.02em', margin: '2px 0 0' }}>
            Projects
          </h1>
        </div>
        <button onClick={() => setShowNew(true)} className="btn primary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
          New project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="card">
          <p className="c-faint p-6 text-sm">
            No projects yet. Create one, then add boards by uploading their KiCad schematic — each board gets its own BOM matched against inventory.
          </p>
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {projects.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="card hoverable-link" style={{ padding: 16, display: 'block' }}>
              <span className="eyebrow">Project</span>
              <div className="c-text" style={{ fontSize: 16, fontWeight: 600, margin: '3px 0 6px', letterSpacing: '-0.01em' }}>
                {p.name}
              </div>
              {p.description && (
                <p className="c-dim" style={{ fontSize: 12.5, margin: '0 0 10px', lineHeight: 1.4 }}>{p.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="pill ghost">{p.board_count} {p.board_count === 1 ? 'board' : 'boards'}</span>
                {p.tags.map((t) => <span key={t} className="pill ghost" style={{ fontSize: 11 }}>{t}</span>)}
              </div>
            </Link>
          ))}
        </div>
      )}

      {showNew && (
        <ProjectFormModal
          onClose={() => setShowNew(false)}
          onSaved={(p) => { setShowNew(false); navigate(`/projects/${p.id}`) }}
        />
      )}
    </div>
  )
}
