// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

// stockClass returns a Tailwind text-colour class reflecting stock health:
// red when out, amber when at/below the minimum, plain otherwise.
export function stockClass(qty: number, minimum: number): string {
  if (qty <= 0) return 'text-red-600 dark:text-red-400 font-semibold'
  if (minimum > 0 && qty <= minimum) return 'text-amber-600 dark:text-amber-400 font-semibold'
  return 'text-zinc-700 dark:text-zinc-300'
}

// num trims trailing zeros from the API's decimal quantities for display.
export function num(n: number): string {
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(4)))
}
