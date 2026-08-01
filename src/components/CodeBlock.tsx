// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import type { ReactNode } from 'react'
import Prism from 'prismjs'

// Grammars are side-effecting imports that register themselves on Prism, and
// several build on another, so the order is load-bearing: c must come before
// cpp, markup before jsx. Only languages that plausibly turn up in an answer
// about electronics and firmware, because every grammar is bundle weight paid
// by every page.
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-ini'
import 'prismjs/components/prism-verilog'
import 'prismjs/components/prism-vhdl'
import 'prismjs/components/prism-typescript'

// ALIASES maps what people actually write in a fence onto a grammar name.
// "c++" is the obvious one, and the one that started this.
const ALIASES: Record<string, string> = {
  'c++': 'cpp', cxx: 'cpp', cc: 'cpp', h: 'c', hpp: 'cpp',
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  py: 'python', sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash',
  yml: 'yaml', golang: 'go', rs: 'rust', toml: 'ini', conf: 'ini',
  postgres: 'sql', psql: 'sql', v: 'verilog', sv: 'verilog',
}

// highlight renders code as React elements.
//
// Prism's usual API returns a string of HTML, which would mean
// dangerouslySetInnerHTML on text a language model wrote. tokenize returns the
// token tree instead, so the same highlighting is built as elements and there
// is no HTML to inject into.
function render(tokens: (string | Prism.Token)[], keyPrefix = ''): ReactNode[] {
  return tokens.map((token, i) => {
    const key = `${keyPrefix}${i}`
    if (typeof token === 'string') return <span key={key}>{token}</span>
    const content = Array.isArray(token.content)
      ? render(token.content, `${key}-`)
      : typeof token.content === 'string'
        ? token.content
        : render([token.content], `${key}-`)
    return <span key={key} className={`tok tok-${token.type}`}>{content}</span>
  })
}

export default function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const name = lang ? (ALIASES[lang.toLowerCase()] ?? lang.toLowerCase()) : ''
  const grammar = name ? Prism.languages[name] : undefined

  return (
    <div className="md-codeblock">
      {lang && <span className="md-lang">{lang}</span>}
      <pre className="md-pre"><code>
        {/* An unknown or absent language is shown as plain text rather than
            guessed at. A wrong highlight is worse than none: it puts emphasis
            on the wrong words and reads as though the block were understood. */}
        {grammar ? render(Prism.tokenize(code, grammar)) : code}
      </code></pre>
    </div>
  )
}
