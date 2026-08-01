// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useState } from 'react'

// What the assistant says it is doing while you wait.
//
// A turn spends most of its time in lookups and model thinking, and a line that
// never changes reads as a hang however honest it is. A word that rotates, a
// clock that ticks and a count that climbs all say the same thing: this is
// still going.
//
// Rummaging rather than Processing: the words are deliberately plain and a
// little wry, because the alternative is a spinner that tells you nothing and
// a progress bar that would be a lie.
const WORDS = [
  'Rummaging', 'Sifting', 'Poking about', 'Counting', 'Squinting',
  'Digging', 'Checking the bins', 'Cross-referencing', 'Tallying', 'Peering',
]

// formatTokens shortens a count the way a status line wants it: 1900 reads as
// 1.9k. Exact below a thousand, because "0.4k" is worse than "412".
export function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(1)}k`
}

export function AssistantStatus({
  activity,
  inputTokens,
  outputTokens,
}: {
  // What is actually happening, when that is known: the tool being run. Beats
  // any invented word, so it wins when present.
  activity?: string | null
  inputTokens: number
  outputTokens: number
}) {
  const [seconds, setSeconds] = useState(0)
  const [word, setWord] = useState(() => WORDS[Math.floor(Math.random() * WORDS.length)])

  useEffect(() => {
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000)
    // Slower than the clock on purpose: a word that changes every second is a
    // flicker, not a status.
    const shuffle = setInterval(() => {
      setWord(WORDS[Math.floor(Math.random() * WORDS.length)])
    }, 4000)
    return () => { clearInterval(tick); clearInterval(shuffle) }
  }, [])

  const counts: string[] = []
  if (inputTokens > 0) counts.push(`↑ ${formatTokens(inputTokens)}`)
  // Output stays hidden until it is real. Every provider reports it at the end
  // of a round, so showing 0 during the first one would look like a stall
  // rather than a number that has not arrived.
  if (outputTokens > 0) counts.push(`↓ ${formatTokens(outputTokens)}`)

  return (
    <div className="c-faint" style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'baseline' }}>
      <span>{activity ?? `${word}…`}</span>
      <span style={{ fontSize: 12, opacity: 0.75 }}>
        ({seconds}s{counts.length > 0 ? ` · ${counts.join(' ')} tokens` : ''})
      </span>
    </div>
  )
}
