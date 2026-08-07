// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

// The three parsers are the gate in front of the whole scan path: whatever they
// return decides between "this is a FireBin label, go to the record" and "this
// is a distributor barcode, run the lookup". A scanner hands them whitespace,
// mixed case, and occasionally the wrong prefix entirely, so the boundaries are
// worth pinning down.

import { describe, it, expect } from 'vitest'
import {
  parseFirebinPartLink,
  parseFirebinLocationLink,
  parseFirebinStockLink,
} from './deepLink'

describe('parseFirebinPartLink', () => {
  it('returns the code from a part link', () => {
    expect(parseFirebinPartLink('firebin://p/R-0603-10K')).toBe('R-0603-10K')
  })

  it('accepts a UUID as the code', () => {
    const id = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
    expect(parseFirebinPartLink(`firebin://p/${id}`)).toBe(id)
  })

  it('ignores surrounding whitespace, which a wedge scanner adds', () => {
    expect(parseFirebinPartLink('  firebin://p/ABC \n')).toBe('ABC')
  })

  it('is case-insensitive on the scheme but not on the code', () => {
    expect(parseFirebinPartLink('FIREBIN://P/AbC')).toBe('AbC')
  })

  it('rejects a location or stock link', () => {
    expect(parseFirebinPartLink('firebin://l/BIN-1')).toBeNull()
    expect(parseFirebinPartLink('firebin://s/LOT-1')).toBeNull()
  })

  it('rejects a bare distributor barcode', () => {
    expect(parseFirebinPartLink('[)>06P123456')).toBeNull()
  })

  it('rejects a link with no code after the prefix', () => {
    expect(parseFirebinPartLink('firebin://p/')).toBeNull()
  })

  it('rejects the empty string', () => {
    expect(parseFirebinPartLink('')).toBeNull()
  })
})

describe('parseFirebinLocationLink', () => {
  it('returns the code from a location link', () => {
    expect(parseFirebinLocationLink('firebin://l/BIN-A4')).toBe('BIN-A4')
  })

  it('rejects a part link', () => {
    expect(parseFirebinLocationLink('firebin://p/BIN-A4')).toBeNull()
  })
})

describe('parseFirebinStockLink', () => {
  it('returns the code from a stock link', () => {
    expect(parseFirebinStockLink('firebin://s/LOT-77')).toBe('LOT-77')
  })

  it('rejects a part link', () => {
    expect(parseFirebinStockLink('firebin://p/LOT-77')).toBeNull()
  })
})
