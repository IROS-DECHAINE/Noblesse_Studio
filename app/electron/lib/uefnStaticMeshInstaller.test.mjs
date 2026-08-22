import assert from 'node:assert/strict'
import test from 'node:test'
import { createUefnStaticMeshInstaller, uefnStaticMeshInstallerInternals } from './uefnStaticMeshInstaller.mjs'

const asset = {
  asset_id: 'NOB-MESH-WATER-TANK',
  asset_type: 'StaticMesh',
  install_mode: 'UEFN_STATIC_MESH',
  pack_id: 'Noblesse_Water_Tank',
  pack_version: '2.0.0',
  source: 'packs/Noblesse_Water_Tank/source/tank.fbx',
  unreal_asset_name: 'SM_NBL_Water_Tank',
  triangle_count: 137480,
  bounds_x_m: 4.5977,
  bounds_y_m: 4.57,
  bounds_z_m: 5.98,
  dependencies: 'MAT-TANK;MAT-ROOF;MAT-METAL',
  material_bindings: [
    { pattern: '^MAT_TankWood_', materialRecipeId: 'MAT-TANK' },
    { pattern: '^MAT_RoofWood_', materialRecipeId: 'MAT-ROOF' },
    { pattern: '^MAT_Metal_', materialRecipeId: 'MAT-METAL' },
  ],
}

const recipes = new Map([
  ['MAT-TANK', { assetName: 'M_Tank' }],
  ['MAT-ROOF', { assetName: 'M_Roof' }],
  ['MAT-METAL', { assetName: 'M_Metal' }],
])

test('installs a combined mesh with explicit material recipes and verifies geometry before PASS', async () => {
  const calls = []
  const materialCalls = []
  let receipt = null
  const materialPaths = new Map([
    ['MAT-TANK', '/PrimeBot/NoblesseStudio/Noblesse_Water_Tank/Materials/M_Tank.M_Tank'],
    ['MAT-ROOF', '/PrimeBot/NoblesseStudio/Noblesse_Water_Tank/Materials/M_Roof.M_Roof'],
    ['MAT-METAL', '/PrimeBot/NoblesseStudio/Noblesse_Water_Tank/Materials/M_Metal.M_Metal'],
  ])
  const slotPaths = {
    MAT_TankWood_Variant_01: materialPaths.get('MAT-TANK'),
    MAT_RoofWood_Variant_01: materialPaths.get('MAT-ROOF'),
    MAT_Metal_Hoops_Weathered: materialPaths.get('MAT-METAL'),
  }
  const meshRef = '/PrimeBot/NoblesseStudio/Noblesse_Water_Tank/Meshes/SM_NBL_Water_Tank.SM_NBL_Water_Tank'
  const mcp = {
    initialize: async () => undefined,
    missingTools: async () => [],
    call: async (toolset, method, args) => {
      calls.push({ toolset, method, args })
      if (method === 'GetContentBrowserPath') return '/PrimeBot/NoblesseStudio'
      if (method === 'exists') return false
      if (method === 'import_file') return [{ refPath: meshRef }]
      if (method === 'get_triangle_count') return 137480
      if (method === 'get_bounds') return { isValid: true, min: { x: -229.885, y: -228.5, z: 0 }, max: { x: 229.885, y: 228.5, z: 598 } }
      if (method === 'get_material_slots') return Object.keys(slotPaths)
      if (method === 'set_material') return true
      if (method === 'get_material') return { refPath: slotPaths[args.slot_name] }
      if (method === 'save_assets') return true
      if (method === 'is_dirty') return false
      throw new Error(`Unexpected MCP call ${toolset}.${method}`)
    },
  }
  const install = createUefnStaticMeshInstaller({
    assetLoader: async () => asset,
    recipeLoader: async (assetId) => ({ asset: { asset_id: assetId, asset_type: 'MaterialRecipe' }, recipe: recipes.get(assetId) }),
    integrityValidator: async () => ({ status: 'PASS' }),
    sourceResolver: () => 'D:\\Vault\\tank.fbx',
    materialInstaller: async ({ assetId }) => {
      materialCalls.push(assetId)
      return { targetPath: materialPaths.get(assetId) }
    },
    clientFactory: () => mcp,
    receiptWriter: async (value) => { receipt = value; return 'receipt.json' },
    clock: () => new Date('2026-08-22T12:00:00.000Z'),
  })
  const sessionService = {
    resolveActiveSession: async (projectId, options) => {
      assert.equal(projectId, 'uefn:primebot')
      assert.deepEqual(options, { capability: 'staticMesh' })
      return { endpoint: 'http://127.0.0.1:8000/mcp', mount: 'PrimeBot', name: 'PrimeBot' }
    },
  }

  const result = await install({ assetId: asset.asset_id, projectId: 'uefn:primebot' }, { sessionService })
  assert.equal(result.status, 'PASS')
  assert.equal(result.materialSlotCount, 3)
  assert.deepEqual(materialCalls, ['MAT-TANK', 'MAT-ROOF', 'MAT-METAL'])
  assert.equal(receipt.targetPath, meshRef)
  const importCall = calls.find((call) => call.method === 'import_file')
  assert.equal(importCall.args.import_materials, false)
  assert.equal(importCall.args.import_textures, false)
  assert.equal(importCall.args.combine_meshes, true)
  assert.equal(calls.filter((call) => call.method === 'set_material').length, 3)
  assert.equal(calls.at(-1).method, 'is_dirty')
})

test('rejects a hundred-times scale mismatch instead of claiming installation success', () => {
  assert.throws(() => uefnStaticMeshInstallerInternals.assertDimensions([4.5977, 4.57, 5.98], asset), /Échelle UEFN incorrecte/)
})
