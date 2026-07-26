// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Shared paginator: a "N–M of T <noun>" summary with a per-page selector and a
// windowed page-number strip. Used by the Parts page (noun "groups") and the
// Locations bin contents (noun "parts").
import { PAGE_SIZES } from '../lib/prefs'

export function Pager({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
  onPageSize,
  noun = 'items',
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPage: (p: number) => void
  onPageSize: (n: number) => void
  noun?: string
}) {
  const nums: number[] = []
  const win = 2
  for (let i = Math.max(1, page - win); i <= Math.min(totalPages, page + win); i++) nums.push(i)
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)

  return (
    <div className="pager">
      <div className="c-faint" style={{ fontSize: 12.5 }}>
        {total === 0 ? `No ${noun}` : `${from}–${to} of ${total} ${noun}`}
        <label style={{ marginLeft: 14 }}>
          Per page{' '}
          <select
            className="input"
            style={{ width: 'auto', display: 'inline-block', height: 28, padding: '0 6px', marginLeft: 4 }}
            value={pageSize}
            onChange={(e) => onPageSize(parseInt(e.target.value))}
          >
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      {totalPages > 1 && (
        <div className="pages">
          <button disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous">‹</button>
          {nums[0] > 1 && <><button onClick={() => onPage(1)}>1</button>{nums[0] > 2 && <span className="c-faint">…</span>}</>}
          {nums.map((n) => (
            <button key={n} className={n === page ? 'on' : ''} onClick={() => onPage(n)}>{n}</button>
          ))}
          {nums[nums.length - 1] < totalPages && <>{nums[nums.length - 1] < totalPages - 1 && <span className="c-faint">…</span>}<button onClick={() => onPage(totalPages)}>{totalPages}</button></>}
          <button disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next">›</button>
        </div>
      )}
    </div>
  )
}
