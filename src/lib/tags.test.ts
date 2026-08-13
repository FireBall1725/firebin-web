// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

// The fold is what makes a shared vocabulary work. If the client and the API
// disagree about which spellings are the same tag, the chip input lets you type
// a duplicate the server then silently collapses, and the part page shows a
// name that is not the one stored. These cases mirror TagSlug's tests in the
// API's repository package on purpose; the two have to agree.

import { describe, it, expect } from 'vitest'
import { dedupeTagNames, matchedTag, tagSlug } from './tags'
import type { Tag } from './api'

const tag = (name: string, slug: string): Tag => ({
  id: slug,
  name,
  slug,
  created_at: '',
  updated_at: '',
  part_count: 0,
})

describe('tagSlug', () => {
  it('folds spellings of one name together', () => {
    expect(tagSlug('Qwiic')).toBe('qwiic')
    expect(tagSlug('  qwiic ')).toBe('qwiic')
    expect(tagSlug('STEMMA QT')).toBe('stemmaqt')
    expect(tagSlug('stemma-qt')).toBe('stemmaqt')
    expect(tagSlug('StemmaQT')).toBe('stemmaqt')
    expect(tagSlug('stemma_qt')).toBe('stemmaqt')
  })

  it('keeps digits and non-ASCII letters rather than gutting the name', () => {
    expect(tagSlug('WS2812B')).toBe('ws2812b')
    expect(tagSlug('3.3V')).toBe('33v')
    expect(tagSlug('Größe')).toBe('größe')
  })

  it('returns empty for a name with nothing to fold', () => {
    expect(tagSlug('---')).toBe('')
    expect(tagSlug('   ')).toBe('')
    expect(tagSlug('')).toBe('')
  })
})

describe('dedupeTagNames', () => {
  it('keeps the first spelling and drops the rest', () => {
    expect(dedupeTagNames(['STEMMA QT', 'stemma-qt', 'Qwiic'])).toEqual(['STEMMA QT', 'Qwiic'])
  })

  it('drops blanks and names that fold to nothing', () => {
    expect(dedupeTagNames(['Qwiic', '', '   ', '---'])).toEqual(['Qwiic'])
  })

  it('trims what it keeps', () => {
    expect(dedupeTagNames(['  Qwiic  '])).toEqual(['Qwiic'])
  })
})

describe('matchedTag', () => {
  const tags = [tag('Qwiic', 'qwiic'), tag('STEMMA QT', 'stemmaqt')]

  it('names the tag that a query hit', () => {
    expect(matchedTag(tags, 'qwi')?.name).toBe('Qwiic')
    expect(matchedTag(tags, 'stemma')?.name).toBe('STEMMA QT')
  })

  it('returns nothing for a query no tag covers', () => {
    expect(matchedTag(tags, 'grove')).toBeUndefined()
    expect(matchedTag(tags, '')).toBeUndefined()
    expect(matchedTag(undefined, 'qwiic')).toBeUndefined()
  })
})
