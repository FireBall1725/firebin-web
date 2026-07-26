// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// FireBin's label QR codes encode a firebin://p/<code> deep link so a phone can
// open the app straight to the part. When that same QR is read on the desktop
// (keyboard-wedge scanner or the in-app camera), we resolve the link to a part
// and navigate, instead of running it through the distributor-barcode flow.

import { api, type StorageLocation, type StockItem } from './api'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// parseFirebinPartLink returns the code inside a firebin://p/<code> link, else null.
export function parseFirebinPartLink(raw: string): string | null {
  const m = /^firebin:\/\/p\/(.+)$/i.exec(raw.trim())
  return m ? m[1].trim() : null
}

// resolveFirebinPart turns a deep-link code (a part UUID, or the part's IPN when it
// has one) into a part id, or null if nothing matches. Never throws.
export async function resolveFirebinPart(code: string): Promise<string | null> {
  if (UUID_RE.test(code)) return code
  try {
    const parts = await api.listParts({ search: code })
    const hit = parts.find((p) => (p.ipn ?? '').toLowerCase() === code.toLowerCase()) ?? parts[0]
    return hit ? hit.id : null
  } catch {
    return null
  }
}

// parseFirebinLocationLink returns the code inside a firebin://l/<code> link, else null.
export function parseFirebinLocationLink(raw: string): string | null {
  const m = /^firebin:\/\/l\/(.+)$/i.exec(raw.trim())
  return m ? m[1].trim() : null
}

// resolveFirebinLocation turns a location deep-link code (a UUID, or the location's
// barcode) into the location, or null. Never throws.
export async function resolveFirebinLocation(code: string): Promise<StorageLocation | null> {
  try {
    return UUID_RE.test(code) ? await api.getLocation(code) : await api.scanLocation(code)
  } catch {
    return null
  }
}

// parseFirebinStockLink returns the code inside a firebin://s/<code> link (a stock
// lot / mini spool), else null.
export function parseFirebinStockLink(raw: string): string | null {
  const m = /^firebin:\/\/s\/(.+)$/i.exec(raw.trim())
  return m ? m[1].trim() : null
}

// resolveFirebinStock turns a lot deep-link code (a UUID, or the lot's barcode) into
// the stock lot, or null. Never throws.
export async function resolveFirebinStock(code: string): Promise<StockItem | null> {
  try {
    return UUID_RE.test(code) ? await api.getStockItem(code) : await api.scanStockItem(code)
  } catch {
    return null
  }
}
