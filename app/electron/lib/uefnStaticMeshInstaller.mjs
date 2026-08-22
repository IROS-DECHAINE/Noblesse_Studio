import { UefnMcpClient } from './uefnMcpClient.mjs'
import { installVaultAsset } from './uefnInstaller.mjs'
import {
  ASSET_TOOLSET,
  EDITOR_APP_TOOLSET,
  STATIC_MESH_REQUIREMENTS,
  STATIC_MESH_TOOLSET,
} from './uefnTransferContract.mjs'
import { loadRecipe, loadVaultAsset, resolveVaultSource, validateVaultIntegrity, writeInstallReceipt } from './vaultService.mjs'

const SAFE_UNREAL_NAME = /^[A-Za-z0-9_]+$/u
const STATIC_MESH_TOOLS = STATIC_MESH_TOOLSET
const ASSET_TOOLS = ASSET_TOOLSET
const EDITOR_APP = EDITOR_APP_TOOLSET

const openMountName = (contentBrowserPath) => String(contentBrowserPath || '').split('/').filter(Boolean)[0] || ''
const dependencyIds = (value) => [...new Set(String(value || '').split(/[;,\n]/u).map((item) => item.trim()).filter(Boolean))]

const boundsDimensions = (bounds) => {
  if (!bounds?.isValid || !bounds.min || !bounds.max) throw new Error('UEFN a renvoyé des dimensions de mesh invalides')
  return ['x', 'y', 'z'].map((axis) => Number(bounds.max[axis]) - Number(bounds.min[axis]))
}

const assertDimensions = (actualCentimeters, asset) => {
  const expected = [asset.bounds_x_m, asset.bounds_y_m, asset.bounds_z_m]
    .map((value) => Number(value) * 100)
    .sort((left, right) => left - right)
  const actual = [...actualCentimeters].sort((left, right) => left - right)
  if (expected.some((value) => !Number.isFinite(value) || value <= 0)
    || actual.some((value) => !Number.isFinite(value) || value <= 0)) throw new Error('Le manifeste de dimensions du mesh est invalide')
  for (let index = 0; index < expected.length; index += 1) {
    const tolerance = Math.max(1, expected[index] * 0.0125)
    if (Math.abs(actual[index] - expected[index]) > tolerance) {
      throw new Error(`Échelle UEFN incorrecte : ${actual.map((value) => value.toFixed(1)).join(' × ')} cm au lieu de ${expected.map((value) => value.toFixed(1)).join(' × ')} cm`)
    }
  }
}

const compileBindings = (asset, materialPaths) => {
  if (!Array.isArray(asset.material_bindings) || !asset.material_bindings.length) throw new Error('Le manifeste mesh ne contient aucun binding matériau')
  return asset.material_bindings.map((binding) => {
    const pattern = String(binding?.pattern || '')
    if (!/^\^[A-Za-z0-9_]{2,80}_?$/u.test(pattern)) throw new Error(`Règle de slot matériau non autorisée : ${pattern}`)
    const materialPath = materialPaths.get(binding.materialRecipeId)
    if (!materialPath) throw new Error(`Matériau dépendant non installé : ${binding.materialRecipeId}`)
    return { pattern: new RegExp(pattern, 'u'), materialPath }
  })
}

const verifyMesh = async (mcp, meshRef, asset, bindings, { assignMaterials = false } = {}) => {
  const mesh = { refPath: meshRef }
  const triangleCount = await mcp.call(STATIC_MESH_TOOLS, 'get_triangle_count', { mesh, lod_index: 0 })
  if (triangleCount !== Number(asset.triangle_count)) {
    throw new Error(`Le mesh UEFN contient ${triangleCount} triangles au lieu de ${asset.triangle_count}`)
  }
  const bounds = await mcp.call(STATIC_MESH_TOOLS, 'get_bounds', { mesh })
  const dimensions = boundsDimensions(bounds)
  assertDimensions(dimensions, asset)
  const slots = await mcp.call(STATIC_MESH_TOOLS, 'get_material_slots', { mesh })
  if (!Array.isArray(slots) || !slots.length || slots.some((slot) => typeof slot !== 'string' || !slot)) {
    throw new Error('UEFN n’a pas conservé les slots de matériaux du mesh')
  }

  for (const slotName of slots) {
    const matches = bindings.filter((binding) => binding.pattern.test(slotName))
    if (matches.length !== 1) throw new Error(`Le slot ${slotName} ne correspond pas exactement à un matériau du manifeste`)
    const expectedPath = matches[0].materialPath
    if (assignMaterials) {
      const assigned = await mcp.call(STATIC_MESH_TOOLS, 'set_material', {
        mesh,
        slot_name: slotName,
        material: { refPath: expectedPath },
      })
      if (assigned !== true) throw new Error(`UEFN n’a pas affecté le matériau du slot ${slotName}`)
    }
    const actual = await mcp.call(STATIC_MESH_TOOLS, 'get_material', { mesh, slot_name: slotName })
    if (actual?.refPath !== expectedPath) throw new Error(`Le slot ${slotName} ne référence pas le matériau attendu`)
  }
  return { triangleCount, dimensionsCentimeters: dimensions, materialSlotCount: slots.length }
}

export const createUefnStaticMeshInstaller = ({
  assetLoader = loadVaultAsset,
  recipeLoader = loadRecipe,
  integrityValidator = validateVaultIntegrity,
  sourceResolver = resolveVaultSource,
  materialInstaller = installVaultAsset,
  clientFactory = (endpoint) => new UefnMcpClient(endpoint),
  receiptWriter = writeInstallReceipt,
  clock = () => new Date(),
} = {}) => async ({ assetId, projectId }, { sessionService } = {}) => {
  const startedAt = Date.now()
  await integrityValidator(assetId)
  const asset = await assetLoader(assetId)
  if (asset.asset_type !== 'StaticMesh' || asset.install_mode !== 'UEFN_STATIC_MESH') throw new Error('Cet élément n’est pas un mesh UEFN installable')
  if (!SAFE_UNREAL_NAME.test(asset.unreal_asset_name || '')) throw new Error('Nom Unreal invalide dans le manifeste mesh')
  if (!sessionService) throw new Error('Le gestionnaire de sessions UEFN est indisponible')
  const project = await sessionService.resolveActiveSession(projectId, { capability: 'staticMesh' })

  const materialPaths = new Map()
  for (const materialId of dependencyIds(asset.dependencies)) {
    const { asset: materialAsset, recipe } = await recipeLoader(materialId)
    if (materialAsset.asset_type !== 'MaterialRecipe') throw new Error(`La dépendance ${materialId} n’est pas une recette matériau`)
    const result = await materialInstaller({ assetId: materialId, projectId }, { sessionService })
    const targetPath = result?.targetPath || `/${project.mount}/NoblesseStudio/${asset.pack_id}/Materials/${recipe.assetName}.${recipe.assetName}`
    materialPaths.set(materialId, targetPath)
  }
  const bindings = compileBindings(asset, materialPaths)

  const mcp = clientFactory(project.endpoint)
  await mcp.initialize()
  const missingTools = await mcp.missingTools(STATIC_MESH_REQUIREMENTS)
  if (missingTools.length) throw new Error(`Cette session UEFN ne peut pas installer cet asset : ${missingTools.join(', ')}`)
  const browserPath = await mcp.call(EDITOR_APP, 'GetContentBrowserPath', {})
  const mount = openMountName(browserPath)
  if (!mount || mount.toLocaleLowerCase('en') !== project.mount.toLocaleLowerCase('en')) {
    throw new Error(`Le projet choisi est ${project.name}, mais UEFN a actuellement ${mount || 'un projet inconnu'} ouvert`)
  }

  const meshFolder = `/${mount}/NoblesseStudio/${asset.pack_id}/Meshes`
  const meshRef = `${meshFolder}/${asset.unreal_asset_name}.${asset.unreal_asset_name}`
  const exists = await mcp.call(ASSET_TOOLS, 'exists', { path: meshRef })
  if (exists) {
    const proof = await verifyMesh(mcp, meshRef, asset, bindings)
    return {
      accepted: true,
      mode: 'ALREADY_INSTALLED',
      assetId,
      project: project.name,
      targetPath: meshRef,
      ...proof,
      durationMs: Date.now() - startedAt,
    }
  }

  const imported = await mcp.call(STATIC_MESH_TOOLS, 'import_file', {
    folder_path: meshFolder,
    asset_name: asset.unreal_asset_name,
    source_file: sourceResolver(asset.source),
    import_materials: false,
    import_textures: false,
    combine_meshes: true,
  })
  if (!Array.isArray(imported) || imported.length !== 1 || imported[0]?.refPath !== meshRef) {
    throw new Error('UEFN n’a pas importé le mesh dans la destination exacte attendue')
  }
  const proof = await verifyMesh(mcp, meshRef, asset, bindings, { assignMaterials: true })
  const saved = await mcp.call(ASSET_TOOLS, 'save_assets', { asset_paths: [meshRef] })
  if (saved !== true) throw new Error('UEFN n’a pas sauvegardé le mesh installé')
  if (await mcp.call(ASSET_TOOLS, 'is_dirty', { asset_path: meshRef })) throw new Error('Le mesh reste non sauvegardé après installation')

  const receipt = {
    schemaVersion: 1,
    status: 'PASS',
    mode: 'INSTALLED',
    assetId,
    packId: asset.pack_id,
    packVersion: asset.pack_version,
    projectId,
    project: project.name,
    projectMount: mount,
    targetPath: meshRef,
    materialRecipeIds: [...materialPaths.keys()],
    ...proof,
    installedAt: clock().toISOString(),
    durationMs: Date.now() - startedAt,
  }
  const receiptPath = await receiptWriter(receipt)
  return { accepted: true, ...receipt, receiptPath }
}

export const installUefnStaticMesh = createUefnStaticMeshInstaller()

export const uefnStaticMeshInstallerInternals = Object.freeze({
  assertDimensions,
  boundsDimensions,
  compileBindings,
  dependencyIds,
})
