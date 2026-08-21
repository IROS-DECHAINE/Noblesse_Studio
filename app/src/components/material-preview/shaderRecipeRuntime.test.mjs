import assert from 'node:assert/strict'
import test from 'node:test'
import {
  prepareShaderRecipeRuntime,
  shaderRecipeCompilerInput,
} from './useShaderRecipeRuntime.js'

const material = {
  baseColor: [0.2, 0.3, 0.4, 1],
  emissiveColor: [0, 0, 0, 1],
  emissiveIntensity: 0,
  metalness: 0.1,
  roughness: 0.4,
  specularIntensity: 0.5,
}

const descriptor = (graph) => ({
  schemaVersion: 1,
  assetId: 'runtime-test',
  animated: true,
  mode: 'shader_recipe',
  previewSource: 'packs/Test/poster.png',
  material,
  graph,
})
test('builds a bounded physical runtime program for a reachable time graph', () => {
  const result = prepareShaderRecipeRuntime(descriptor({
    textures: [],
    nodes: [
      { id: 'clock', kind: 'Time', properties: {} },
      { id: 'pulse', kind: 'Sine', properties: { Period: 2 } },
    ],
    connections: [{ fromNode: 'clock', fromPin: 'Output', toNode: 'pulse', toPin: 'Input' }],
    outputs: [{ node: 'pulse', pin: 'Output', property: 'MP_Roughness' }],
  }))

  assert.equal(result.status, 'ready')
  assert.equal(result.plan.profile, 'three_mesh_physical_allowlist_v1')
  assert.match(result.plan.program.body, /uPreviewTime/)
  assert.match(result.plan.program.body, /roughnessFactor/)
})

test('strips only desktop-resolved texture URLs before strict recipe compilation', () => {
  const graph = {
    textures: [{
      assetName: 'T_Flow',
      source: 'packs/Test/T_Flow.png',
      samplerType: 'SAMPLERTYPE_Color',
      url: 'noblesse-vault://preview/packs%2FTest%2FT_Flow.png',
    }],
    nodes: [
      { id: 'pan', kind: 'Panner', properties: { SpeedX: 0.1, SpeedY: 0 } },
      { id: 'sample', kind: 'Texture', properties: { Texture: 'T_Flow', SamplerType: 'SAMPLERTYPE_Color' } },
    ],
    connections: [{ fromNode: 'pan', fromPin: 'Output', toNode: 'sample', toPin: 'UVs' }],
    outputs: [{ node: 'sample', pin: 'RGB', property: 'MP_BaseColor' }],
  }

  const compilerInput = shaderRecipeCompilerInput(graph)
  assert.equal(compilerInput.textures[0].url, undefined)
  assert.equal(graph.textures[0].url.startsWith('noblesse-vault:'), true)
  const result = prepareShaderRecipeRuntime(descriptor(graph))
  assert.equal(result.status, 'ready')
  assert.deepEqual(result.plan.program.textureUniforms.map(({ role }) => role), ['T_Flow'])
})

test('fails closed when a temporal node is not connected to a material output', () => {
  const result = prepareShaderRecipeRuntime(descriptor({
    textures: [],
    nodes: [
      { id: 'unusedClock', kind: 'Time', properties: {} },
      { id: 'roughness', kind: 'Scalar', properties: { DefaultValue: 0.4 } },
    ],
    connections: [],
    outputs: [{ node: 'roughness', pin: 'Output', property: 'MP_Roughness' }],
  }))

  assert.equal(result.status, 'error')
  assert.equal(result.error.code, 'UNPROVEN_RUNTIME_ANIMATION')
  assert.equal(result.plan, null)
})
