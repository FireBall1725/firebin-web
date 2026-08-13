// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import type { Tag, TagColour } from './api'

/** tagSlug folds a tag name to its identity, mirroring TagSlug in the API's
 *  repository package: lowercased, with everything that is not a letter or a
 *  digit removed. "STEMMA QT", "stemma-qt" and "StemmaQT" all fold to
 *  "stemmaqt".
 *
 *  This exists on the client so a chip input can reject a duplicate before it
 *  round-trips, and so the parts list can compare a ?tag= slug against what a
 *  part carries. The server remains the authority; if the two ever disagree the
 *  server's answer is the one that is stored.
 *
 *  \p{L}/\p{N} rather than [a-z0-9], matching the API's use of Unicode classes:
 *  an accented name folds instead of being gutted down to its ASCII skeleton. */
export function tagSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/** dedupeTagNames drops blanks, names that fold to nothing, and repeat
 *  spellings of one tag, keeping the first spelling typed. */
export function dedupeTagNames(names: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of names) {
    const slug = tagSlug(n)
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    out.push(n.trim())
  }
  return out
}

/** chipClass returns the class list for a tag chip in its palette colour. */
export function chipClass(colour?: TagColour | null): string {
  return colour ? `tagchip tc-${colour}` : 'tagchip'
}

/** tagNames pulls the display names off a part's tags. */
export function tagNames(tags: Tag[] | undefined): string[] {
  return (tags ?? []).map((t) => t.name)
}

/** matchedTag returns the first tag on a part whose name contains the query, so
 *  a result can say why it came back. Searching "qwiic" and getting
 *  "SM04B-SRSS-TB" is a confusing answer without it. */
export function matchedTag(tags: Tag[] | undefined, query: string): Tag | undefined {
  const q = query.trim().toLowerCase()
  if (!q) return undefined
  return (tags ?? []).find((t) => t.name.toLowerCase().includes(q))
}
