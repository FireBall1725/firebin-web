// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Page citations in an answer, and the rule that they are only links when there
// is something to link to.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Markdown } from './Markdown'
import { DatasheetSubjectProvider, registerDatasheetViewer } from '../lib/datasheetViewer'

let release: (() => void) | null = null

function openViewer(pageCount = 86) {
  const jump = vi.fn()
  release = registerDatasheetViewer({ datasheetID: 'd1', pageCount, jump })
  return jump
}

afterEach(() => {
  release?.()
  release = null
  cleanup()
})

describe('page citations', () => {
  it('are plain text with no datasheet open', () => {
    render(<Markdown text="Two I²C controllers (page 51)." />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(document.body.textContent).toContain('page 51')
  })

  it('become a button that jumps the open datasheet', async () => {
    const jump = openViewer()
    render(<Markdown text="Two I²C controllers (see page 51 of the PDF)." />)
    await userEvent.click(screen.getByRole('button', { name: 'page 51' }))
    expect(jump).toHaveBeenCalledWith(51)
  })

  it('links a range from its first page', async () => {
    const jump = openViewer()
    render(<Markdown text="The pin table runs over pages 12-14." />)
    await userEvent.click(screen.getByRole('button', { name: 'pages 12-14' }))
    expect(jump).toHaveBeenCalledWith(12)
  })

  it('rewrites a gpt-oss citation marker into words', async () => {
    const jump = openViewer()
    render(<Markdown text="Two controllers 【51†L4-L11】 in total." />)
    // The brackets are gone, not just unlinked: unrendered they reach the reader.
    expect(document.body.textContent).not.toContain('†')
    expect(document.body.textContent).not.toContain('【')
    await userEvent.click(screen.getByRole('button', { name: 'page 51' }))
    expect(jump).toHaveBeenCalledWith(51)
  })

  it('swallows the brackets when the marker already holds words', async () => {
    const jump = openViewer()
    // What gpt-oss actually produced once asked for prose: the right words,
    // still inside its citation brackets.
    render(<Markdown text="Two I²C buses 【page 51】." />)
    expect(document.body.textContent).toBe('Two I²C buses page 51.')
    await userEvent.click(screen.getByRole('button', { name: 'page 51' }))
    expect(jump).toHaveBeenCalledWith(51)
  })

  it('puts back the spacing the brackets were doing', async () => {
    const jump = openViewer()
    // Verbatim from gpt-oss: no space before the first marker, none between
    // the two. Dropping the brackets alone gave "controllerpage 4page 51".
    render(<Markdown text="a low-power (LP) controller【page 4】【page 51】." />)
    expect(document.body.textContent).toBe('a low-power (LP) controller page 4, page 51.')
    await userEvent.click(screen.getByRole('button', { name: 'page 51' }))
    expect(jump).toHaveBeenCalledWith(51)
  })

  it('leaves a page the document does not have as text', () => {
    openViewer(20)
    render(<Markdown text="See page 400 for the errata." />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(document.body.textContent).toContain('page 400')
  })

  it('does not turn a bare number into a citation', () => {
    openViewer()
    render(<Markdown text="There are 51 GPIOs on this device." />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  // The assistant page shows conversations started from a datasheet it does
  // not display. Nothing to jump there, but somewhere to go.
  it('opens the datasheet when the document is not on screen', async () => {
    const open = vi.fn()
    render(
      <DatasheetSubjectProvider value={{ datasheetID: 'd1', pageCount: 0, open }}>
        <Markdown text="One LP controller【page 51】." />
      </DatasheetSubjectProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'page 51' }))
    expect(open).toHaveBeenCalledWith(51)
  })

  it('prefers the open viewer over navigating away', async () => {
    const jump = openViewer()
    const open = vi.fn()
    render(
      <DatasheetSubjectProvider value={{ datasheetID: 'd1', pageCount: 0, open }}>
        <Markdown text="See page 51." />
      </DatasheetSubjectProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'page 51' }))
    expect(jump).toHaveBeenCalledWith(51)
    expect(open).not.toHaveBeenCalled()
  })
})
