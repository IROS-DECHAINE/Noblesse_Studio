import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveMaterialPreviewSources, studioApi, vaultPreviewSourceUrl } from './desktopApi.js'

test('resolves descriptor sources through the confined web endpoint', () => {
  const previousWindow = globalThis.window
  delete globalThis.window
  try {
    const descriptor = resolveMaterialPreviewSources({
      schemaVersion: 1,
      previewSource: 'packs/Test/rendered.webp',
      maps: {
        baseColor: { source: 'packs/Test/base.png', colorSpace: 'srgb' },
        normal: null,
      },
      graph: {
        textures: [{ assetName: 'Flow', source: 'packs/Test/flow.jpg' }],
      },
    })

    assert.equal(descriptor.previewUrl, '/api/vault-preview?source=packs%2FTest%2Frendered.webp')
    assert.equal(descriptor.maps.baseColor.url, '/api/vault-preview?source=packs%2FTest%2Fbase.png')
    assert.equal(descriptor.maps.normal, null)
    assert.equal(descriptor.graph.textures[0].url, '/api/vault-preview?source=packs%2FTest%2Fflow.jpg')
    assert.equal(vaultPreviewSourceUrl('../outside.png'), '')
    assert.equal(vaultPreviewSourceUrl('https://example.test/image.png'), '')
    assert.equal(vaultPreviewSourceUrl('packs/Test/source.tga'), '')
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})

test('uses the desktop-only Noblesse Vault protocol when the preload bridge is present', () => {
  const previousWindow = globalThis.window
  globalThis.window = { noblesseDesktop: {} }
  try {
    assert.equal(
      vaultPreviewSourceUrl('packs/Test/base.png'),
      'noblesse-vault://preview/packs%2FTest%2Fbase.png',
    )
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})

test('loads one descriptor on demand through the desktop bridge', async () => {
  const previousWindow = globalThis.window
  let requestedAssetId = ''
  globalThis.window = {
    noblesseDesktop: {
      getMaterialPreview: async (assetId) => {
        requestedAssetId = assetId
        return { schemaVersion: 1, assetId, mode: 'rendered_capture', previewSource: 'packs/Test/proof.png' }
      },
    },
  }
  try {
    const descriptor = await studioApi.materialPreview('NOB-MAT-TEST')
    assert.equal(requestedAssetId, 'NOB-MAT-TEST')
    assert.equal(descriptor.previewUrl, 'noblesse-vault://preview/packs%2FTest%2Fproof.png')
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})
