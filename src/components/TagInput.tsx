// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

// TagInput edits the list of names a part answers to.
//
// Built out of the app's own primitives rather than a dependency: the removable
// chip is the command palette's facet chip (.cmdk-chip in index.css) and the
// typeahead is a native <datalist>, which is the only autocomplete pattern in
// the tree (see the category field in PartForm). Adding a combobox library to
// get this one control would be a large dependency for a small box.
//
// The suggestion list is the vocabulary already in use, which is the point of
// tags being shared rows: typing "qw" offers "Qwiic" because another part
// already carries it, so the spelling does not fork.

import { useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Tag } from '../lib/api'
import { icon } from '../lib/icons'
import { chipClass, dedupeTagNames, tagSlug } from '../lib/tags'
import { mdiClose } from '@mdi/js'

export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = 'Add a nickname, e.g. Qwiic',
  disabled = false,
}: {
  value: string[]
  onChange: (next: string[]) => void
  suggestions?: Tag[]
  placeholder?: string
  disabled?: boolean
}) {
  const [text, setText] = useState('')
  const listID = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  // Colour a chip from the vocabulary when the tag already exists, so an
  // existing tag looks the same here as it does on the part page.
  const bySlug = useMemo(() => {
    const m = new Map<string, Tag>()
    for (const t of suggestions) m.set(t.slug, t)
    return m
  }, [suggestions])

  // Offer only what is not already on this part; a suggestion you cannot use is
  // noise in a list that is meant to be short.
  const unused = useMemo(() => {
    const on = new Set(value.map(tagSlug))
    return suggestions.filter((t) => !on.has(t.slug))
  }, [suggestions, value])

  function add(raw: string) {
    const slug = tagSlug(raw)
    if (!slug) return
    // Reuse the vocabulary's spelling when this folds onto an existing tag, so
    // typing "qwiic" on a part does not display differently from "Qwiic" on the
    // next one. The server would resolve them to the same row either way; this
    // just stops the form from showing a spelling that will not survive a save.
    const known = bySlug.get(slug)
    onChange(dedupeTagNames([...value, known ? known.name : raw]))
    setText('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (!text.trim()) return
      // Tab still moves on when the box is empty; it only commits a pending word.
      e.preventDefault()
      add(text)
      return
    }
    if (e.key === 'Backspace' && !text && value.length) {
      e.preventDefault()
      onChange(value.slice(0, -1))
    }
  }

  return (
    <>
      <div
        className={`taginput${disabled ? ' ro' : ''}`}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((name) => (
          <span key={tagSlug(name)} className={chipClass(bySlug.get(tagSlug(name))?.colour)}>
            {name}
            {!disabled && (
              <button
                type="button"
                className="x"
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(value.filter((v) => tagSlug(v) !== tagSlug(name)))
                }}
                aria-label={`Remove ${name}`}
              >
                {icon(mdiClose, { size: 12 })}
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            ref={inputRef}
            list={listID}
            value={text}
            onChange={(e) => {
              // Picking from the datalist fires change with the full value and
              // no keydown, so commit it here rather than making the user press
              // Enter after clicking a suggestion.
              const v = e.target.value
              if (unused.some((t) => t.name === v)) add(v)
              else setText(v)
            }}
            onKeyDown={onKeyDown}
            onBlur={() => text.trim() && add(text)}
            placeholder={value.length ? '' : placeholder}
          />
        )}
      </div>
      <datalist id={listID}>
        {unused.map((t) => (
          <option key={t.id} value={t.name} />
        ))}
      </datalist>
    </>
  )
}
