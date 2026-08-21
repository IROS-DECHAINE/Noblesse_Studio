import assert from 'node:assert/strict'
import test from 'node:test'
import { adjacentSound, soundPosition } from './soundNavigation.js'

const sounds = [
  { id: 'sound-a', kind: 'sound' },
  { id: 'material-a', kind: 'material' },
  { id: 'sound-b', kind: 'sound' },
  { id: 'sound-c', kind: 'sound' },
]

test('navigates through sounds only and wraps in both directions', () => {
  assert.equal(adjacentSound(sounds, 'sound-a', 1)?.id, 'sound-b')
  assert.equal(adjacentSound(sounds, 'sound-a', -1)?.id, 'sound-c')
  assert.equal(adjacentSound(sounds, 'sound-c', 1)?.id, 'sound-a')
  assert.deepEqual(soundPosition(sounds, 'sound-b'), { index: 1, total: 3 })
})

test('handles empty and unknown selections safely', () => {
  assert.equal(adjacentSound([], 'sound-a', 1), null)
  assert.equal(adjacentSound(sounds, 'unknown', 1)?.id, 'sound-b')
  assert.deepEqual(soundPosition([], 'unknown'), { index: 0, total: 0 })
})
