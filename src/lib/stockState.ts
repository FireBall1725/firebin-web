// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import type { Part } from './api'

// One place to answer "what is this part's stock situation", because the answer
// was previously copy-pasted into the parts page, the parts views, the part
// detail page, the dashboard, the command palette and the part picker, with two
// slightly different rules between them.

/** A part recorded but not owned: researched for a future design, remembered as
 *  an alternative, or waiting to be ordered. */
export function isReference(p: Pick<Part, 'reference_only'>): boolean {
  return p.reference_only === true
}

/** A part that needs reordering.
 *
 *  Reference parts are excluded, and that exclusion is the point. Zero used to
 *  mean two different things — "I ran out" and "I never owned one" — and this
 *  rule read both as an alarm, so every part saved for reference landed in the
 *  Low stock filter and buried the ones that genuinely needed attention.
 *
 *  Note the server applies a stricter rule for its own low-stock endpoint: it
 *  requires minimum_stock > 0, since zero explicitly means "no reorder point".
 *  This client rule additionally treats an owned part at zero as low, which is
 *  reasonable on a list you are scanning by eye but is why the two can disagree. */
export function isLow(p: Pick<Part, 'total_stock' | 'minimum_stock' | 'reference_only'>): boolean {
  if (isReference(p)) return false
  return p.total_stock <= 0 || (p.minimum_stock > 0 && p.total_stock <= p.minimum_stock)
}

/** Whether a whole group is reference parts.
 *
 *  A group header shows the total across its variants, and a total of zero
 *  reads as "you ran out of all of them". That is only wrong when none of them
 *  was ever owned, which is exactly the case worth distinguishing. A group
 *  holding one real part at zero and three reference parts is genuinely out of
 *  stock, so this is all-or-nothing rather than any. */
export function allReference(parts: Pick<Part, 'reference_only'>[]): boolean {
  return parts.length > 0 && parts.every(isReference)
}

/** What to show where a stock figure would go. Reference parts have no
 *  meaningful quantity, so a number there would be a claim about something the
 *  user never said. */
export function stockLabel(p: Pick<Part, 'total_stock' | 'minimum_stock' | 'reference_only'>): string {
  if (isReference(p)) return 'reference'
  if (p.total_stock > 0) return `${p.total_stock} in stock`
  return 'no stock'
}
