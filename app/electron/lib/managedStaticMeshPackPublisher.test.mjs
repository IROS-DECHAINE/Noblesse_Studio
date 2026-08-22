import assert from 'node:assert/strict'
import test from 'node:test'
import { managedStaticMeshPackPublisherInternals } from './managedStaticMeshPackPublisher.mjs'

test('builds bounded PBR dependency recipes and marks OpenGL normals for conversion', () => {
  const hashes = new Map([
    ['textures/Wood_BaseColor.png', 'a'.repeat(64)],
    ['textures/Wood_Normal_OpenGL.png', 'b'.repeat(64)],
    ['textures/Wood_Roughness.png', 'c'.repeat(64)],
  ])
  const result = managedStaticMeshPackPublisherInternals.buildMaterialRecipe({}, {
    assetId: 'NOB-MAT-WOOD',
    assetName: 'M_NBL_Wood',
    label: 'Bois',
    baseColor: 'textures/Wood_BaseColor.png',
    normal: 'textures/Wood_Normal_OpenGL.png',
    roughness: 'textures/Wood_Roughness.png',
  }, hashes, 'packs/Test/source')

  assert.equal(result.recipe.textures.length, 3)
  assert.equal(result.recipe.textures.find((texture) => texture.assetName.endsWith('_N')).flipGreenChannel, true)
  assert.deepEqual(result.recipe.outputs.map((output) => output.property), ['MP_BaseColor', 'MP_Normal', 'MP_Roughness'])
  assert.equal(new Set(result.textureAssets.map((texture) => texture.assetId)).size, 3)
})
