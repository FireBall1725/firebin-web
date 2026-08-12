// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useState } from 'react'
import { api, type JobTask, type JobLog } from '../lib/api'
import { useRealtime } from '../lib/useRealtime'
import { useAuth } from '../auth/AuthContext'

const TYPE_LABEL: Record<string, string> = {
  bulk_enrich: 'Bulk metadata refresh',
  datasheet_mirror: 'Datasheet download',
  datasheet_extract: 'Datasheet text extraction',
}
const label = (t: string) => TYPE_LABEL[t] ?? t

const PILL: Record<string, string> = {
  queued: 'ghost', running: 'accent', retrying: 'warn',
  completed: 'ok', failed: 'low', cancelling: 'warn', cancelled: 'ghost',
}
const isLive = (s: string) => s === 'queued' || s === 'running' || s === 'retrying' || s === 'cancelling'
const isDone = (s: string) => s === 'failed' || s === 'cancelled'

function relTime(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 60) return 'just now'
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

export function JobsSettings() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || !!user?.is_instance_admin
  const [tasks, setTasks] = useState<JobTask[]>([])
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(() => {
    api.listTasks({ limit: 30 }).then(setTasks).catch(() => undefined)
  }, [])
  useEffect(load, [load])
  useRealtime(['tasks'], load)

  const cancel = async (id: string) => { await api.cancelTask(id).catch(() => undefined); load() }
  const retry = async (id: string) => { await api.retryTask(id).catch(() => undefined); load() }
  const clearFinished = async () => {
    if (!confirm('Clear all finished jobs? Running jobs are kept. This only tidies the list.')) return
    await api.clearFinishedTasks().catch(() => undefined)
    load()
  }
  const hasFinished = tasks.some((t) => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled')

  return (
    <div className="card">
      <div className="card-h">
        <h2>Activity</h2>
        {isAdmin && hasFinished && (
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={clearFinished}>Clear finished</button>
        )}
      </div>
      <div style={{ padding: 16 }}>
        <p className="c-dim" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.5 }}>
          Background jobs run on the server: bulk metadata refreshes and, soon, BOM imports and label batches.
          They keep running if you close this page, and any device sees the same list. The newest 30 are shown,
          and finished jobs are cleared automatically after 30 days.
        </p>

        {tasks.length === 0 && <div className="empty" style={{ fontSize: 13 }}>No jobs yet.</div>}

        <div className="space-y-2">
          {tasks.map((t) => {
            const pct = t.progress_total > 0 ? Math.round((t.progress_done / t.progress_total) * 100) : 0
            const isOpen = open === t.id
            return (
              <div key={t.id} className="bd" style={{ borderRadius: 10, overflow: 'hidden' }}>
                <div
                  className="flex items-center gap-3"
                  style={{ padding: '9px 12px', cursor: 'pointer' }}
                  onClick={() => setOpen(isOpen ? null : t.id)}
                >
                  <span className={`pill ${PILL[t.status] ?? 'ghost'}`} style={{ minWidth: 74, justifyContent: 'center' }}>{t.status}</span>
                  <div className="min-w-0" style={{ flex: 1 }}>
                    <div className="c-text truncate" style={{ fontSize: 13.5, fontWeight: 600 }}>{label(t.type)}</div>
                    <div className="c-faint" style={{ fontSize: 12 }}>
                      {isLive(t.status) || t.progress_total > 0
                        ? `${t.progress_done}/${t.progress_total}`
                        : ''}
                      {t.status === 'completed' && t.result
                        ? ` · ${t.result.updated ?? 0} updated${t.result.skipped ? `, ${t.result.skipped} skipped` : ''}`
                        : ''}
                      {t.error ? ` · ${t.error}` : ''}
                      <span style={{ marginLeft: 6 }}>· {relTime(t.created_at)}</span>
                    </div>
                  </div>
                  {isLive(t.status) && (
                    <button className="btn sm" onClick={(e) => { e.stopPropagation(); cancel(t.id) }}>Cancel</button>
                  )}
                  {isDone(t.status) && (
                    <button className="btn sm" onClick={(e) => { e.stopPropagation(); retry(t.id) }}>Retry</button>
                  )}
                </div>
                {isLive(t.status) && t.progress_total > 0 && (
                  <div style={{ height: 3, background: 'var(--panel-2)' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', transition: 'width .3s' }} />
                  </div>
                )}
                {isOpen && <TaskLogs id={t.id} live={isLive(t.status)} />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TaskLogs({ id, live }: { id: string; live: boolean }) {
  const [logs, setLogs] = useState<JobLog[]>([])
  const load = useCallback(() => {
    api.getTaskLogs(id, 0).then(setLogs).catch(() => undefined)
  }, [id])
  useEffect(load, [load])
  useRealtime([`task:${id}`], live ? load : () => {})

  return (
    <div
      className="mono"
      style={{
        background: 'var(--panel-2)', borderTop: '1px solid var(--border)',
        padding: '10px 12px', maxHeight: 220, overflowY: 'auto', fontSize: 11.5, lineHeight: 1.6,
      }}
    >
      {logs.length === 0 && <span className="c-faint">No log lines.</span>}
      {logs.map((l) => (
        <div key={l.id} className={l.level === 'error' ? 'c-crit' : l.level === 'warn' ? 'c-warn' : 'c-dim'}>
          {l.message}
        </div>
      ))}
    </div>
  )
}
