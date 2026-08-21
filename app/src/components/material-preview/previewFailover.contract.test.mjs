import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertMaterialPreviewDescriptor,
  MATERIAL_PREVIEW_MODES,
  MATERIAL_PREVIEW_SHAPES,
  materialPreviewResourceKey,
} from './previewContract.js'
import { resolveAtomicPreviewFailover } from './useAtomicPreviewFailover.js'

const material = {
  baseColor: [0.32, 0.42, 0.58, 1],
  emissiveColor: [0, 0, 0, 1],
  emissiveIntensity: 0,
  metalness: 0.1,
  roughness: 0.45,
  specularIntensity: 0.5,
}

const descriptor = (mode, overrides = {}) => ({
  schemaVersion: 1,
  assetId: `contract-${mode}`,
  animated: false,
  mode,
  previewSource: '',
  ...overrides,
})

test('PreviewDescriptorV1 exposes a closed mode and shape vocabulary', () => {
  assert.deepEqual(MATERIAL_PREVIEW_MODES, [
    'rendered_capture',
    'pbr_maps',
    'solid_parameters',
    'shader_recipe',
    'texture_reference',
    'unsupported',
  ])
  assert.deepEqual(MATERIAL_PREVIEW_SHAPES, ['sphere', 'plane'])

  assert.throws(
    () => assertMaterialPreviewDescriptor(descriptor('rendered_capture')),
    (error) => error?.code === 'MISSING_SOURCE_CAPTURE',
  )
  assert.throws(
    () => assertMaterialPreviewDescriptor(descriptor('unsupported')),
    (error) => error?.code === 'MISSING_UNSUPPORTED_REASON',
  )
  assert.throws(
    () => assertMaterialPreviewDescriptor(descriptor('invented_mode')),
    (error) => error?.code === 'UNSUPPORTED_MODE',
  )
})

test('loading and exact-render failures keep a silent shape-aware source presentation', () => {
  for (const shape of ['sphere', 'plane']) {
    const loading = resolveAtomicPreviewFailover({
      descriptorState: { descriptor: null, error: null, status: 'loading' },
      previewUrl: '/assets/source.png',
      shape,
    })
    assert.deepEqual(
      {
        diagnostic: loading.diagnostic,
        label: loading.label,
        mode: loading.mode,
        previewUrl: loading.previewUrl,
        shape: loading.shape,
      },
      {
        diagnostic: 'loading',
        label: 'Aperçu source',
        mode: 'source',
        previewUrl: '/assets/source.png',
        shape,
      },
    )

    const unsupported = resolveAtomicPreviewFailover({
      descriptorState: {
        descriptor: descriptor('unsupported', { unsupportedReason: 'unsupported graph' }),
        error: null,
        status: 'ready',
      },
      shape,
      surfacePreviewUrl: '/assets/fallback.png',
    })
    assert.equal(unsupported.mode, 'source')
    assert.equal(unsupported.previewUrl, '/assets/fallback.png')
    assert.equal(unsupported.shape, shape)
    assert.equal(unsupported.label, 'Aperçu source')
    assert.doesNotMatch(unsupported.label, /secours|erreur|échec/i)
  }
})

test('rendered captures retain source truth while both sphere and plane remain selectable', () => {
  const capture = descriptor('rendered_capture', {
    previewSource: '/assets/unreal-capture.png',
  })

  for (const shape of ['sphere', 'plane']) {
    const presentation = resolveAtomicPreviewFailover({
      descriptorState: { descriptor: capture, error: null, status: 'ready' },
      previewUrl: capture.previewSource,
      shape,
    })
    assert.equal(presentation.mode, 'source')
    assert.equal(presentation.sourceKind, 'rendered_capture')
    assert.equal(presentation.label, 'Capture source')
    assert.equal(presentation.previewUrl, capture.previewSource)
    assert.equal(presentation.shape, shape)
  }
})

test('an atomic texture transition never exposes a half-loaded live material', () => {
  const pbr = descriptor('pbr_maps', {
    material,
    maps: {
      baseColor: { source: '/assets/bc.png', colorSpace: 'srgb' },
      normal: { source: '/assets/n.png', colorSpace: 'linear' },
      orm: {
        source: '/assets/orm.png',
        colorSpace: 'linear',
        channels: 'R=AO · G=Roughness · B=Metallic',
      },
      emissive: null,
    },
  })
  const resourceKey = materialPreviewResourceKey(pbr)
  const sourceOptions = {
    descriptorState: { descriptor: pbr, error: null, status: 'ready' },
    previewUrl: '/assets/source.png',
    shape: 'sphere',
  }

  for (const textureState of [
    { status: 'loading', resourceKey: '', textures: null },
    { status: 'ready', resourceKey: 'stale-resource', textures: { baseColor: {} } },
    { status: 'error', resourceKey: '', textures: null },
  ]) {
    const presentation = resolveAtomicPreviewFailover({ ...sourceOptions, textureState })
    assert.equal(presentation.mode, 'source')
    assert.equal(presentation.previewUrl, '/assets/source.png')
  }

  const textures = Object.freeze({ baseColor: {}, normal: {}, orm: {} })
  const live = resolveAtomicPreviewFailover({
    ...sourceOptions,
    textureState: { status: 'ready', resourceKey, textures },
  })
  assert.equal(live.mode, 'live')
  assert.equal(live.resourceKey, resourceKey)
  assert.strictEqual(live.textures, textures)
})

test('shader recipes become live only with the matching compiled runtime plan', () => {
  const shader = descriptor('shader_recipe', {
    animated: true,
    graph: { nodes: [{ id: 'clock', kind: 'Time', properties: {} }], connections: [], outputs: [] },
    material,
  })
  const resourceKey = materialPreviewResourceKey(shader)
  const common = {
    descriptorState: { descriptor: shader, error: null, status: 'ready' },
    previewUrl: '/assets/source.png',
    shape: 'plane',
  }

  assert.equal(resolveAtomicPreviewFailover({
    ...common,
    runtimeState: { status: 'ready', resourceKey: 'stale', plan: {} },
  }).mode, 'source')

  const plan = { kind: 'shader_recipe_plan' }
  const live = resolveAtomicPreviewFailover({
    ...common,
    runtimeState: { status: 'ready', resourceKey, plan },
    textureState: { status: 'ready', resourceKey, textures: {} },
  })
  assert.equal(live.mode, 'live')
  assert.strictEqual(live.runtimePlan, plan)
  assert.equal(live.shape, 'plane')
})
