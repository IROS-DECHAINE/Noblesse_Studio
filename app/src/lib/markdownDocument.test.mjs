import assert from 'node:assert/strict'
import test from 'node:test'

import {
  markdownToPlainText,
  normalizeMarkdown,
  parseInlineMarkdown,
  parseMarkdownDocument,
  safeDocumentUrl,
} from './markdownDocument.js'

test('normalizes Windows newlines and removes an optional BOM', () => {
  assert.equal(normalizeMarkdown('\uFEFF# Canon\r\n\rSuite'), '# Canon\n\nSuite')
})

test('parses the document structures used by canonical Markdown files', () => {
  const blocks = parseMarkdownDocument(`# Canon produit

> Source de vérité du projet.

- [x] Direction validée
- [ ] Test terrain

| Étape | Statut |
| --- | --- |
| Vision | Canon |

\`\`\`verse
OnBegin():void = {}
\`\`\``)

  assert.deepEqual(blocks.map((block) => block.type), ['heading', 'quote', 'list', 'table', 'code'])
  assert.equal(blocks[0].level, 1)
  assert.deepEqual(blocks[2].items.map((item) => item.checked), [true, false])
  assert.deepEqual(blocks[3].headers, ['Étape', 'Statut'])
  assert.deepEqual(blocks[3].rows, [['Vision', 'Canon']])
  assert.equal(blocks[4].language, 'verse')
})

test('keeps raw HTML inert and rejects executable Markdown URLs', () => {
  const inline = parseInlineMarkdown('<script>alert(1)</script> [ouvrir](javascript:alert(1)) **Canon**')
  assert.equal(inline.some((segment) => segment.type === 'link'), false)
  assert.equal(inline.some((segment) => segment.type === 'strong' && segment.text === 'Canon'), true)
  assert.match(inline.map((segment) => segment.text).join(''), /<script>/)
  assert.equal(safeDocumentUrl('javascript:alert(1)'), '')
  assert.equal(safeDocumentUrl('noblesse-doc://file/abc'), 'noblesse-doc://file/abc')
})

test('extracts a useful plain-text version without Markdown punctuation', () => {
  const text = markdownToPlainText('# **Vision**\n\nUne expérience *lisible*.\n\n- Boucle principale')
  assert.equal(text, 'Vision\nUne expérience lisible.\nBoucle principale')
})
