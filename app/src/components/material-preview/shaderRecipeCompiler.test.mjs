import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compileShaderRecipe,
  SHADER_RECIPE_ERROR_CODES,
  SHADER_RECIPE_LIMITS,
  SHADER_RECIPE_PLAN_VERSION,
} from './shaderRecipeCompiler.js'

const CODES = SHADER_RECIPE_ERROR_CODES

const scalar = (id, value) => ({
  id,
  kind: 'Scalar',
  properties: { DefaultValue: value, ParameterName: id },
})

const vector = (id, value) => ({
  id,
  kind: 'Vector',
  properties: { DefaultValue: value, ParameterName: id },
})

const connection = (fromNode, fromPin, toNode, toPin) => ({
  fromNode,
  fromPin,
  toNode,
  toPin,
})

const output = (node, pin, property) => ({ node, pin, property })

const comprehensiveRecipe = () => ({
  schemaVersion: 1,
  assetName: 'M_Test_Controlled',
  textures: [{
    role: 'flowColor',
    assetName: 'T_Test_Flow',
    source: 'packs/Test/sources/T_Test_Flow.png',
    width: 1024,
    height: 1024,
    sha256: 'a'.repeat(64),
    samplerType: 'SAMPLERTYPE_Color',
  }],
  nodes: [
    { id: 'uv', kind: 'TexCoord', properties: { UTiling: 2, VTiling: 2 } },
    { id: 'rotate', kind: 'Rotator', properties: { CenterX: 0.5, CenterY: 0.5, Speed: 0.03 } },
    { id: 'pan', kind: 'Panner', properties: { SpeedX: 0.02, SpeedY: -0.01 } },
    {
      id: 'sample',
      kind: 'Texture',
      properties: {
        Texture: 'T_Test_Flow',
        SamplerType: 'SAMPLERTYPE_Color',
        ParameterName: 'FlowTexture',
      },
    },
    vector('tint', [0.5, 0.25, 1, 1]),
    { id: 'tinted', kind: 'Multiply', properties: {} },
    { id: 'clock', kind: 'Time', properties: {} },
    { id: 'pulse', kind: 'Sine', properties: { Period: 2.5 } },
    { id: 'baseBlend', kind: 'Lerp', properties: {} },
    { id: 'rim', kind: 'Fresnel', properties: { Exponent: 3, BaseReflectFraction: 0.04 } },
    vector('rimColor', [0.1, 0.4, 1, 1]),
    { id: 'rimTint', kind: 'Multiply', properties: {} },
    { id: 'emissive', kind: 'Add', properties: {} },
    scalar('roughness', 0.3),
    scalar('metallic', 0.6),
  ],
  connections: [
    connection('uv', 'Output', 'rotate', 'Coordinate'),
    connection('rotate', 'Output', 'pan', 'Coordinate'),
    connection('pan', 'Output', 'sample', 'UVs'),
    connection('sample', 'RGB', 'tinted', 'A'),
    connection('tint', 'RGB', 'tinted', 'B'),
    connection('clock', 'Output', 'pulse', 'Input'),
    connection('tint', 'RGB', 'baseBlend', 'A'),
    connection('tinted', 'Output', 'baseBlend', 'B'),
    connection('pulse', 'Output', 'baseBlend', 'Alpha'),
    connection('rim', 'Output', 'rimTint', 'A'),
    connection('rimColor', 'RGB', 'rimTint', 'B'),
    connection('tinted', 'Output', 'emissive', 'A'),
    connection('rimTint', 'Output', 'emissive', 'B'),
  ],
  outputs: [
    output('baseBlend', 'Output', 'MP_BaseColor'),
    output('emissive', 'Output', 'MP_EmissiveColor'),
    output('roughness', 'Output', 'MP_Roughness'),
    output('metallic', 'Output', 'MP_Metallic'),
  ],
})

const errorCodes = (result) => result.errors.map((error) => error.code)

test('compiles the allowlisted subset to a data-only serializable plan', () => {
  const result = compileShaderRecipe(comprehensiveRecipe())

  assert.equal(result.ok, true)
  assert.deepEqual(result.errors, [])
  assert.equal(result.plan.schemaVersion, SHADER_RECIPE_PLAN_VERSION)
  assert.equal(result.plan.kind, 'shader_recipe_plan')
  assert.deepEqual(result.plan.textures, [{ role: 'flowColor', sampler: 'color' }])
  assert.deepEqual(result.plan.features, { usesTime: true, usesViewDirection: true })
  assert.equal(result.plan.outputs.baseColor.type, 'vec3')
  assert.equal(result.plan.outputs.roughness.type, 'scalar')
  assert.deepEqual(
    new Set(result.plan.operations.map((operation) => operation.op)),
    new Set([
      'add',
      'constantColor',
      'constantScalar',
      'fresnel',
      'lerp',
      'multiply',
      'panner',
      'rotator',
      'sine',
      'textureSample',
      'time',
      'uv0',
    ]),
  )

  const serialized = JSON.stringify(result.plan)
  assert.deepEqual(JSON.parse(serialized), result.plan)
  assert.doesNotMatch(serialized, /source|classPath|ParameterName|Desc|GLSL/i)
})

test('canonicalizes array order for deterministic plans', () => {
  const firstRecipe = comprehensiveRecipe()
  const reorderedRecipe = {
    ...comprehensiveRecipe(),
    textures: [...firstRecipe.textures].reverse(),
    nodes: [...firstRecipe.nodes].reverse(),
    connections: [...firstRecipe.connections].reverse(),
    outputs: [...firstRecipe.outputs].reverse(),
  }

  const first = compileShaderRecipe(firstRecipe)
  const reordered = compileShaderRecipe(reorderedRecipe)
  assert.equal(first.ok, true)
  assert.equal(reordered.ok, true)
  assert.deepEqual(reordered.plan, first.plan)
  assert.equal(JSON.stringify(reordered.plan), JSON.stringify(first.plan))
})

test('applies only contract-defined defaults and removes unreachable safe nodes', () => {
  const recipe = {
    nodes: [
      vector('unused', [1, 0, 0]),
      { id: 'rim', kind: 'Fresnel', properties: { Desc: 'Uses declared Fresnel defaults' } },
    ],
    outputs: [output('rim', 'Output', 'MP_Roughness')],
  }

  const result = compileShaderRecipe(recipe)
  assert.equal(result.ok, true)
  assert.deepEqual(result.plan.operations, [{
    id: 'rim',
    op: 'fresnel',
    resultType: 'scalar',
    exponent: 5,
    baseReflectFraction: 0.04,
  }])
  assert.deepEqual(result.plan.features, { usesTime: false, usesViewDirection: true })
})

test('fails closed for an arbitrary node kind', () => {
  const result = compileShaderRecipe({
    nodes: [{ id: 'custom', kind: 'CustomHLSL', properties: { Code: 'return 1;' } }],
    outputs: [output('custom', 'Output', 'MP_BaseColor')],
  })

  assert.equal(result.ok, false)
  assert.equal(result.plan, null)
  assert.ok(errorCodes(result).includes(CODES.UNSUPPORTED_NODE_KIND))
})

test('rejects executable-looking properties even on an allowlisted node', () => {
  delete globalThis.__shaderRecipeExecuted
  const result = compileShaderRecipe({
    nodes: [{
      ...vector('color', [1, 1, 1, 1]),
      properties: {
        DefaultValue: [1, 1, 1, 1],
        Code: 'globalThis.__shaderRecipeExecuted = true',
      },
    }],
    outputs: [output('color', 'RGB', 'MP_BaseColor')],
  })

  assert.equal(result.ok, false)
  assert.equal(result.plan, null)
  assert.ok(errorCodes(result).includes(CODES.UNSUPPORTED_PROPERTY))
  assert.equal(globalThis.__shaderRecipeExecuted, undefined)
})

test('accepts texture samples only through a manifested role', () => {
  const result = compileShaderRecipe({
    textures: [],
    nodes: [{
      id: 'sample',
      kind: 'Texture',
      properties: { Role: 'notManifested', SamplerType: 'SAMPLERTYPE_Color' },
    }],
    outputs: [output('sample', 'RGB', 'MP_BaseColor')],
  })

  assert.equal(result.ok, false)
  assert.ok(errorCodes(result).includes(CODES.UNMANIFESTED_TEXTURE_ROLE))
})

test('rejects remote, absolute, encoded, and traversing texture sources', async (t) => {
  const unsafeSources = [
    'https://example.invalid/texture.png',
    '/absolute/texture.png',
    '../outside.png',
    'packs/Test/%2e%2e/outside.png',
  ]

  for (const source of unsafeSources) {
    await t.test(source, () => {
      const result = compileShaderRecipe({
        textures: [{ role: 'base', source, samplerType: 'SAMPLERTYPE_Color' }],
        nodes: [{
          id: 'sample',
          kind: 'Texture',
          properties: { Role: 'base', SamplerType: 'SAMPLERTYPE_Color' },
        }],
        outputs: [output('sample', 'RGB', 'MP_BaseColor')],
      })
      assert.equal(result.ok, false)
      assert.ok(errorCodes(result).includes(CODES.UNSAFE_TEXTURE_SOURCE))
    })
  }
})

test('rejects sampler disagreement between manifest and node', () => {
  const result = compileShaderRecipe({
    textures: [{ role: 'map', source: 'packs/Test/map.png', samplerType: 'SAMPLERTYPE_Normal' }],
    nodes: [{
      id: 'sample',
      kind: 'Texture',
      properties: { Role: 'map', SamplerType: 'SAMPLERTYPE_Color' },
    }],
    outputs: [output('sample', 'RGB', 'MP_BaseColor')],
  })

  assert.equal(result.ok, false)
  assert.ok(errorCodes(result).includes(CODES.TEXTURE_SAMPLER_MISMATCH))
})

test('rejects cycles instead of producing a partial plan', () => {
  const result = compileShaderRecipe({
    nodes: [
      scalar('constant', 1),
      { id: 'a', kind: 'Add', properties: {} },
      { id: 'b', kind: 'Add', properties: {} },
    ],
    connections: [
      connection('b', 'Output', 'a', 'A'),
      connection('constant', 'Output', 'a', 'B'),
      connection('a', 'Output', 'b', 'A'),
      connection('constant', 'Output', 'b', 'B'),
    ],
    outputs: [output('a', 'Output', 'MP_Roughness')],
  })

  assert.equal(result.ok, false)
  assert.equal(result.plan, null)
  assert.ok(errorCodes(result).includes(CODES.GRAPH_CYCLE))
})

test('rejects missing, duplicate, and unknown input references', async (t) => {
  await t.test('missing required input', () => {
    const result = compileShaderRecipe({
      nodes: [scalar('constant', 1), { id: 'add', kind: 'Add', properties: {} }],
      connections: [connection('constant', 'Output', 'add', 'A')],
      outputs: [output('add', 'Output', 'MP_Roughness')],
    })
    assert.ok(errorCodes(result).includes(CODES.MISSING_INPUT))
  })

  await t.test('duplicate input', () => {
    const result = compileShaderRecipe({
      nodes: [scalar('one', 1), scalar('two', 2), { id: 'add', kind: 'Add', properties: {} }],
      connections: [
        connection('one', 'Output', 'add', 'A'),
        connection('two', 'Output', 'add', 'A'),
        connection('one', 'Output', 'add', 'B'),
      ],
      outputs: [output('add', 'Output', 'MP_Roughness')],
    })
    assert.ok(errorCodes(result).includes(CODES.DUPLICATE_INPUT))
  })

  await t.test('unknown node', () => {
    const result = compileShaderRecipe({
      nodes: [scalar('value', 1), { id: 'add', kind: 'Add', properties: {} }],
      connections: [
        connection('missing', 'Output', 'add', 'A'),
        connection('value', 'Output', 'add', 'B'),
      ],
      outputs: [output('add', 'Output', 'MP_Roughness')],
    })
    assert.ok(errorCodes(result).includes(CODES.UNKNOWN_NODE_REFERENCE))
  })
})

test('rejects incompatible graph and material output types', async (t) => {
  await t.test('sine cannot consume UV coordinates', () => {
    const result = compileShaderRecipe({
      nodes: [
        { id: 'uv', kind: 'TexCoord', properties: {} },
        { id: 'wave', kind: 'Sine', properties: { Period: 1 } },
      ],
      connections: [connection('uv', 'Output', 'wave', 'Input')],
      outputs: [output('wave', 'Output', 'MP_Roughness')],
    })
    assert.ok(errorCodes(result).includes(CODES.TYPE_MISMATCH))
  })

  await t.test('normal cannot be scalar', () => {
    const result = compileShaderRecipe({
      nodes: [scalar('normal', 0.5)],
      outputs: [output('normal', 'Output', 'MP_Normal')],
    })
    assert.ok(errorCodes(result).includes(CODES.TYPE_MISMATCH))
  })
})

test('enforces count and graph depth limits', async (t) => {
  await t.test('node count', () => {
    const nodes = Array.from(
      { length: SHADER_RECIPE_LIMITS.maxNodes + 1 },
      (_, index) => scalar(`node_${index}`, index),
    )
    const result = compileShaderRecipe({ nodes, outputs: [output('node_0', 'Output', 'MP_Roughness')] })
    assert.ok(errorCodes(result).includes(CODES.LIMIT_EXCEEDED))
  })

  await t.test('graph depth', () => {
    const nodes = [scalar('constant', 1)]
    const connections = []
    let previous = 'constant'
    for (let index = 0; index < SHADER_RECIPE_LIMITS.maxGraphDepth; index += 1) {
      const id = `add_${String(index).padStart(2, '0')}`
      nodes.push({ id, kind: 'Add', properties: {} })
      connections.push(connection(previous, 'Output', id, 'A'))
      connections.push(connection('constant', 'Output', id, 'B'))
      previous = id
    }
    const result = compileShaderRecipe({
      nodes,
      connections,
      outputs: [output(previous, 'Output', 'MP_Roughness')],
    })
    assert.ok(errorCodes(result).includes(CODES.GRAPH_DEPTH_LIMIT))
  })
})

test('rejects duplicate identifiers, outputs, unsupported pins, and unknown fields', async (t) => {
  await t.test('duplicate node id', () => {
    const result = compileShaderRecipe({
      nodes: [scalar('same', 1), scalar('same', 2)],
      outputs: [output('same', 'Output', 'MP_Roughness')],
    })
    assert.ok(errorCodes(result).includes(CODES.DUPLICATE_NODE_ID))
  })

  await t.test('duplicate output', () => {
    const result = compileShaderRecipe({
      nodes: [scalar('one', 1), scalar('two', 2)],
      outputs: [
        output('one', 'Output', 'MP_Roughness'),
        output('two', 'Output', 'MP_Roughness'),
      ],
    })
    assert.ok(errorCodes(result).includes(CODES.DUPLICATE_OUTPUT))
  })

  await t.test('unsupported pin', () => {
    const result = compileShaderRecipe({
      nodes: [scalar('value', 1)],
      outputs: [output('value', 'RGB', 'MP_BaseColor')],
    })
    assert.ok(errorCodes(result).includes(CODES.UNSUPPORTED_PIN))
  })

  await t.test('unknown top-level field', () => {
    const result = compileShaderRecipe({
      nodes: [scalar('value', 1)],
      outputs: [output('value', 'Output', 'MP_Roughness')],
      fragmentShader: 'void main() {}',
    })
    assert.ok(errorCodes(result).includes(CODES.UNKNOWN_FIELD))
  })
})

test('never throws for malformed untrusted values', () => {
  const malformed = [null, undefined, 42, 'recipe', [], new Date(), { nodes: 'not-an-array', outputs: [] }]
  for (const value of malformed) {
    assert.doesNotThrow(() => compileShaderRecipe(value))
    const result = compileShaderRecipe(value)
    assert.equal(result.ok, false)
    assert.equal(result.plan, null)
    assert.ok(result.errors.length >= 1)
  }
})
