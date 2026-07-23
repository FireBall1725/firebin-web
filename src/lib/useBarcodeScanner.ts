// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Detect a USB "keyboard wedge" barcode scanner. These type the barcode as
// keystrokes far faster than a human and finish with Enter (or Tab). We buffer
// keystrokes, reset the buffer on any human-speed gap, and treat a fast burst
// terminated by Enter as a scan. Input into a text field is left alone so the
// scanner doesn't hijack the search box.

import { useEffect, useRef } from 'react'

interface Opts {
  enabled?: boolean
  // Max gap between characters to count as one scan (ms). Scanners are ~5-25ms
  // per char; humans are 80ms+.
  maxGapMs?: number
  // Minimum length to accept, to avoid firing on a stray fast keypress.
  minLength?: number
}

export function useBarcodeScanner(onScan: (code: string) => void, opts: Opts = {}) {
  const { enabled = true, maxGapMs = 50, minLength = 4 } = opts
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    if (!enabled) return
    let buf = ''
    let last = 0

    const isEditable = (el: EventTarget | null) => {
      const t = el as HTMLElement | null
      return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isEditable(e.target)) return // let the user type in fields normally

      const now = performance.now()
      if (now - last > maxGapMs) buf = '' // human-speed gap → not the scanner
      last = now

      if (e.key === 'Enter' || e.key === 'Tab') {
        if (buf.length >= minLength) {
          const code = buf
          buf = ''
          e.preventDefault()
          e.stopPropagation()
          onScanRef.current(code)
        } else {
          buf = ''
        }
        return
      }
      // Accept printable characters and the control separators (GS/RS) that
      // GS1 / EIGP 114 Data Matrix codes carry.
      if (e.key.length === 1) buf += e.key
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [enabled, maxGapMs, minLength])
}
