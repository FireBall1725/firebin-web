// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

// TagsPage is the vocabulary itself: every name in use, how many parts carry
// it, and the operations that keep it from rotting.
//
// Merge is the one that earns this page. Two spellings of the same idea will
// escape into use eventually, and without merge the only fix is to visit every
// part. Rename deliberately refuses to merge — it reports the collision instead
// — because collapsing two tags on a typo would move every part on one of them
// with nothing to undo it.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, TAG_COLOURS, type Tag, type TagColour } from '../lib/api'
import { useAuth } from '../auth/AuthContext'
import { useRealtime } from '../lib/useRealtime'
import { chipClass } from '../lib/tags'
import { icon } from '../lib/icons'
import { mdiCallMerge, mdiClose, mdiPencilOutline, mdiPlus, mdiTrashCanOutline } from '@mdi/js'

export function TagsPage() {
  const navigate = useNavigate()
  const { canWrite, user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<Tag | null>(null)
  const [merging, setMerging] = useState<Tag | null>(null)

  // Loading is only ever cleared, never set back on a refetch: this reloads on
  // every SSE tag event, and flashing the table back to "Loading…" because
  // someone else tagged a part elsewhere would be worse than a silent update.
  const load = useCallback(
    () =>
      api
        .listTags()
        .then(setTags)
        .catch(() => setTags([]))
        .finally(() => setLoading(false)),
    [],
  )

  useEffect(() => { load() }, [load])
  useRealtime(['tags'], load)

  const total = useMemo(() => tags.reduce((n, t) => n + t.part_count, 0), [tags])

  const create = async () => {
    const name = newName.trim()
    if (!name) return
    setError(null)
    try {
      await api.createTag({ name })
      setNewName('')
      setAdding(false)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create that tag')
    }
  }

  const remove = async (t: Tag) => {
    if (!confirm(`Delete "${t.name}"? It comes off ${t.part_count} part${t.part_count === 1 ? '' : 's'}.`)) return
    setError(null)
    try {
      await api.deleteTag(t.id)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete that tag')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <span className="eyebrow">Inventory</span>
          <h1 className="c-text" style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-0.02em', margin: '4px 0 0' }}>
            Tags
          </h1>
        </div>
        {canWrite && (
          <button className="btn primary sm" onClick={() => setAdding((v) => !v)}>
            {icon(adding ? mdiClose : mdiPlus)}
            {adding ? 'Cancel' : 'New tag'}
          </button>
        )}
      </div>

      <p className="c-faint" style={{ fontSize: 13, marginTop: 0, marginBottom: 14, maxWidth: 640, lineHeight: 1.5 }}>
        The other names your parts answer to. A tag is a way in, not an identity: it
        never replaces a part number, and searching for one finds every part carrying
        it. Spellings fold together, so "STEMMA QT" and "stemma-qt" are one tag.
      </p>

      {error && <p className="c-crit text-sm">{error}</p>}

      {adding && (
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <div className="flex items-center gap-2">
            <input
              className="input"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              placeholder="Qwiic"
              style={{ flex: 1 }}
            />
            <button className="btn primary sm" onClick={create} disabled={!newName.trim()}>Create</button>
          </div>
          <p className="c-faint" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            You do not have to create a tag here first. Typing one on a part makes it.
          </p>
        </div>
      )}

      {loading ? (
        <div className="empty">Loading…</div>
      ) : !tags.length ? (
        <div className="empty">
          No tags yet. Open a part, hit Edit, and type the name you actually use for it.
        </div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Tag</th>
                <th className="num">Parts</th>
                <th>Description</th>
                {canWrite && <th className="col-actions">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {tags.map((t) => (
                <tr key={t.id}>
                  <td>
                    <button
                      className={chipClass(t.colour)}
                      onClick={() => navigate(`/parts?tag=${encodeURIComponent(t.slug)}`)}
                      title={`Show every part tagged ${t.name}`}
                    >
                      {t.name}
                    </button>
                  </td>
                  <td className="num">{t.part_count}</td>
                  <td>
                    <span className="cell-trunc c-faint">{t.description || '—'}</span>
                  </td>
                  {canWrite && (
                    <td className="col-actions">
                      <div className="flex items-center gap-1">
                        <button className="btn ghost sm" onClick={() => setEditing(t)} title="Rename or recolour">
                          {icon(mdiPencilOutline, { size: 15 })}
                        </button>
                        <button
                          className="btn ghost sm"
                          onClick={() => setMerging(t)}
                          title="Merge into another tag"
                          disabled={tags.length < 2}
                        >
                          {icon(mdiCallMerge, { size: 15 })}
                        </button>
                        {/* Delete reaches every part at once and cannot be undone,
                            so the API restricts it to admins; hide it to match. */}
                        {isAdmin && (
                          <button className="btn ghost sm danger" onClick={() => remove(t)} title="Delete">
                            {icon(mdiTrashCanOutline, { size: 15 })}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tags.length > 0 && (
        <p className="c-faint" style={{ fontSize: 12, marginTop: 10 }}>
          {tags.length} tag{tags.length === 1 ? '' : 's'} across {total} part link{total === 1 ? '' : 's'}.
        </p>
      )}

      {editing && (
        <EditTagModal
          tag={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
      {merging && (
        <MergeTagModal
          tag={merging}
          others={tags.filter((t) => t.id !== merging.id)}
          onClose={() => setMerging(null)}
          onMerged={() => { setMerging(null); load() }}
        />
      )}
    </div>
  )
}

function EditTagModal({ tag, onClose, onSaved }: { tag: Tag; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(tag.name)
  const [colour, setColour] = useState<TagColour | ''>(tag.colour ?? '')
  const [description, setDescription] = useState(tag.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.updateTag(tag.id, { name: name.trim(), colour, description })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h"><h3>Edit tag</h3></div>
        <div className="modal-b">
          {error && <p className="c-crit text-sm">{error}</p>}
          <label className="fieldlabel">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} />
          <p className="c-faint" style={{ fontSize: 12, marginTop: 6 }}>
            Renaming onto a tag that already exists is refused. Merge them instead, so
            you can see what is about to move.
          </p>

          <label className="fieldlabel" style={{ marginTop: 12 }}>Colour</label>
          <div className="tagrow">
            <button
              type="button"
              className={`tagchip${colour === '' ? '' : ' c-faint'}`}
              onClick={() => setColour('')}
              style={colour === '' ? { outline: '2px solid var(--accent)' } : undefined}
            >
              default
            </button>
            {TAG_COLOURS.map((c) => (
              <button
                key={c}
                type="button"
                className={chipClass(c)}
                onClick={() => setColour(c)}
                style={colour === c ? { outline: '2px solid var(--accent)' } : undefined}
              >
                {name.trim() || c}
              </button>
            ))}
          </div>

          <label className="fieldlabel" style={{ marginTop: 12 }}>Description</label>
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional, e.g. JST SH 1.0 mm 4-pin I²C connector"
            style={{ width: '100%' }}
          />
        </div>
        <div className="modal-f">
          <button className="btn sm" onClick={onClose}>Cancel</button>
          <button className="btn primary sm" onClick={save} disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MergeTagModal({
  tag,
  others,
  onClose,
  onMerged,
}: {
  tag: Tag
  others: Tag[]
  onClose: () => void
  onMerged: () => void
}) {
  const [into, setInto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const target = others.find((t) => t.id === into)

  const merge = async () => {
    if (!into) return
    setBusy(true)
    setError(null)
    try {
      await api.mergeTag(tag.id, into)
      onMerged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not merge')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h"><h3>Merge tag</h3></div>
        <div className="modal-b">
          {error && <p className="c-crit text-sm">{error}</p>}
          <label className="fieldlabel">Merge into</label>
          <select className="input" value={into} onChange={(e) => setInto(e.target.value)} style={{ width: '100%' }}>
            <option value="">Pick a tag…</option>
            {others.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.part_count})</option>
            ))}
          </select>
          {/* Say what is about to happen in parts, not in tags. "Merge A into B"
              is abstract; "18 parts move and this name is gone" is not. */}
          <p className="c-faint" style={{ fontSize: 13, marginTop: 12, marginBottom: 0, lineHeight: 1.5 }}>
            {target ? (
              <>
                {tag.part_count} part{tag.part_count === 1 ? '' : 's'} tagged{' '}
                <span className={chipClass(tag.colour)}>{tag.name}</span> move to{' '}
                <span className={chipClass(target.colour)}>{target.name}</span>, and{' '}
                <b>{tag.name}</b> is deleted. Parts already carrying both keep the one.
              </>
            ) : (
              <>Pick the tag to keep. This one is deleted once its parts have moved.</>
            )}
          </p>
        </div>
        <div className="modal-f">
          <button className="btn sm" onClick={onClose}>Cancel</button>
          <button className="btn primary sm" onClick={merge} disabled={busy || !into}>
            {busy ? 'Merging…' : 'Merge'}
          </button>
        </div>
      </div>
    </div>
  )
}
