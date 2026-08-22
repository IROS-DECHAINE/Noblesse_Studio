import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_SIDEBAR_MATERIAL,
  DEFAULT_SKIN_ID,
  DEFAULT_SKIN_MOTION,
  SKINS,
  SKIN_STORAGE_KEY,
  getSkinDefinition,
  loadSkinPreferences,
  normalizeSkinPreferences,
  saveSkinPreferences,
} from './skinPreferences.js'

const createStorage = (initialValue = null) => {
  let value = initialValue
  return {
    getItem: (key) => key === SKIN_STORAGE_KEY ? value : null,
    setItem: (key, nextValue) => {
      if (key === SKIN_STORAGE_KEY) value = nextValue
    },
    value: () => value,
  }
}

test('skin definitions use unique ids and 4K texture assets', () => {
  assert.equal(new Set(SKINS.map((skin) => skin.id)).size, SKINS.length)
  assert.ok(SKINS.every((skin) => skin.asset.endsWith('-4k.png')))
})

test('skin preferences reject unknown persisted values', () => {
  assert.deepEqual(normalizeSkinPreferences({ skinId: 'unknown', motion: 'fast' }), {
    skinId: DEFAULT_SKIN_ID,
    motion: DEFAULT_SKIN_MOTION,
    sidebarMaterial: DEFAULT_SIDEBAR_MATERIAL,
  })
  assert.equal(getSkinDefinition('unknown').id, DEFAULT_SKIN_ID)
})

test('skin preferences survive a storage round trip', () => {
  const storage = createStorage()
  saveSkinPreferences({ skinId: 'jade-imperiale', motion: 'calm', sidebarMaterial: 'skin' }, storage)
  assert.deepEqual(loadSkinPreferences(storage), {
    skinId: 'jade-imperiale',
    motion: 'calm',
    sidebarMaterial: 'skin',
  })
})

test('legacy skin preferences adopt Mirror Glass without losing the selected skin', () => {
  const storage = createStorage(JSON.stringify({ skinId: 'aurore-liquide', motion: 'calm' }))
  assert.deepEqual(loadSkinPreferences(storage), {
    skinId: 'aurore-liquide',
    motion: 'calm',
    sidebarMaterial: DEFAULT_SIDEBAR_MATERIAL,
  })
})

test('malformed storage falls back without throwing', () => {
  const storage = createStorage('{not-json')
  assert.deepEqual(loadSkinPreferences(storage), {
    skinId: DEFAULT_SKIN_ID,
    motion: DEFAULT_SKIN_MOTION,
    sidebarMaterial: DEFAULT_SIDEBAR_MATERIAL,
  })
})
