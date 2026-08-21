import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MATERIAL_PREVIEW_SCHEMA_VERSION,
  createMaterialPreviewDescriptor,
} from './materialPreviewDescriptor.mjs'

const asset = (overrides = {}) => ({
  asset_id: 'preview-contract-asset',
  asset_type: 'MaterialRecipe',
  animated: false,
  preview_color: '#29435f',
  ...overrides,
})

const staticColorRecipe = () => ({
  textures: [],
  nodes: [{ id: 'base', kind: 'Vector', properties: { DefaultValueHex: '#8aa0b8' } }],
  connections: [],
  outputs: [{ node: 'base', pin: 'RGB', property: 'MP_BaseColor' }],
})

const motionRecipe = () => ({
  textures: [{ assetName: 'Flow', source: 'packs/Test/Flow.png' }],
  nodes: [
    { id: 'time', kind: 'Time', properties: {} },
    { id: 'pan', kind: 'Panner', properties: { SpeedX: 0.1, SpeedY: 0.02 } },
    { id: 'flow', kind: 'Texture', properties: { Texture: 'Flow' } },
  ],
  connections: [
    { fromNode: 'time', fromPin: 'Output', toNode: 'pan', toPin: 'Time' },
    { fromNode: 'pan', fromPin: 'Output', toNode: 'flow', toPin: 'UVs' },
  ],
  outputs: [{ node: 'flow', pin: 'RGB', property: 'MP_EmissiveColor' }],
})

const packedPbrRecipe = () => ({
  textures: [
    { assetName: 'BC', source: 'packs/Test/BC.png' },
    { assetName: 'N', source: 'packs/Test/N.png' },
    { assetName: 'ORM', source: 'packs/Test/ORM.png' },
  ],
  nodes: [
    { id: 'bc', kind: 'Texture', properties: { Texture: 'BC' } },
    { id: 'normal', kind: 'Texture', properties: { Texture: 'N' } },
    { id: 'orm', kind: 'Texture', properties: { Texture: 'ORM' } },
  ],
  connections: [],
  outputs: [
    { node: 'bc', pin: 'RGB', property: 'MP_BaseColor' },
    { node: 'normal', pin: 'RGB', property: 'MP_Normal' },
    { node: 'orm', pin: 'R', property: 'MP_AmbientOcclusion' },
    { node: 'orm', pin: 'G', property: 'MP_Roughness' },
    { node: 'orm', pin: 'B', property: 'MP_Metallic' },
  ],
})

test('PreviewDescriptorV1 selects only evidence-backed rendering modes', () => {
  assert.equal(MATERIAL_PREVIEW_SCHEMA_VERSION, 1)

  const capture = createMaterialPreviewDescriptor({
    asset: asset({
      asset_type: 'UnrealMaterialInstance',
      preview_kind: 'rendered_sphere',
      preview_source: 'packs/Test/capture.png',
    }),
  })
  const reference = createMaterialPreviewDescriptor({
    asset: asset({ preview_source: 'packs/Test/reference.png' }),
  })
  const solid = createMaterialPreviewDescriptor({ asset: asset() })
  const pbr = createMaterialPreviewDescriptor({ asset: asset(), recipe: packedPbrRecipe() })
  const shader = createMaterialPreviewDescriptor({ asset: asset(), recipe: motionRecipe() })

  assert.deepEqual(
    [capture.mode, reference.mode, solid.mode, pbr.mode, shader.mode],
    ['rendered_capture', 'texture_reference', 'solid_parameters', 'pbr_maps', 'shader_recipe'],
  )
  for (const descriptor of [capture, reference, solid, pbr, shader]) {
    assert.equal(descriptor.schemaVersion, 1)
    assert.equal(descriptor.assetId, 'preview-contract-asset')
  }
  assert.equal(capture.previewSource, 'packs/Test/capture.png')
  assert.match(capture.fidelityLabel, /source Unreal/i)
})

test('animation truth comes from a supported temporal graph, never a generic flag or name', () => {
  const staticClaim = createMaterialPreviewDescriptor({
    asset: asset({ animated: true, display_name: 'Animated_Panner_Claim' }),
    recipe: staticColorRecipe(),
  })
  const provedMotion = createMaterialPreviewDescriptor({
    asset: asset({ animated: false, display_name: 'Plain_Name' }),
    recipe: motionRecipe(),
  })
  const nameOnly = createMaterialPreviewDescriptor({
    asset: asset({ display_name: 'Animated_Time_Panner', notes: 'animation; motion' }),
  })

  assert.notEqual(staticClaim.mode, 'shader_recipe')
  assert.equal(staticClaim.graph, undefined)
  assert.equal(provedMotion.mode, 'shader_recipe')
  assert.equal(provedMotion.animated, true)
  assert.equal(nameOnly.animated, false)
})

test('technical roles are derived from exact graph outputs without invented maps', () => {
  const descriptor = createMaterialPreviewDescriptor({
    asset: asset(),
    recipe: {
      textures: [
        { assetName: 'Color', source: 'packs/Test/Color.png' },
        { assetName: 'Glow', source: 'packs/Test/Glow.png' },
      ],
      nodes: [
        { id: 'color', kind: 'Texture', properties: { Texture: 'Color' } },
        { id: 'glow', kind: 'Texture', properties: { Texture: 'Glow' } },
      ],
      connections: [],
      outputs: [
        { node: 'color', pin: 'RGB', property: 'MP_BaseColor' },
        { node: 'glow', pin: 'RGB', property: 'MP_EmissiveColor' },
      ],
    },
  })

  assert.deepEqual(descriptor.channels.map((channel) => channel.key), [
    'MP_BaseColor',
    'MP_EmissiveColor',
  ])
  assert.equal(descriptor.maps.normal, null)
  assert.equal(descriptor.maps.orm, null)
})

test('a material without an Emissive output never receives invented white emission', () => {
  const descriptor = createMaterialPreviewDescriptor({
    asset: asset(),
    recipe: packedPbrRecipe(),
  })

  assert.deepEqual(descriptor.material.emissiveColor, [0, 0, 0, 1])
  assert.equal(descriptor.material.emissiveIntensity, 0)
})

test('static and animated variants remain independent descriptors', () => {
  const staticDescriptor = createMaterialPreviewDescriptor({
    asset: asset({ asset_id: 'variant-static', animated: false }),
    recipe: staticColorRecipe(),
  })
  const animatedDescriptor = createMaterialPreviewDescriptor({
    asset: asset({ asset_id: 'variant-live', animated: true }),
    recipe: motionRecipe(),
  })

  assert.equal(staticDescriptor.assetId, 'variant-static')
  assert.equal(staticDescriptor.animated, false)
  assert.notEqual(staticDescriptor.mode, 'shader_recipe')
  assert.equal(animatedDescriptor.assetId, 'variant-live')
  assert.equal(animatedDescriptor.animated, true)
  assert.equal(animatedDescriptor.mode, 'shader_recipe')
  assert.notStrictEqual(staticDescriptor, animatedDescriptor)
})

test('every exact-render failure retains a non-empty visual fallback contract', () => {
  const solid = createMaterialPreviewDescriptor({ asset: asset({ preview_color: '#29435f' }) })
  const unsupported = createMaterialPreviewDescriptor({
    asset: asset({ animated: true, preview_color: '#29435f' }),
    recipe: {
      textures: [],
      nodes: [{ id: 'custom', kind: 'CustomHLSL', properties: {} }],
      connections: [],
      outputs: [{ node: 'custom', pin: 'Output', property: 'MP_EmissiveColor' }],
    },
  })

  for (const descriptor of [solid, unsupported]) {
    const fallbackColor = descriptor.material?.baseColor || descriptor.fallbackMaterial?.baseColor
    assert.ok(Array.isArray(fallbackColor), `${descriptor.mode} must carry a material fallback`)
    assert.ok(fallbackColor.slice(0, 3).some((channel) => channel > 0.02), `${descriptor.mode} fallback must not be black`)
  }
})
