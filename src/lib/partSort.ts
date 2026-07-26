// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Smart ordering for part names. Plain string sort puts "10 Ω" before "2 Ω" and
// "1 kΩ" before "100 Ω"; neither is what a human wants. This comparator:
//   1. Parses a leading value + SI prefix + unit ("10 kΩ" → 10000 Ω, "100 nF" →
//      1e-7 F) so components sort by real magnitude within their unit family.
//   2. Falls back to a natural (numeric-aware) compare for everything else, so
//      "Header 2" sorts before "Header 10".
//
// Unicode note: unit/prefix glyphs are written as \u escapes so a source-encoding
// hiccup can't silently break matching. Ohm = U+03A9 (Greek Ω) or U+2126 (ohm
// sign); micro = U+00B5 (µ) or U+03BC (μ).

// SI prefix multipliers. Case matters: m = milli (1e-3), M = mega (1e6).
const SI: Record<string, number> = {
  p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, 'μ': 1e-6, m: 1e-3,
  '': 1,
  k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12,
}

const UNVALUED = 99

// Map a matched base unit to an ordered family (resistance first, then C, L, …).
function familyOf(unit: string): number {
  if (unit === 'Ω' || unit === 'Ω') return 0 // ohm
  switch (unit) {
    case 'F': return 1
    case 'H': return 2
    case 'Hz': return 3
    case 'V': return 4
    case 'A': return 5
    case 'W': return 6
    default: return UNVALUED
  }
}

// Leading "<number><prefix><unit>". Hz before H so "100 Hz" doesn't match henry.
// Case-sensitive (m vs M). `(?=\s|$)` (not \b) because \b is ASCII-only and would
// fail after a non-ASCII unit like Ω.
const VALUE_RE = /^\s*([+-]?\d+(?:\.\d+)?)\s*([pnuµμmkKMGT]?)\s*(Ω|Ω|F|Hz|H|V|A|W)(?=\s|$)/

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

interface Key { fam: number; mag: number }

function keyOf(name: string): Key {
  const m = name.match(VALUE_RE)
  if (!m) return { fam: UNVALUED, mag: NaN }
  const mag = parseFloat(m[1]) * (SI[m[2]] ?? 1)
  return { fam: familyOf(m[3]), mag }
}

// comparePartNames orders two part names by unit family, then real magnitude,
// then natural (numeric-aware) string order.
export function comparePartNames(a: string, b: string): number {
  const ka = keyOf(a)
  const kb = keyOf(b)
  if (ka.fam !== kb.fam) return ka.fam - kb.fam
  if (!Number.isNaN(ka.mag) && !Number.isNaN(kb.mag) && ka.mag !== kb.mag) return ka.mag - kb.mag
  return collator.compare(a, b)
}
