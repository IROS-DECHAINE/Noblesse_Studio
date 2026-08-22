import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  clampAssetNavigationDelta,
  computeAssetNavigationSpeed,
  dampAssetNavigationValue,
  normalizeAssetNavigationKey,
  readAssetNavigationIntent,
} from './assetCameraNavigation.js'

test('maps the requested French AZERTY asset navigation keys', () => {
  const intent = readAssetNavigationIntent(new Set(['z', 'd', 'e']))
  assert.deepEqual(intent, { forward: 1, right: 1, vertical: 1, precise: false })
  assert.deepEqual(
    readAssetNavigationIntent(new Set(['s', 'q', 'a', 'shift'])),
    { forward: -1, right: -1, vertical: -1, precise: true },
  )
  assert.equal(normalizeAssetNavigationKey('Z'), 'z')
  assert.equal(normalizeAssetNavigationKey('ArrowUp'), '')
})

test('precision mode makes camera travel five times slower', () => {
  const normal = computeAssetNavigationSpeed({ distanceToTarget: 8, precise: false })
  const precise = computeAssetNavigationSpeed({ distanceToTarget: 8, precise: true })
  assert.equal(precise, normal * 0.2)
})

test('camera movement stays bounded after a suspended frame', () => {
  assert.equal(clampAssetNavigationDelta(12), 0.05)
  assert.equal(computeAssetNavigationSpeed({ distanceToTarget: 1000, precise: false }), 12)
})

test('acceleration is smooth and frame-rate independent', () => {
  const advance = (frames, delta) => {
    let velocity = 0
    for (let frame = 0; frame < frames; frame += 1) {
      velocity = dampAssetNavigationValue({
        current: velocity,
        target: 4,
        deltaSeconds: delta,
        accelerating: true,
      })
    }
    return velocity
  }
  const at30Fps = advance(30, 1 / 30)
  const at60Fps = advance(60, 1 / 60)
  assert.ok(at30Fps > 3.9 && at30Fps < 4)
  assert.ok(Math.abs(at30Fps - at60Fps) < 1e-10)
})

test('release keeps a short inertia then converges cleanly to rest', () => {
  const firstReleaseFrame = dampAssetNavigationValue({
    current: 4,
    target: 0,
    deltaSeconds: 1 / 60,
    accelerating: false,
  })
  let velocity = firstReleaseFrame
  for (let frame = 0; frame < 90; frame += 1) {
    velocity = dampAssetNavigationValue({
      current: velocity,
      target: 0,
      deltaSeconds: 1 / 60,
      accelerating: false,
    })
  }
  assert.ok(firstReleaseFrame > 3.5 && firstReleaseFrame < 4)
  assert.ok(velocity < 0.0001)
})

test('the asset viewport owns focus, tap movement and precise orbit zoom', async () => {
  const source = await readFile(new URL('../components/AssetPreview3D.jsx', import.meta.url), 'utf8')
  assert.match(source, /tabIndex=\{0\}/)
  assert.match(source, /pendingIntentRef\.current/)
  assert.match(source, /zoomSpeed=\{0\.35\}/)
  assert.match(source, /zoomToCursor/)
  assert.match(source, /velocity\.lerp\(targetVelocity, blend\)/)
  assert.doesNotMatch(source, /<Bounds[^>]*\bobserve\b/)
  assert.match(source, /<Bounds[^>]*maxDuration=\{0\.12\}/)
  assert.match(source, /ZQSD : déplacer/)
})
