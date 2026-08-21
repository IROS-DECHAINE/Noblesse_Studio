import { access, readFile, readdir, realpath, stat, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { createMaterialPreviewDescriptor } from '../../shared/materialPreviewDescriptor.mjs'
import { studioUefnProjectRoots, studioUnrealRoot, studioVaultRoot } from './studioPaths.mjs'
import { discoverOpenUnrealProjects, normalizeProjectDescriptorPath } from './unrealOpenProjectDiscovery.mjs'

const UNREAL_SCAN_EXCLUSIONS = new Set(['Binaries', 'Build', 'Content', 'DerivedDataCache', 'Intermediate', 'Saved'])
const PREVIEW_MIME_TYPES = new Map([
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
])

const exists = async (target) => {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

export const vaultRoot = () => studioVaultRoot()

const readJson = async (file) => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))

const sha256 = async (file) => {
  const hash = createHash('sha256')
  hash.update(await readFile(file))
  return hash.digest('hex')
}

export const readVaultCatalog = async () => {
  const file = path.join(vaultRoot(), 'catalog.json')
  const payload = await readJson(file)
  return payload.assets || []
}

export const loadVaultAsset = async (assetId) => {
  const assets = await readVaultCatalog()
  const asset = assets.find((item) => item.asset_id === assetId)
  if (!asset) throw new Error('Asset introuvable dans le Coffre Noblesse Studio')
  return asset
}

export const loadRecipe = async (assetId) => {
  const assets = await readVaultCatalog()
  const asset = assets.find((item) => item.asset_id === assetId)
  if (!asset) throw new Error('Asset introuvable dans le Coffre Noblesse Studio')
  const recipeFile = path.join(vaultRoot(), 'packs', asset.pack_id, 'recipes.json')
  const recipes = await readJson(recipeFile)
  const recipe = recipes.recipes?.[assetId]
  if (!recipe) throw new Error('Recette d’installation absente pour cet asset')
  return { asset, recipe }
}

export const loadMaterialPreviewDescriptor = async (assetId) => {
  const asset = await loadVaultAsset(assetId)
  const recipe = asset.asset_type === 'MaterialRecipe'
    ? (await loadRecipe(assetId)).recipe
    : null
  return createMaterialPreviewDescriptor({ asset, recipe })
}

export const validateVaultIntegrity = async (assetId = '') => {
  const root = vaultRoot()
  const catalogFile = path.join(root, 'catalog.json')
  const integrity = await readJson(path.join(root, 'integrity.json'))
  if (integrity.status !== 'PASS') throw new Error('Le contrôle d’intégrité du Coffre n’est pas validé')
  if (await sha256(catalogFile) !== integrity.catalogSha256) {
    throw new Error('Le catalogue a changé sans nouveau contrôle d’intégrité')
  }
  const assets = await readVaultCatalog()
  if (assets.length !== integrity.assetCount) throw new Error('Le nombre d’assets du Coffre est incohérent')
  if (!assetId) return integrity

  const asset = assets.find((item) => item.asset_id === assetId)
  if (!asset) throw new Error('Asset absent du catalogue validé')
  if (asset.source) {
    const source = resolveVaultSource(asset.source)
    if (!(await exists(source))) throw new Error(`Fichier source manquant pour ${asset.display_name}`)
    if (asset.source_sha256 && await sha256(source) !== asset.source_sha256) {
      throw new Error(`Le fichier source de ${asset.display_name} a été modifié`)
    }
  }
  if (asset.asset_type === 'MaterialRecipe') {
    const { recipe } = await loadRecipe(assetId)
    for (const texture of recipe.textures || []) {
      const source = resolveVaultSource(texture.source)
      if (!(await exists(source))) throw new Error(`Texture manquante : ${texture.assetName}`)
      if (texture.sha256 && await sha256(source) !== texture.sha256) {
        throw new Error(`Texture modifiée : ${texture.assetName}`)
      }
    }
  }
  return { ...integrity, assetId, assetStatus: 'PASS' }
}

const scanProjects = async (root, results) => {
  if (!(await exists(root))) return
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      await scanProjects(fullPath, results)
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.uefnproject')) {
      const details = await stat(fullPath)
      const name = path.basename(entry.name, '.uefnproject')
      results.push({
        id: fullPath.toLowerCase(),
        name,
        path: fullPath,
        folder: path.dirname(fullPath),
        platform: 'UEFN',
        updatedAt: details.mtime.toISOString(),
        canInstall: true,
        protection: 'INSTALL_ALLOWED',
      })
    }
  }
}

export const listUefnProjects = async () => {
  const projects = []
  for (const root of studioUefnProjectRoots()) await scanProjects(root, projects)
  return projects.sort((left, right) => left.name.localeCompare(right.name, 'fr'))
}

const scanUnrealProjects = async (root, results, openProjectsByPath, depth = 0) => {
  if (depth > 4 || !(await exists(root))) return
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      if (!UNREAL_SCAN_EXCLUSIONS.has(entry.name)) {
        await scanUnrealProjects(fullPath, results, openProjectsByPath, depth + 1)
      }
      continue
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.uproject')) continue
    const details = await stat(fullPath)
    const descriptor = await readJson(fullPath).catch(() => ({}))
    const engineVersion = String(descriptor.EngineAssociation || '').trim()
    const name = path.basename(entry.name, '.uproject')
    const openProject = openProjectsByPath.get(normalizeProjectDescriptorPath(fullPath)) || null
    const opened = Boolean(openProject)
    const localReady = engineVersion === '5.8'
    results.push({
      id: `unreal:${fullPath.toLowerCase()}`,
      name,
      path: fullPath,
      folder: path.dirname(fullPath),
      platform: 'Unreal',
      engineVersion,
      updatedAt: details.mtime.toISOString(),
      opened,
      connected: false,
      processId: openProject?.processId || null,
      localReady,
      canInstall: localReady,
      transferReady: localReady,
      favorite: false,
      status: localReady
        ? opened ? 'EDITOR_OPEN_LOCAL_PROJECT' : 'LOCAL_PROJECT_READY'
        : 'ENGINE_VERSION_UNSUPPORTED',
      protection: localReady ? 'LOCAL_COMMANDLET_INSTALL' : 'ENGINE_VERSION_UNSUPPORTED',
    })
  }
}

export const listUnrealProjects = async (root = studioUnrealRoot(), openProjectDiscovery = discoverOpenUnrealProjects) => {
  const projects = []
  const openProjects = await openProjectDiscovery()
  const openProjectsByPath = new Map(openProjects.map((project) => [
    normalizeProjectDescriptorPath(project.path),
    project,
  ]).filter(([descriptor]) => descriptor))
  await scanUnrealProjects(root, projects, openProjectsByPath)
  return projects.sort((left, right) => left.name.localeCompare(right.name, 'fr'))
}

export const resolveVaultSource = (relativePath) => {
  if (typeof relativePath !== 'string' || !relativePath.trim() || relativePath.includes('\0') || path.isAbsolute(relativePath)) {
    throw new Error('Chemin source invalide dans le Coffre')
  }
  const root = path.resolve(vaultRoot())
  const resolved = path.resolve(root, relativePath)
  const relation = path.relative(root, resolved)
  if (!relation || relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw new Error('Chemin source invalide dans le Coffre')
  }
  return resolved
}

export const resolveVaultPreviewSource = async (relativePath) => {
  const extension = path.extname(String(relativePath || '')).toLowerCase()
  const mimeType = PREVIEW_MIME_TYPES.get(extension)
  if (!mimeType) throw new Error('Format d\u2019aper\u00e7u non autoris\u00e9')

  const lexicalPath = resolveVaultSource(relativePath)
  const [rootPath, filePath] = await Promise.all([realpath(vaultRoot()), realpath(lexicalPath)])
  const relation = path.relative(rootPath, filePath)
  if (!relation || relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw new Error('Chemin d\u2019aper\u00e7u hors du Coffre')
  }
  const details = await stat(filePath)
  if (!details.isFile()) throw new Error('La source d\u2019aper\u00e7u n\u2019est pas un fichier')
  return { filePath, mimeType, size: details.size }
}

export const writeInstallReceipt = async (payload) => {
  const folder = path.join(vaultRoot(), 'install-receipts')
  await mkdir(folder, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  const file = path.join(folder, `${stamp}_${payload.assetId}.json`)
  await writeFile(file, JSON.stringify(payload, null, 2), 'utf8')
  return file
}
