// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Detect a USB "keyboard wedge" barcode scanner. These type the barcode as
// keystrokes far faster than a human and finish with Enter (or Tab). We buffer
// keystrokes, reset the buffer on any human-speed gap, and treat a fast burst
// terminated by Enter as a scan. Input into a text field is left alone so the
// scanner doesn't hijack the search box.

import { useEffect, useRef } from 'react'

const GS = '\x1d' // group separator — between EIGP-114 fields
const RS = '\x1e' // record separator — after the "[)>" header
const FS = '\x1c' // file separator
const ESC = '\x1b'

// A scanner set to "keyboard" mode can't type a raw GS/RS, so it substitutes
// something the keyboard can send. We've seen two schemes in the wild and
// normalise both back to the real separators before parsing:
//   1. VT function keys — GS = F8 (ESC[19~), RS = F9 (ESC[20~). Some units use
//      F7 (ESC[18~) for GS. Handled at capture (F-key events) and here (in case
//      the ESC sequence arrives as literal characters).
//   2. Ctrl combos — GS = Ctrl+], RS = Ctrl+^. Handled at capture.
function normalizeSeparators(s: string): string {
  return s
    .replace(/\x1b\[19~/g, GS) // F8
    .replace(/\x1b\[18~/g, GS) // F7
    .replace(/\x1b\[20~/g, RS) // F9
}

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
      if (e.metaKey || e.altKey) return
      if (isEditable(e.target)) return // let the user type in fields normally

      const now = performance.now()
      if (now - last > maxGapMs) buf = '' // human-speed gap → not the scanner
      const midScan = buf.length > 0 // already inside a fast burst?
      last = now

      if (e.key === 'Enter' || e.key === 'Tab') {
        if (buf.length >= minLength) {
          const code = normalizeSeparators(buf)
          buf = ''
          e.preventDefault()
          e.stopPropagation()
          onScanRef.current(code)
        } else {
          buf = ''
        }
        return
      }

      // EIGP-114 field separators arrive as function keys or a literal Esc
      // sequence (see normalizeSeparators). Only intercept these when we're
      // mid-scan, so a lone F8/F5/Esc still works normally in the UI.
      if (midScan) {
        if (e.key === 'F8' || e.key === 'F7') { buf += GS; e.preventDefault(); return } // GS
        if (e.key === 'F9') { buf += RS; e.preventDefault(); return } // RS
        if (e.key === 'Escape') { buf += ESC; e.preventDefault(); return } // literal ESC[..~
      }

      // Other scanners emit the separators as Ctrl combos: GS = Ctrl+], RS =
      // Ctrl+^ . Capture those; ignore any other Ctrl combo (a real shortcut).
      if (e.ctrlKey) {
        if (e.key === ']') { buf += GS; e.preventDefault() }
        else if (e.key === '^' || e.key === '6') { buf += RS; e.preventDefault() }
        else if (e.key === '\\' || e.key === '4') { buf += FS; e.preventDefault() }
        return
      }

      // Printable characters (and any raw control char delivered as length-1).
      if (e.key.length === 1) {
        buf += e.key
        // Once a fast burst is under way, swallow the keystrokes so they don't
        // leak into the UI mid-scan — e.g. the "/" in a firebin://p/… deep-link
        // QR would otherwise open the command palette and steal the rest of the
        // scan. Capture-phase + stopPropagation beats the bubble-phase shortcuts.
        if (midScan) {
          e.preventDefault()
          e.stopPropagation()
        }
      }
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [enabled, maxGapMs, minLength])
}
