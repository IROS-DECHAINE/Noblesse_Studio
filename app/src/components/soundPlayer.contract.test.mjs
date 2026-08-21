import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const sourceUrl = new URL('./SoundInspector.jsx', import.meta.url)

test('sound inspector exposes a dedicated seekable timeline with explicit total duration', async () => {
  const source = await readFile(sourceUrl, 'utf8')
  assert.match(source, /type="range"/)
  assert.match(source, /aria-label="Position de lecture"/)
  assert.match(source, /onTimeUpdate=/)
  assert.match(source, /Durée totale/)
  assert.doesNotMatch(source, /<audio[^>]*\scontrols(?:\s|=|>)/)
})
