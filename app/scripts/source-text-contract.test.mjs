import assert from 'node:assert/strict'
import test from 'node:test'

import { findMojibake } from './source-text-contract.mjs'

test('accepts valid UTF-8 text used by the interface', () => {
  assert.equal(findMojibake('Méthode autorisée, aperçu prêt, tâche créée et opération terminée. Âge : 10 ans.'), null)
})

test('rejects common mojibake forms with an actionable line number', () => {
  const cases = [
    `M${String.fromCodePoint(0x00c3, 0x00a9)}thode`,
    `L${String.fromCodePoint(0x00e2, 0x20ac, 0x2122)}opération`,
    `Icône ${String.fromCodePoint(0x00f0, 0x0178, 0x2018)}`,
    `Texte ${String.fromCodePoint(0x00ef, 0x00bf, 0x00bd)}`,
    `Texte ${String.fromCodePoint(0xfffd)}`,
  ]

  for (const source of cases) {
    const issue = findMojibake(`Ligne saine\n${source}`)
    assert.ok(issue)
    assert.equal(issue.line, 2)
    assert.match(issue.codePoints, /^U\+[0-9A-F]{4}/)
  }
})
