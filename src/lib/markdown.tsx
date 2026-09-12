import React from 'react'

/**
 * Safely converts inline markdown formatting (bold, italic, code) into native React elements.
 * Never uses dangerouslySetInnerHTML to prevent XSS.
 */
function parseInline(text: string): React.ReactNode[] {
  // Regex to match **bold**, *italic*, `code`
  const tokens: React.ReactNode[] = []
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index))
    }
    const token = match[0]
    if (token.startsWith('**') && token.endsWith('**')) {
      tokens.push(<strong key={match.index}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('*') && token.endsWith('*')) {
      tokens.push(<em key={match.index}>{token.slice(1, -1)}</em>)
    } else if (token.startsWith('`') && token.endsWith('`')) {
      tokens.push(<code key={match.index} className="inline-code">{token.slice(1, -1)}</code>)
    }
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex))
  }

  return tokens.length > 0 ? tokens : [text]
}

/**
 * Safe markdown renderer for AI advisor responses.
 * Parses headings, bullet points, numbered lists, tables, and paragraphs.
 */
export function SafeMarkdown({ content }: { content: string }) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let listItems: React.ReactNode[] = []
  let isNumberedList = false
  let tableRows: string[][] = []

  const flushList = () => {
    if (listItems.length > 0) {
      if (isNumberedList) {
        elements.push(<ol key={`ol-${elements.length}`} className="md-ol">{listItems}</ol>)
      } else {
        elements.push(<ul key={`ul-${elements.length}`} className="md-ul">{listItems}</ul>)
      }
      listItems = []
      isNumberedList = false
    }
  }

  const flushTable = () => {
    if (tableRows.length > 0) {
      const header = tableRows[0]
      const body = tableRows.slice(1).filter(r => !r.every(cell => cell.trim().match(/^-+$/)))

      elements.push(
        <div key={`table-${elements.length}`} className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>
                {header.map((cell, idx) => (
                  <th key={idx}>{parseInline(cell.trim())}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx}>{parseInline(cell.trim())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      tableRows = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const trimmed = rawLine.trim()

    if (!trimmed) {
      flushList()
      flushTable()
      continue
    }

    // Markdown Table row: | col | col |
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushList()
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map(c => c.trim())
      // Check if separator line (e.g. |---|---|)
      if (cells.every(c => /^:?-+:?$/.test(c))) {
        continue
      }
      tableRows.push(cells)
      continue
    } else {
      flushTable()
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      flushList()
      elements.push(<h4 key={`h3-${i}`} className="md-h4">{parseInline(trimmed.slice(4))}</h4>)
      continue
    }
    if (trimmed.startsWith('## ')) {
      flushList()
      elements.push(<h3 key={`h2-${i}`} className="md-h3">{parseInline(trimmed.slice(3))}</h3>)
      continue
    }
    if (trimmed.startsWith('# ')) {
      flushList()
      elements.push(<h2 key={`h1-${i}`} className="md-h2">{parseInline(trimmed.slice(2))}</h2>)
      continue
    }

    // Bullet points
    if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (isNumberedList) flushList()
      const text = trimmed.replace(/^[•\-*]\s+/, '')
      listItems.push(<li key={`li-${i}`}>{parseInline(text)}</li>)
      continue
    }

    // Numbered lists (e.g. "1. ")
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/)
    if (numMatch) {
      if (!isNumberedList && listItems.length > 0) flushList()
      isNumberedList = true
      listItems.push(<li key={`li-${i}`}>{parseInline(numMatch[2])}</li>)
      continue
    }

    // Regular paragraph
    flushList()
    elements.push(<p key={`p-${i}`} className="md-p">{parseInline(trimmed)}</p>)
  }

  flushList()
  flushTable()

  return <div className="safe-markdown">{elements}</div>
}
