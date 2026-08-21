import assert from 'node:assert/strict'
import test from 'node:test'
import { createMaterialPreviewDescriptor } from './materialPreviewDescriptor.mjs'

const asset = (overrides = {}) => ({
  asset_id: 'material-test',
  asset_type: 'MaterialRecipe',
  animated: false,
  graph_fidelity: 'TESTED',
  ...overrides,
})

test('builds an exact packed PBR descriptor from recipe outputs', () => {
  const recipe = {
    textures: [
      { assetName: 'BC', source: 'packs/Test/BC.png' },
      { assetName: 'N', source: 'packs/Test/N.png' },
      { assetName: 'ORM', source: 'packs/Test/ORM.png' },
    ],
    nodes: [
      { id: 'bc', kind: 'Texture', properties: { Texture: 'BC' } },
      { id: 'n', kind: 'Texture', properties: { Texture: 'N' } },
      { id: 'orm', kind: 'Texture', properties: { Texture: 'ORM' } },
    ],
    connections: [],
    outputs: [
      { node: 'bc', pin: 'RGB', property: 'MP_BaseColor' },
      { node: 'n', pin: 'RGB', property: 'MP_Normal' },
      { node: 'orm', pin: 'R', property: 'MP_AmbientOcclusion' },
      { node: 'orm', pin: 'G', property: 'MP_Roughness' },
      { node: 'orm', pin: 'B', property: 'MP_Metallic' },
    ],
  }
  const descriptor = createMaterialPreviewDescriptor({ asset: asset(), recipe })
  assert.equal(descriptor.mode, 'pbr_maps')
  assert.equal(descriptor.maps.normal.source, 'packs/Test/N.png')
  assert.equal(descriptor.maps.orm.channels, 'R=AO · G=Roughness · B=Metallic')
})

test('keeps native Unreal previews as rendered captures', () => {
  const descriptor = createMaterialPreviewDescriptor({
    asset: asset({ asset_type: 'UnrealMaterialInstance', preview_kind: 'rendered_sphere' }),
  })
  assert.equal(descriptor.mode, 'rendered_capture')
})

test('exposes a bounded supported animated graph', () => {
  const recipe = {
    textures: [{ assetName: 'Flow', source: 'packs/Test/Flow.png' }],
    nodes: [
      { id: 'pan', kind: 'Panner', properties: { SpeedX: 0.1, SpeedY: 0 } },
      { id: 'flow', kind: 'Texture', properties: { Texture: 'Flow' } },
    ],
    connections: [{ fromNode: 'pan', fromPin: 'Output', toNode: 'flow', toPin: 'UVs' }],
    outputs: [{ node: 'flow', pin: 'RGB', property: 'MP_EmissiveColor' }],
  }
  const descriptor = createMaterialPreviewDescriptor({ asset: asset({ animated: true }), recipe })
  assert.equal(descriptor.mode, 'shader_recipe')
  assert.equal(descriptor.graph.nodes.length, 2)
})

test('fails closed when a temporal recipe contains an unknown node', () => {
  const recipe = {
    textures: [],
    nodes: [
      { id: 'time', kind: 'Time', properties: {} },
      { id: 'custom', kind: 'CustomHLSL', properties: {} },
    ],
    connections: [{ fromNode: 'time', fromPin: 'Output', toNode: 'custom', toPin: 'Input' }],
    outputs: [{ node: 'custom', pin: 'Output', property: 'MP_EmissiveColor' }],
  }
  const descriptor = createMaterialPreviewDescriptor({ asset: asset({ animated: true, preview_source: 'proof.png' }), recipe })
  assert.equal(descriptor.mode, 'rendered_capture')
  assert.match(descriptor.unsupportedReason, /non pris en charge/)
})
