// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { lazy, Suspense, type ReactNode } from 'react'

// Prism and its grammars are about 26 kB gzipped and only ever needed when an
// answer contains a code block, so they load on first use rather than on every
// page. The fallback is the same block without colour, which appears instantly
// and is replaced in place: nothing moves, and unhighlighted code is readable.
const CodeBlock = lazy(() => import('./CodeBlock'))

// Markdown for assistant answers: headings, paragraphs, nested lists, tables,
// blockquotes, fenced and inline code, bold, italic, strikethrough and links.
//
// Hand-written rather than a Markdown library, for one reason that matters more
// than the dependency: this builds React elements and never calls
// dangerouslySetInnerHTML, so the text cannot inject markup no matter what it
// contains. That text was written by a language model out of data a distributor
// supplied, and a general Markdown library renders raw HTML from its input by
// default. Links are scheme-checked and images are not fetched at all.
//
// Anything it does not understand is shown as written. An unrendered asterisk is
// readable; a swallowed line is not.

// breaks turns a single newline inside a paragraph into a line break instead of
// a space. Off for an answer, where the model writes prose and Markdown's own
// rule of joining wrapped lines is the right one. On for what a person typed
// into a chat box, where a newline they pressed is meant.
export function Markdown({ text, breaks = false }: { text: string; breaks?: boolean }) {
  return <div className="md">{renderBlocks(text.replace(/\r\n/g, '\n').split('\n'), breaks)}</div>
}

function renderBlocks(lines: string[], breaks = false): ReactNode[] {
  const out: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') { i++; continue }

    // Fenced code. An unclosed fence runs to the end rather than swallowing the
    // rest of the answer.
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim()
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) { body.push(lines[i]); i++ }
      i++
      const code = body.join('\n')
      out.push(
        <Suspense key={key++} fallback={<PlainCode code={code} lang={lang} />}>
          <CodeBlock code={code} lang={lang} />
        </Suspense>,
      )
      continue
    }

    const heading = /^(#{1,6})\s+(.*?)\s*#*$/.exec(line.trim())
    if (heading) {
      const depth = heading[1].length
      const Tag = `h${Math.min(depth + 2, 6)}` as 'h3' | 'h4' | 'h5' | 'h6'
      // Shifted down two levels: the page already owns h1 and h2, and an answer
      // inside a chat panel is not a document outline. The tag is still a real
      // heading so it reads as one to a screen reader.
      out.push(<Tag key={key++} className={`md-h md-h${depth}`}>{inline(heading[2])}</Tag>)
      i++
      continue
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      out.push(<hr key={key++} className="md-hr" />)
      i++
      continue
    }

    // Tables: a header row, a delimiter row of dashes, then body rows. Worth
    // supporting properly because a price comparison is the answer most likely
    // to arrive as one, and as plain text a table is unreadable.
    if (line.includes('|') && i + 1 < lines.length && isDelimiterRow(lines[i + 1])) {
      const header = splitRow(lines[i])
      const align = splitRow(lines[i + 1]).map(alignOf)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitRow(lines[i])); i++
      }
      out.push(
        <div key={key++} className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>{header.map((h, n) => <th key={n} style={{ textAlign: align[n] ?? 'left' }}>{inline(h)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, n) => (
                <tr key={n}>
                  {header.map((_, c) => (
                    <td key={c} style={{ textAlign: align[c] ?? 'left' }}>{inline(r[c] ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    if (/^\s*>/.test(line)) {
      const body: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, '')); i++
      }
      out.push(<blockquote key={key++} className="md-quote">{renderBlocks(body, breaks)}</blockquote>)
      continue
    }

    if (isBullet(line) || isNumbered(line)) {
      const [list, next] = readList(lines, i, key++, breaks)
      out.push(list)
      i = next
      continue
    }

    const para: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !isBullet(lines[i]) && !isNumbered(lines[i])
      && !lines[i].trimStart().startsWith('```') && !/^#{1,6}\s/.test(lines[i].trim())
      && !/^\s*>/.test(lines[i])) {
      para.push(lines[i].trim()); i++
    }
    if (para.length > 0) {
      out.push(
        <p key={key++}>
          {breaks
            ? para.map((l, n) => (
              <span key={n}>{n > 0 && <br />}{inline(l)}</span>
            ))
            : inline(para.join(' '))}
        </p>,
      )
    }
  }

  return out
}

// PlainCode is what a code block looks like before the highlighter arrives, and
// what it stays as if that import ever fails. Same box, same spacing.
function PlainCode({ code, lang }: { code: string; lang?: string }) {
  return (
    <div className="md-codeblock">
      {lang && <span className="md-lang">{lang}</span>}
      <pre className="md-pre"><code>{code}</code></pre>
    </div>
  )
}

const isBullet = (l: string) => /^\s*[-*+]\s+/.test(l)
const isNumbered = (l: string) => /^\s*\d+[.)]\s+/.test(l)
const indentOf = (l: string) => (/^(\s*)/.exec(l)?.[1].replace(/\t/g, '  ').length ?? 0)

// readList consumes one list, recursing for anything indented under an item.
// Nesting matters: a model writing options with sub-points produces two levels,
// and flattening them loses which point belongs to which option.
function readList(lines: string[], start: number, key: number, breaks = false): [ReactNode, number] {
  const ordered = isNumbered(lines[start])
  const baseIndent = indentOf(lines[start])
  const items: ReactNode[] = []
  let i = start

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') break
    if (!isBullet(line) && !isNumbered(line)) break
    if (indentOf(line) < baseIndent) break
    if (indentOf(line) > baseIndent) break // handled below as a child

    const text = line.trimStart().replace(/^([-*+]|\d+[.)])\s+/, '')
    i++
    // Everything indented past this item belongs to it.
    const childLines: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && indentOf(lines[i]) > baseIndent) {
      childLines.push(lines[i].slice(baseIndent + 1)); i++
    }
    items.push(
      <li key={items.length}>
        {inline(text)}
        {childLines.length > 0 && renderBlocks(childLines, breaks)}
      </li>,
    )
  }

  const list = ordered
    ? <ol key={key} className="md-ol">{items}</ol>
    : <ul key={key} className="md-ul">{items}</ul>
  return [list, i]
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
}

function isDelimiterRow(line: string): boolean {
  if (!line.includes('-')) return false
  return splitRow(line).every((c) => /^:?-{1,}:?$/.test(c))
}

function alignOf(cell: string): 'left' | 'right' | 'center' {
  if (cell.startsWith(':') && cell.endsWith(':')) return 'center'
  if (cell.endsWith(':')) return 'right'
  return 'left'
}

// safeHref allows only schemes that cannot execute. A link in this text was
// written by a language model from data a distributor supplied, so "javascript:"
// and "data:" are not hypothetical; anything else is left as plain text rather
// than silently dropped.
function safeHref(url: string): string | null {
  const trimmed = url.trim()
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) return `https://${trimmed}`
  return null
}

// inline handles code, images, links, bold, italic and strikethrough. Code
// first, so asterisks and pipes inside a span of code stay literal.
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let key = 0
  for (const part of text.split(/(`[^`]+`)/g)) {
    if (!part) continue
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      out.push(<code key={key++} className="md-code">{part.slice(1, -1)}</code>)
      continue
    }
    // Images and links share a shape; images are matched first so the leading
    // bang is not left stranded.
    for (const chunk of part.split(/(!?\[[^\]]*\]\([^)\s]+\))/g)) {
      if (!chunk) continue
      const image = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(chunk)
      if (image) {
        const href = safeHref(image[2])
        // Rendered as a link, never as an <img>. Loading it would fetch a
        // remote URL that a model or a distributor chose, which tells that host
        // the page was opened and by whom.
        out.push(href
          ? <a key={key++} href={href} target="_blank" rel="noreferrer noopener">{image[1] || 'image'}</a>
          : <span key={key++}>{chunk}</span>)
        continue
      }
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(chunk)
      if (link) {
        const href = safeHref(link[2])
        out.push(href
          ? <a key={key++} href={href} target="_blank" rel="noreferrer noopener">{link[1]}</a>
          : <span key={key++}>{chunk}</span>)
        continue
      }
      out.push(...emphasis(chunk, () => key++))
    }
  }
  return out
}

// emphasis handles bold, then strikethrough, then italic. Bold first, or its
// markers are eaten as two italics.
function emphasis(text: string, nextKey: () => number): ReactNode[] {
  const out: ReactNode[] = []
  for (const bold of text.split(/(\*\*[^*]+\*\*|__[^_]+__)/g)) {
    if (!bold) continue
    if ((bold.startsWith('**') && bold.endsWith('**') && bold.length > 4)
      || (bold.startsWith('__') && bold.endsWith('__') && bold.length > 4)) {
      out.push(<strong key={nextKey()}>{bold.slice(2, -2)}</strong>)
      continue
    }
    for (const struck of bold.split(/(~~[^~]+~~)/g)) {
      if (!struck) continue
      if (struck.startsWith('~~') && struck.endsWith('~~') && struck.length > 4) {
        out.push(<s key={nextKey()}>{struck.slice(2, -2)}</s>)
        continue
      }
      for (const piece of struck.split(/(\*[^*]+\*|_[^_]+_)/g)) {
        if (!piece) continue
        if ((piece.startsWith('*') && piece.endsWith('*') && piece.length > 2)
          || (piece.startsWith('_') && piece.endsWith('_') && piece.length > 2)) {
          out.push(<em key={nextKey()}>{piece.slice(1, -1)}</em>)
        } else {
          out.push(<span key={nextKey()}>{piece}</span>)
        }
      }
    }
  }
  return out
}
