import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clampPlaybackTime,
  formatPlaybackTime,
  playbackProgress,
  resolvePlaybackDuration,
} from './audioTimeline.js'

test('formats short and long audio positions without inventing negative time', () => {
  assert.equal(formatPlaybackTime(0), '0:00')
  assert.equal(formatPlaybackTime(65.9), '1:05')
  assert.equal(formatPlaybackTime(3_661), '1:01:01')
  assert.equal(formatPlaybackTime(-5), '0:00')
})

test('clamps seeking and progress to the known duration', () => {
  assert.equal(clampPlaybackTime(12.5, 90), 12.5)
  assert.equal(clampPlaybackTime(-4, 90), 0)
  assert.equal(clampPlaybackTime(120, 90), 90)
  assert.equal(clampPlaybackTime(20, 0), 0)
  assert.equal(playbackProgress(45, 90), 50)
  assert.equal(playbackProgress(120, 90), 100)
})

test('prefers measured metadata while retaining the catalog duration as fallback', () => {
  assert.equal(resolvePlaybackDuration(42.25, 40), 42.25)
  assert.equal(resolvePlaybackDuration(Number.NaN, 40), 40)
  assert.equal(resolvePlaybackDuration(Infinity, 40), 40)
  assert.equal(resolvePlaybackDuration(0, 0), 0)
})
