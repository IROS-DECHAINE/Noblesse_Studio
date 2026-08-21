import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LAYOUT_STORAGE_KEY,
  defaultStudioLayout,
  layoutLimits,
  loadStudioLayout,
  maxInspectorWidthFor,
  maxPreviewHeightFor,
  normalizeStudioLayout,
  saveStudioLayout,
} from './layoutPreferences.js'

const memoryStorage = (initialValue = null) => {
  const values = new Map(initialValue === null ? [] : [[LAYOUT_STORAGE_KEY, initialValue]])
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('normalizes persisted column sizes within safe layout bounds', () => {
  assert.deepEqual(normalizeStudioLayout({
    schemaVersion: 1,
    sidebarWidth: 20,
    sidebarCollapsed: true,
    inspectorWidth: 5000,
  }), {
    schemaVersion: 1,
    sidebarWidth: layoutLimits.sidebar.min,
    sidebarCollapsed: true,
    inspectorWidth: layoutLimits.inspector.max,
  })
})

test('allows a 50 percent wider inspector while preserving two Coffre cards', () => {
  assert.equal(layoutLimits.inspector.max, 1020)
  assert.equal(maxInspectorWidthFor(1536), 1020)
  assert.equal(maxInspectorWidthFor(1100), 630)
  assert.equal(maxInspectorWidthFor(500), layoutLimits.inspector.min)
})

test('reserves viewport space for material variants and facts below the preview', () => {
  assert.equal(maxPreviewHeightFor(1_440), layoutLimits.preview.max)
  assert.equal(maxPreviewHeightFor(972), layoutLimits.preview.max)
  assert.equal(maxPreviewHeightFor(900), 480)
  assert.equal(maxPreviewHeightFor(768), 348)
  assert.equal(maxPreviewHeightFor(500), layoutLimits.preview.min)
})

test('loads defaults after corrupt or unsupported layout state', () => {
  assert.deepEqual(loadStudioLayout(memoryStorage('{not-json')), defaultStudioLayout)
  assert.deepEqual(loadStudioLayout(memoryStorage(JSON.stringify({ schemaVersion: 99 }))), defaultStudioLayout)
})

test('persists only the versioned normalized layout envelope', () => {
  const storage = memoryStorage()
  const saved = saveStudioLayout({
    schemaVersion: 1,
    sidebarWidth: 248.4,
    sidebarCollapsed: false,
    inspectorWidth: 520.8,
    privateField: 'ignored',
  }, storage)

  assert.deepEqual(saved, {
    schemaVersion: 1,
    sidebarWidth: 248,
    sidebarCollapsed: false,
    inspectorWidth: 521,
  })
  assert.deepEqual(JSON.parse(storage.getItem(LAYOUT_STORAGE_KEY)), saved)
})
