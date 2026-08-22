import assert from 'node:assert/strict'
import test from 'node:test'
import { createUefnInstaller, uefnInstallerInternals } from './uefnInstaller.mjs'
import {
  ASSET_TOOLSET,
  EDITOR_APP_TOOLSET,
  MATERIAL_TOOLSET,
  OBJECT_TOOLSET,
  TEXTURE_TOOLSET,
} from './uefnTransferContract.mjs'

const mount = 'TEST_PROJECT'
const packId = 'Test_Pack'
const textureName = 'T_Test_Source'
const materialName = 'M_Test_Material'
const textureRef = `/${mount}/NoblesseStudio/${packId}/Textures/${textureName}.${textureName}`
const materialRef = `/${mount}/NoblesseStudio/${packId}/Materials/${materialName}.${materialName}`
const expressionRef = `${materialRef}:MaterialExpressionTextureSampleParameter2D_0`

const recipe = (overrides = {}) => ({
  assetName: materialName,
  textures: [{
    assetName: textureName,
    source: `packs/${packId}/sources/source.png`,
    width: 1254,
    height: 1254,
  }],
  nodes: [{
    id: 'texture',
    classPath: '/Script/Engine.MaterialExpressionTextureSampleParameter2D',
    x: 0,
    y: 0,
    properties: { Texture: textureName },
  }],
  connections: [],
  outputs: [{ node: 'texture', pin: 'RGB', property: 'MP_BaseColor' }],
  ...overrides,
})

const project = {
  id: 'uefn:test-project',
  endpoint: 'http://127.0.0.1:8000/mcp',
  mount,
  name: 'Projet test',
  path: 'D:\\Projects\\Test\\Test.uefnproject',
}

const createFakeMcp = ({ existing = new Set(), loseTextureBinding = false } = {}) => {
  const calls = []
  const properties = new Map()
  const schemas = new Map([
    [textureRef, {
      PowerOfTwoMode: { type: 'string', enum: ['None', 'StretchToPowerOfTwo'] },
      MipGenSettings: { type: 'string', enum: ['TMGS_NoMipmaps', 'TMGS_FromTextureGroup'] },
      NeverStream: { type: 'boolean' },
      bFlipGreenChannel: { type: 'boolean' },
    }],
    [expressionRef, { Texture: { type: 'object' } }],
  ])
  const mcp = {
    calls,
    async initialize() {},
    async missingTools() { return [] },
    async describeToolset() {
      return { tools: [{ name: `${MATERIAL_TOOLSET}.get_statistics` }] }
    },
    async call(toolset, tool, args) {
      calls.push({ toolset, tool, args })
      if (toolset === EDITOR_APP_TOOLSET && tool === 'GetContentBrowserPath') return `/${mount}/Content`
      if (toolset === ASSET_TOOLSET && tool === 'exists') return existing.has(args.path)
      if (toolset === TEXTURE_TOOLSET && tool === 'import_file') return [{ refPath: textureRef }]
      if (toolset === TEXTURE_TOOLSET && tool === 'get_size') return { x: 1254, y: 1254 }
      if (toolset === OBJECT_TOOLSET && tool === 'list_properties') {
        return JSON.stringify(schemas.get(args.instance.refPath) || {})
      }
      if (toolset === OBJECT_TOOLSET && tool === 'set_properties') {
        properties.set(args.instance.refPath, JSON.parse(args.values))
        return true
      }
      if (toolset === OBJECT_TOOLSET && tool === 'get_properties') {
        const stored = properties.get(args.instance.refPath) || {}
        const selected = Object.fromEntries(args.properties.map((name) => [name, stored[name]]))
        if (loseTextureBinding && args.instance.refPath === expressionRef && args.properties.includes('Texture')) {
          selected.Texture = null
        }
        return JSON.stringify(selected)
      }
      if (toolset === MATERIAL_TOOLSET && tool === 'create_material') return { refPath: materialRef }
      if (toolset === MATERIAL_TOOLSET && tool === 'add_expression') return { refPath: expressionRef }
      if (toolset === MATERIAL_TOOLSET && tool === 'get_expressions') return [{ refPath: expressionRef }]
      if (toolset === MATERIAL_TOOLSET && tool === 'get_property_input') return { expression: { refPath: expressionRef } }
      if (toolset === MATERIAL_TOOLSET && tool === 'get_statistics') return { num_pixel_texture_samples: 1 }
      if (toolset === ASSET_TOOLSET && tool === 'save_assets') return true
      if (toolset === ASSET_TOOLSET && tool === 'is_dirty') return false
      return null
    },
  }
  return mcp
}

const installerHarness = ({ mcp, recipeValue = recipe() }) => {
  let receipt = null
  const installer = createUefnInstaller({
    clientFactory: () => mcp,
    integrityValidator: async () => ({ ok: true }),
    recipeLoader: async () => ({ asset: { asset_id: 'asset-test', pack_id: packId }, recipe: recipeValue }),
    sourceResolver: () => 'D:\\Vault\\source.png',
    receiptWriter: async (value) => {
      receipt = value
      return 'D:\\Vault\\receipt.json'
    },
    clock: () => new Date('2026-08-21T20:00:00.000Z'),
  })
  const sessionService = { resolveActiveSession: async () => project }
  return {
    installer,
    sessionService,
    getReceipt: () => receipt,
  }
}

test('conforms a non-power-of-two texture and verifies its material binding before success', async () => {
  const mcp = createFakeMcp()
  const harness = installerHarness({ mcp })
  const result = await harness.installer(
    { assetId: 'asset-test', projectId: project.id },
    { sessionService: harness.sessionService },
  )

  assert.equal(result.mode, 'INSTALLED_AND_VERIFIED')
  assert.equal(result.textureAdjustments.length, 1)
  assert.deepEqual(result.textureAdjustments[0], {
    assetName: textureName,
    sourceWidth: 1254,
    sourceHeight: 1254,
    policy: 'STRETCH_TO_POWER_OF_TWO',
  })
  const textureWrite = mcp.calls.find((call) => (
    call.toolset === OBJECT_TOOLSET
    && call.tool === 'set_properties'
    && call.args.instance.refPath === textureRef
  ))
  assert.deepEqual(JSON.parse(textureWrite.args.values), {
    PowerOfTwoMode: 'StretchToPowerOfTwo',
    MipGenSettings: 'TMGS_FromTextureGroup',
    NeverStream: false,
  })
  assert.equal(harness.getReceipt().status, 'PASS')
  assert.equal(harness.getReceipt().validation.materialTextureBindingsReadBack, true)
})

test('rejects an unresolved texture recipe before contacting or mutating UEFN', async () => {
  let clientCreated = false
  let sessionResolved = false
  const installer = createUefnInstaller({
    clientFactory: () => {
      clientCreated = true
      return createFakeMcp()
    },
    integrityValidator: async () => ({ ok: true }),
    recipeLoader: async () => ({
      asset: { asset_id: 'asset-test', pack_id: packId },
      recipe: recipe({
        nodes: [{
          id: 'texture',
          classPath: '/Script/Engine.MaterialExpressionTextureSampleParameter2D',
          properties: { Texture: 'T_Missing' },
        }],
      }),
    }),
  })
  await assert.rejects(
    installer(
      { assetId: 'asset-test', projectId: project.id },
      { sessionService: { resolveActiveSession: async () => { sessionResolved = true } } },
    ),
    /texture absente/i,
  )
  assert.equal(clientCreated, false)
  assert.equal(sessionResolved, false)
})

test('blocks a partial destination before importing another file', async () => {
  const mcp = createFakeMcp({ existing: new Set([textureRef]) })
  const harness = installerHarness({ mcp })
  await assert.rejects(
    harness.installer(
      { assetId: 'asset-test', projectId: project.id },
      { sessionService: harness.sessionService },
    ),
    /installation UEFN partielle/i,
  )
  assert.equal(mcp.calls.some((call) => call.tool === 'import_file'), false)
  assert.equal(harness.getReceipt(), null)
})

test('refuses a success receipt when UEFN loses the texture reference', async () => {
  const mcp = createFakeMcp({ loseTextureBinding: true })
  const harness = installerHarness({ mcp })
  await assert.rejects(
    harness.installer(
      { assetId: 'asset-test', projectId: project.id },
      { sessionService: harness.sessionService },
    ),
    /n’a pas conservé la propriété Texture/i,
  )
  assert.equal(harness.getReceipt(), null)
  assert.equal(mcp.calls.some((call) => call.tool === 'save_assets'), false)
})

test('recognizes only dimensions that are powers of two', () => {
  assert.equal(uefnInstallerInternals.hasPowerOfTwoDimensions({ x: 1024, y: 2048 }), true)
  assert.equal(uefnInstallerInternals.hasPowerOfTwoDimensions({ x: 1254, y: 1254 }), false)
})

test('applies and reads back the OpenGL normal green-channel conversion', async () => {
  const mcp = createFakeMcp()
  const result = await uefnInstallerInternals.ensureManifestTextureSettings(mcp, textureRef, {
    assetName: textureName,
    flipGreenChannel: true,
    normalConvention: 'OPENGL_PLUS_Y',
  }, { apply: true })
  assert.deepEqual(result, { flipGreenChannel: true, normalConvention: 'OPENGL_PLUS_Y' })
  const write = mcp.calls.find((call) => call.tool === 'set_properties'
    && JSON.parse(call.args.values).bFlipGreenChannel === true)
  assert.ok(write)
  await uefnInstallerInternals.ensureManifestTextureSettings(mcp, textureRef, {
    assetName: textureName,
    flipGreenChannel: true,
  })
})
