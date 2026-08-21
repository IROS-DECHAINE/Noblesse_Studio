import assert from 'node:assert/strict'
import test from 'node:test'
import { NoColorSpace, RepeatWrapping, SRGBColorSpace } from 'three'
import {
  PreviewTextureSetError,
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
