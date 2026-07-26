// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import type { Project } from '../lib/api'
import { BoardThumb } from './BoardThumb'
import { AssetImg } from './AssetImage'
import { icon } from '../lib/icons'
import { mdiExpansionCard } from '@mdi/js'

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
      {icon(mdiExpansionCard, { size: 40, style: { color: 'var(--faint)' } })}
    </div>
  )
}
