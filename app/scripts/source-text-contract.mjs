const WINDOWS_1252_CONTINUATIONS = new Set([
  ...Array.from({ length: 64 }, (_value, index) => 0x80 + index),
  0x0152,
  0x0153,
  0x0160,
  0x0161,
  0x0178,
  0x017d,
  0x017e,
  0x0192,
  0x02c6,
  0x02dc,
  0x2013,
  0x2014,
  0x2018,
  0x2019,
  0x201a,
  0x201c,
  0x201d,
  0x201e,
  0x2020,
  0x2021,
  0x2022,
  0x2026,
  0x2030,
  0x2039,
  0x203a,
  0x20ac,
  0x2122,
])

const PUNCTUATION_CONTINUATIONS = new Set([
  ...Array.from({ length: 32 }, (_value, index) => 0x80 + index),
  0x0152,
  0x0153,
  0x0160,
  0x0161,
  0x0178,
  0x017d,
  0x017e,
  0x0192,
  0x02c6,
  0x02dc,
  0x2013,
  0x2014,
  0x2018,
  0x2019,
  0x201a,
  0x201c,
  0x201d,
  0x201e,
  0x2020,
  0x2021,
  0x2022,
  0x2026,
  0x2030,
  0x2039,
  0x203a,
  0x20ac,
  0x2122,
])

const describeIssue = (source, index, length, reason) => ({
  index,
  line: source.slice(0, index).split('\n').length,
  reason,
  codePoints: Array.from(source.slice(index, index + length))
    .map((character) => `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
    .join(' '),
})

export const findMojibake = (value) => {
  const source = String(value ?? '')
  const candidates = []

  for (let index = 0; index < source.length; index += 1) {
    const current = source.charCodeAt(index)
    const next = source.charCodeAt(index + 1)
    if ((current === 0x00c2 || current === 0x00c3) && WINDOWS_1252_CONTINUATIONS.has(next)) {
      candidates.push(describeIssue(source, index, 2, 'octets UTF-8 relus comme Windows-1252'))
    }
    if ((current === 0x00e2 || current === 0x00f0) && PUNCTUATION_CONTINUATIONS.has(next)) {
      candidates.push(describeIssue(source, index, 2, 'ponctuation ou symbole UTF-8 mal décodé'))
    }
    if (current === 0x00ef && next === 0x00bf && source.charCodeAt(index + 2) === 0x00bd) {
      candidates.push(describeIssue(source, index, 3, 'caractère de remplacement relu comme texte'))
    }
    if (current === 0xfffd) {
      candidates.push(describeIssue(source, index, 1, 'caractère de remplacement Unicode'))
    }
  }

  return candidates.sort((left, right) => left.index - right.index)[0] || null
}
