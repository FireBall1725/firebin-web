// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

// Temporary stand-in for pages whose backend endpoints aren't built yet
// (parts, locations). Replaced as the API domain CRUD lands.
export function PlaceholderPage({ title, note }: { title: string; note: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="mt-8 rounded-lg border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700">
        {note}
      </div>
    </div>
  )
}
