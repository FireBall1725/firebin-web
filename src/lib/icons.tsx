// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Shared icon renderer. FireBin uses Material Design Icons (@mdi/js, Apache-2.0):
// each icon is a FILLED path in a 0 0 24 24 viewBox, so we render with
// fill="currentColor" and no stroke. Prefer the "-outline" variants for the thin
// line look. Sizing comes from CSS (the surrounding .nav-item svg / .icon-btn svg
// rules) unless a size is passed.
import type { CSSProperties } from 'react'

export function icon(d: string, opts?: { size?: number; className?: string; style?: CSSProperties }) {
  const { size, className, style } = opts ?? {}
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      style={style}
    >
      <path d={d} />
    </svg>
  )
}
