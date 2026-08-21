const TABLE_DIVIDER = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/
const LIST_ITEM = /^(\s*)([-+*]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.+)$/

export function normalizeMarkdown(source) {
  return String(source ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
}

export function safeDocumentUrl(value, { image = false } = {}) {
  const url = String(value ?? '').trim()
  if (!url || /[\u0000-\u001F\u007F]/.test(url)) return ''
  if (url.startsWith('#') || url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) return url
  if (image && /^data:image\/(?:avif|gif|jpeg|png|webp);base64,/i.test(url)) return url

  try {
    const parsed = new URL(url)
    const allowed = image
      ? ['blob:', 'http:', 'https:', 'noblesse-doc:']
      : ['blob:', 'http:', 'https:', 'mailto:', 'noblesse-doc:']
    return allowed.includes(parsed.protocol) ? url : ''
  } catch {
    return ''
  }
}

export function parseInlineMarkdown(value) {
  const source = String(value ?? '')
  const pattern = /(!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|\*([^*\n]+)\*|_([^_\n]+)_)/g
  const segments = []
  let cursor = 0
  let match

  while ((match = pattern.exec(source))) {
    if (match.index > cursor) segments.push({ type: 'text', text: source.slice(cursor, match.index) })

    const token = match[0]
    if (match[2] !== undefined) {
      const isImage = token.startsWith('!')
      const href = safeDocumentUrl(match[3], { image: isImage })
      if (href) {
        segments.push({
          type: isImage ? 'image' : 'link',
          text: match[2],
          href,
          title: match[4] || '',
        })
      } else {
        segments.push({ type: 'text', text: token })
      }
    } else if (match[5] !== undefined) {
      segments.push({ type: 'code', text: match[5] })
    } else if (match[6] !== undefined || match[7] !== undefined) {
      segments.push({ type: 'strong', text: match[6] ?? match[7] })
    } else if (match[8] !== undefined) {
      segments.push({ type: 'delete', text: match[8] })
    } else {
      segments.push({ type: 'emphasis', text: match[9] ?? match[10] })
    }

    cursor = match.index + token.length
  }

  if (cursor < source.length) segments.push({ type: 'text', text: source.slice(cursor) })
  return segments.length ? segments : [{ type: 'text', text: source }]
}

function splitTableRow(line) {
  let value = String(line ?? '').trim()
  if (value.startsWith('|')) value = value.slice(1)
  if (value.endsWith('|') && !value.endsWith('\\|')) value = value.slice(0, -1)

  const cells = []
  let current = ''
  let escaped = false
  for (const character of value) {
    if (escaped) {
      current += character
      escaped = false
    } else if (character === '\\') {
      escaped = true
    } else if (character === '|') {
      cells.push(current.trim())
      current = ''
    } else {
      current += character
    }
  }
  if (escaped) current += '\\'
  cells.push(current.trim())
  return cells
}

function isTableStart(lines, index) {
  return index + 1 < lines.length
    && lines[index].includes('|')
    && TABLE_DIVIDER.test(lines[index + 1])
}

function isBlockStart(lines, index) {
  const line = lines[index] || ''
  return !line.trim()
    || /^\s*```/.test(line)
    || /^#{1,6}\s+/.test(line)
    || /^\s*>\s?/.test(line)
    || LIST_ITEM.test(line)
    || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)
    || isTableStart(lines, index)
}

export function parseMarkdownDocument(source) {
  const lines = normalizeMarkdown(source).split('\n')
  const blocks = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    const fence = line.match(/^\s*```\s*([^\s`]*)\s*$/)
    if (fence) {
      const code = []
      index += 1
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        code.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ type: 'code', language: fence[1] || '', text: code.join('\n') })
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] })
      index += 1
      continue
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: 'divider' })
      index += 1
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      const quote = []
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }
      blocks.push({ type: 'quote', text: quote.join(' ') })
      continue
    }

    const firstListItem = line.match(LIST_ITEM)
    if (firstListItem) {
      const ordered = /^\d/.test(firstListItem[2])
      const items = []
      while (index < lines.length) {
        const item = lines[index].match(LIST_ITEM)
        if (!item || /^\d/.test(item[2]) !== ordered) break
        items.push({
          text: item[4],
          checked: item[3] === undefined ? null : item[3].toLowerCase() === 'x',
        })
        index += 1
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    if (isTableStart(lines, index)) {
      const headers = splitTableRow(lines[index])
      index += 2
      const rows = []
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        const cells = splitTableRow(lines[index])
        rows.push(headers.map((_, cellIndex) => cells[cellIndex] || ''))
        index += 1
      }
      blocks.push({ type: 'table', headers, rows })
      continue
    }

    const paragraph = [line.trim()]
    index += 1
    while (index < lines.length && !isBlockStart(lines, index)) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
  }

  return blocks
}

export function markdownToPlainText(source) {
  return parseMarkdownDocument(source)
    .flatMap((block) => {
      if (block.type === 'table') return [block.headers, ...block.rows].flat()
      if (block.type === 'list') return block.items.map((item) => item.text)
      if (typeof block.text === 'string') return [block.text]
      return []
    })
    .map((text) => parseInlineMarkdown(text).map((segment) => segment.text).join(''))
    .join('\n')
    .trim()
}
