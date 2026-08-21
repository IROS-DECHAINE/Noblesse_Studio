import assert from 'node:assert/strict'
import test from 'node:test'
import { NoColorSpace, RepeatWrapping, SRGBColorSpace } from 'three'
import {
  PreviewTextureSetError,
  descriptorTextureRequests,
  loadPreviewTextureSet,
} from './useAtomicTextureSet.js'

const request = (role, colorSpace = 'linear') => ({
  role,
  colorSpace,
  transform: { offset: [0, 0], repeat: [1, 1], rotation: 0 },
  uri: `noblesse-vault://preview/${role}.png`,
})

const fakeTexture = () => ({
  isTexture: true,
  colorSpace: '',
  wrapS: 0,
  wrapT: 0,
  repeat: { set() {} },
  offset: { set() {} },
  center: { set() {} },
  rotation: 0,
  anisotropy: 0,
  needsUpdate: false,
  disposeCount: 0,
  dispose() { this.disposeCount += 1 },
})

test('commits one shared ORM texture atomically with explicit color spaces', async () => {
  const textures = await loadPreviewTextureSet(
    [request('baseColor', 'srgb'), request('orm')],
    {
      maxAnisotropy: 32,
      loadTexture: async () => {
        const texture = fakeTexture()
        return texture
      },
    },
  )

  assert.equal(textures.baseColor.colorSpace, SRGBColorSpace)
  assert.equal(textures.orm.colorSpace, NoColorSpace)
  assert.equal(textures.orm.wrapS, RepeatWrapping)
  assert.equal(textures.orm.wrapT, RepeatWrapping)
  assert.equal(textures.orm.anisotropy, 16)
  assert.strictEqual(textures.ao, textures.orm)
  assert.strictEqual(textures.roughness, textures.orm)
  assert.strictEqual(textures.metalness, textures.orm)
})

test('decodes an evidence-backed Unreal ORM transfer without changing its linear semantics', () => {
  const descriptor = {
    schemaVersion: 1,
    assetId: 'native-unreal-preview',
    animated: false,
    mode: 'pbr_maps',
    previewSource: 'packs/Test/capture.png',
    material: {
      baseColor: [1, 1, 1, 1],
      emissiveColor: [0, 0, 0, 1],
      emissiveIntensity: 0,
      metalness: 1,
      roughness: 1,
      specularIntensity: 0.5,
    },
    maps: {
      baseColor: { source: 'base.webp', url: 'noblesse-vault://preview/base.webp', colorSpace: 'srgb' },
      normal: { source: 'normal.webp', url: 'noblesse-vault://preview/normal.webp', colorSpace: 'linear' },
      orm: {
        source: 'orm.webp',
        url: 'noblesse-vault://preview/orm.webp',
        colorSpace: 'linear',
        channels: 'R=AO · G=Roughness · B=Metallic',
        decode: 'srgb',
      },
    },
  }
  const orm = descriptorTextureRequests(descriptor).find((entry) => entry.role === 'orm')
  assert.equal(orm.colorSpace, 'srgb')
})

test('disposes every fulfilled texture and commits nothing when one role fails', async () => {
  const loaded = fakeTexture()
  await assert.rejects(
    loadPreviewTextureSet(
      [request('baseColor', 'srgb'), request('normal')],
      {
        loadTexture: async (_uri, { request: textureRequest }) => {
          if (textureRequest.role === 'normal') throw new Error('decode failed')
          return loaded
        },
      },
    ),
    (error) => error instanceof PreviewTextureSetError && error.code === 'TEXTURE_SET_LOAD_FAILED',
  )
  assert.equal(loaded.disposeCount, 1)
})
