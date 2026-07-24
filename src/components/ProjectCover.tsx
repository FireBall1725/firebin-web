// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import type { Project } from '../lib/api'
import { BoardThumb } from './BoardThumb'
import { AssetImg } from './AssetImage'

// ProjectCover renders a project's thumbnail: its uploaded cover image, else the
// first board's render, else a placeholder glyph.
export function ProjectCover({ project }: { project: Project }) {
  const id = project.cover_asset_id
  const kind = project.cover_asset_kind
  if (!id) return <ProjectGlyph />
  if (kind === 'image') return <AssetImg assetId={id} alt={project.name} />
  return <BoardThumb assetId={id} kind={kind || 'pcbrender'} />
}

function ProjectGlyph() {
  return (
    <div className="grid place-items-center" style={{ height: '100%' }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" width="40" height="40" style={{ color: 'var(--faint)' }}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M7 7h4v4H7zM7 15h.01M11 15h.01M15 15h4v-4h-4M15 7h.01" />
      </svg>
    </div>
  )
}
