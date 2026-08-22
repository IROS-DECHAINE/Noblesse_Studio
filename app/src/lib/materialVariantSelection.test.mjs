import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { describeMaterialVariantSelection, reconcileMaterialVariantId } from './materialVariantSelection.js'

const material = (id = 'art-deco', variantIds = ['ceiling', 'floor', 'wall']) => ({
  id,
  variantOptions: variantIds.map((variantId) => ({ id: variantId })),
})

describe('material variant selection', () => {
  test('preserves the chosen variant when a vault refresh recreates the same material data', () => {
    const beforeRefresh = describeMaterialVariantSelection(material())
    const afterRefresh = describeMaterialVariantSelection(material())

    assert.notStrictEqual(beforeRefresh.variantIds, afterRefresh.variantIds)
    assert.equal(beforeRefresh.key, afterRefresh.key)
    assert.equal(reconcileMaterialVariantId({
      currentVariantId: 'floor',
      previousSurfaceId: beforeRefresh.surfaceId,
      selection: afterRefresh,
    }), 'floor')
  })

  test('selects the first variant when the user opens another material', () => {
    const selection = describeMaterialVariantSelection(material('concrete', ['clean', 'worn']))

    assert.equal(reconcileMaterialVariantId({
      currentVariantId: 'wall',
      previousSurfaceId: 'art-deco',
      selection,
    }), 'clean')
  })

  test('falls back safely when the selected variant disappears from the catalog', () => {
    const selection = describeMaterialVariantSelection(material('art-deco', ['ceiling', 'wall']))

    assert.equal(reconcileMaterialVariantId({
      currentVariantId: 'floor',
      previousSurfaceId: 'art-deco',
      selection,
    }), 'ceiling')
  })
})
