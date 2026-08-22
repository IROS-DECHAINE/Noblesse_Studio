import { createHash, randomUUID } from 'node:crypto'
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const MAX_PACK_FILES = 2_000
const MAX_PACK_BYTES = 2 * 1024 * 1024 * 1024
const SHA256_PATTERN = /^[a-f0-9]{64}$/u

const slash = (value) => String(value || '').replaceAll('\\', '/')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const jsonBuffer = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
const readJsonBuffer = (value) => JSON.parse(value.toString('utf8').replace(/^\uFEFF/u, ''))

const atomicWrite = async (file, buffer) => {
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`
  await writeFile(temporary, buffer, { mode: 0o600 })
  await rename(temporary, file)
}

const assertRelativeFile = (value, label) => {
  const normalized = slash(value).replace(/^\/+|\/+$/gu, '')
  if (!normalized || normalized.includes('\0') || path.posix.isAbsolute(normalized)
    || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`${label} contient un chemin invalide.`)
  }
  return normalized
}

const assertWithin = (candidate, root, label) => {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(candidate)
  const relation = path.relative(resolvedRoot, resolved)
  if (!relation || relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw new Error(`${label} doit rester dans le Vault.`)
  }
  return resolved
}

const hashFile = async (file) => sha256(await readFile(file))

const inventoryDirectory = async (root) => {
  const resolvedRoot = path.resolve(root)
  const rootDetails = await lstat(resolvedRoot)
  if (!rootDetails.isDirectory() || rootDetails.isSymbolicLink()) throw new Error('La source du pack doit être un dossier réel.')
  const canonicalRoot = await realpath(resolvedRoot)
  const files = []

  const visit = async (folder) => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const absolute = path.join(folder, entry.name)
      const details = await lstat(absolute)
      if (details.isSymbolicLink()) throw new Error(`Lien symbolique refusé dans le pack : ${entry.name}`)
      if (details.isDirectory()) {
        await visit(absolute)
        continue
      }
      if (!details.isFile()) throw new Error(`Entrée non régulière refusée : ${entry.name}`)
      const relative = slash(path.relative(canonicalRoot, await realpath(absolute)))
      assertRelativeFile(relative, 'La source')
      files.push({ relativePath: relative, absolutePath: absolute, sizeBytes: details.size, sha256: await hashFile(absolute) })
      if (files.length > MAX_PACK_FILES) throw new Error(`Le pack dépasse ${MAX_PACK_FILES} fichiers.`)
      if (files.reduce((total, item) => total + item.sizeBytes, 0) > MAX_PACK_BYTES) throw new Error('Le pack dépasse 2 Go.')
    }
  }

  await visit(canonicalRoot)
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'en'))
  if (!files.length) throw new Error('Le pack source est vide.')
  const aggregateSha256 = sha256(files.map((file) => `${file.relativePath}|${file.sizeBytes}|${file.sha256}`).join('\n'))
  return { root: canonicalRoot, files, aggregateSha256, totalBytes: files.reduce((total, file) => total + file.sizeBytes, 0) }
}

const textureIdFor = (materialId, role) => `${materialId.replace('NOB-MAT-', 'NOB-TEX-')}-${role.toLocaleUpperCase('en')}`
const textureNameFor = (assetName, role) => `${assetName.replace(/^M_/u, 'T_')}_${role}`

const buildMaterialRecipe = (definition, materialSet, hashes, packSourcePrefix) => {
  const textureDefinitions = [
    ['BC', 'baseColor', 'SAMPLERTYPE_Color'],
    ['N', 'normal', 'SAMPLERTYPE_Normal'],
    ['R', 'roughness', 'SAMPLERTYPE_LinearColor'],
    ['M', 'metallic', 'SAMPLERTYPE_LinearColor'],
  ].filter(([, key]) => materialSet[key])

  const textures = textureDefinitions.map(([role, key, samplerType]) => {
    const relative = assertRelativeFile(materialSet[key], `Texture ${key}`)
    return {
      role,
      key,
      assetId: textureIdFor(materialSet.assetId, role),
      assetName: textureNameFor(materialSet.assetName, role),
      source: `${packSourcePrefix}/${relative}`,
      width: 4096,
      height: 4096,
      sha256: hashes.get(relative),
      samplerType,
      ...(key === 'normal' ? { flipGreenChannel: true, normalConvention: 'OPENGL_PLUS_Y' } : {}),
    }
  })
  if (textures.some((texture) => !SHA256_PATTERN.test(texture.sha256 || ''))) throw new Error(`Texture absente pour ${materialSet.label}.`)

  const nodes = textures.map((texture, index) => ({
    id: texture.key,
    kind: 'Texture',
    classPath: '/Script/Engine.MaterialExpressionTextureSampleParameter2D',
    x: -720,
    y: -300 + (index * 250),
    properties: {
      ParameterName: texture.assetName,
      Texture: texture.assetName,
      SamplerType: texture.samplerType,
      Group: '01 PBR Maps',
      Desc: `${texture.key} source for ${materialSet.assetName}`,
    },
  }))
  const outputFor = { baseColor: ['RGB', 'MP_BaseColor'], normal: ['RGB', 'MP_Normal'], roughness: ['R', 'MP_Roughness'], metallic: ['R', 'MP_Metallic'] }
  const outputs = textures.map((texture) => ({ node: texture.key, pin: outputFor[texture.key][0], property: outputFor[texture.key][1] }))
  return {
    textureAssets: textures,
    recipe: {
      assetName: materialSet.assetName,
      textures: textures.map(({ role, key, assetId, ...texture }) => texture),
      nodes,
      connections: [],
      outputs,
    },
  }
}

const ensureDefinition = (definition) => {
  if (!definition || typeof definition !== 'object') throw new Error('Définition de pack absente.')
  if (!/^[A-Za-z0-9._-]+$/u.test(definition.packId || '')) throw new Error('packId invalide.')
  if (!SHA256_PATTERN.test(definition.expectedSourceAggregateSha256 || '')) throw new Error('Hash source attendu invalide.')
  if (!Array.isArray(definition.modules) || !definition.modules.length) throw new Error('Le pack ne contient aucun module.')
  if (!Array.isArray(definition.materialSets) || !definition.materialSets.length) throw new Error('Le pack ne contient aucun matériau déclaré.')
  const ids = [...definition.modules, ...definition.materialSets].map((item) => item.assetId)
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new Error('Les IDs permanents du pack sont invalides ou dupliqués.')
}

export const publishManagedStaticMeshPack = async ({
  definition,
  sourceRoot,
  vaultRoot,
  buildPreview,
  rebuildIndexes,
  now = () => new Date(),
} = {}) => {
  ensureDefinition(definition)
  if (!path.isAbsolute(String(sourceRoot || '')) || !path.isAbsolute(String(vaultRoot || ''))) throw new Error('Les racines source et Vault doivent être absolues.')
  if (typeof buildPreview !== 'function' || typeof rebuildIndexes !== 'function') throw new Error('La publication exige un générateur d’aperçu et le reconstructeur d’index.')

  const sourceInventory = await inventoryDirectory(sourceRoot)
  if (sourceInventory.aggregateSha256 !== definition.expectedSourceAggregateSha256) {
    throw new Error(`Le pack source ne correspond pas au snapshot approuvé (${sourceInventory.aggregateSha256}).`)
  }
  const sourceHashes = new Map(sourceInventory.files.map((file) => [file.relativePath, file.sha256]))
  for (const relative of [definition.sourceBlend, definition.heroPreview, definition.provenanceFile, ...definition.gallery]) {
    if (!sourceHashes.has(assertRelativeFile(relative, 'Le manifeste'))) throw new Error(`Fichier déclaré absent : ${relative}`)
  }
  for (const module of definition.modules) {
    if (!sourceHashes.has(assertRelativeFile(module.source, 'Le module'))) throw new Error(`FBX déclaré absent : ${module.source}`)
  }

  const root = path.resolve(vaultRoot)
  const catalogFile = path.join(root, 'catalog.json')
  const integrityFile = path.join(root, 'integrity.json')
  const [originalCatalogBuffer, originalIntegrityBuffer] = await Promise.all([readFile(catalogFile), readFile(integrityFile)])
  const catalog = readJsonBuffer(originalCatalogBuffer)
  const integrity = readJsonBuffer(originalIntegrityBuffer)
  if (!Array.isArray(catalog.assets) || integrity.status !== 'PASS' || sha256(originalCatalogBuffer) !== integrity.catalogSha256
    || catalog.assets.length !== integrity.assetCount) throw new Error('Le Vault doit être cohérent avant la publication.')

  const materialIds = definition.materialSets.map((item) => item.assetId)
  const textureIds = definition.materialSets.flatMap((item) => [
    textureIdFor(item.assetId, 'BC'), textureIdFor(item.assetId, 'N'), textureIdFor(item.assetId, 'R'),
    ...(item.metallic ? [textureIdFor(item.assetId, 'M')] : []),
  ])
  const expectedIds = [...definition.modules.map((item) => item.assetId), ...materialIds, ...textureIds]
  const existingIds = new Set(catalog.assets.map((asset) => asset.asset_id))
  const existingCount = expectedIds.filter((id) => existingIds.has(id)).length
  const finalPackRoot = assertWithin(path.join(root, 'packs', definition.packId), root, 'Le pack géré')
  if (existingCount === expectedIds.length) {
    const mesh = catalog.assets.find((asset) => asset.asset_id === definition.modules[0].assetId)
    if (!mesh || await hashFile(assertWithin(path.join(root, mesh.source), root, 'La source mesh')) !== mesh.source_sha256) {
      throw new Error('Le pack existe mais sa preuve d’intégrité ne correspond plus.')
    }
    return { status: 'ALREADY_PRESENT', assetIds: expectedIds, sourceAggregateSha256: sourceInventory.aggregateSha256 }
  }
  if (existingCount || await lstat(finalPackRoot).then(() => true, (error) => error?.code === 'ENOENT' ? false : Promise.reject(error))) {
    throw new Error('Une publication partielle de ce pack existe déjà ; aucun écrasement automatique n’est autorisé.')
  }

  const temporaryRoot = assertWithin(path.join(root, '.imports', `static-mesh-${randomUUID()}`), root, 'Le dossier temporaire')
  const temporaryPackRoot = path.join(temporaryRoot, definition.packId)
  const temporarySourceRoot = path.join(temporaryPackRoot, 'source')
  await mkdir(temporarySourceRoot, { recursive: true })

  let packMoved = false
  let catalogMutated = false
  try {
    for (const file of sourceInventory.files) {
      const destination = path.join(temporarySourceRoot, ...file.relativePath.split('/'))
      await mkdir(path.dirname(destination), { recursive: true })
      await copyFile(file.absolutePath, destination)
      if (await hashFile(destination) !== file.sha256) throw new Error(`Copie corrompue : ${file.relativePath}`)
    }

    const previewRelative = 'previews/model/NYC_Water_Tank_VFX.preview.glb'
    const previewAbsolute = path.join(temporaryPackRoot, ...previewRelative.split('/'))
    await mkdir(path.dirname(previewAbsolute), { recursive: true })
    await buildPreview({
      sourceBlend: path.join(temporarySourceRoot, ...assertRelativeFile(definition.sourceBlend, 'Le blend').split('/')),
      destinationGlb: previewAbsolute,
    })
    const previewDetails = await lstat(previewAbsolute)
    if (!previewDetails.isFile() || previewDetails.isSymbolicLink() || previewDetails.size < 1024) throw new Error('L’aperçu GLB généré est invalide.')
    const previewSha256 = await hashFile(previewAbsolute)
    const packSourcePrefix = `packs/${definition.packId}/source`
    const materialBuilds = definition.materialSets.map((materialSet) => ({
      materialSet,
      ...buildMaterialRecipe(definition, materialSet, sourceHashes, packSourcePrefix),
    }))
    const generatedAt = now().toISOString()
    const recipes = {
      packId: definition.packId,
      generatedAt,
      recipes: Object.fromEntries(materialBuilds.map(({ materialSet, recipe }) => [materialSet.assetId, recipe])),
    }
    const recipesBuffer = jsonBuffer(recipes)
    await writeFile(path.join(temporaryPackRoot, 'recipes.json'), recipesBuffer)

    const managedFileList = [
      ...sourceInventory.files.map(({ relativePath, sizeBytes, sha256: fileSha256 }) => ({ path: `source/${relativePath}`, sizeBytes, sha256: fileSha256, role: 'ORIGINAL' })),
      { path: previewRelative, sizeBytes: previewDetails.size, sha256: previewSha256, role: 'REBUILDABLE_PREVIEW' },
      { path: 'recipes.json', sizeBytes: recipesBuffer.length, sha256: sha256(recipesBuffer), role: 'INSTALL_RECIPE' },
    ]
    const packManifest = {
      schemaVersion: 1,
      kind: 'NOBLESSE_MANAGED_STATIC_MESH_PACK',
      packId: definition.packId,
      packVersion: definition.packVersion,
      displayName: definition.displayName,
      publishedAt: generatedAt,
      sourceSnapshot: {
        fileCount: sourceInventory.files.length,
        totalBytes: sourceInventory.totalBytes,
        aggregateSha256: sourceInventory.aggregateSha256,
      },
      status: 'VALIDATED',
      readyRequires: ['UEFN_VISUAL_VALIDATION', 'UEFN_MEMORY_VALIDATION'],
      modules: definition.modules,
      gallery: definition.gallery.map((item) => `source/${item}`),
      files: managedFileList,
    }
    const manifestBuffer = jsonBuffer(packManifest)
    await writeFile(path.join(temporaryPackRoot, 'static-mesh-pack.v1.json'), manifestBuffer)

    const textureAssets = materialBuilds.flatMap(({ materialSet, textureAssets: textures }) => textures.map((texture) => ({
      asset_id: texture.assetId,
      display_name: texture.assetName,
      asset_type: 'Texture2D',
      domain: 'AssetsDependencies',
      category: 'Dépendance',
      pack_id: definition.packId,
      pack_version: definition.packVersion,
      source_project: 'NOBLESSE_STUDIO_APP',
      source: texture.source,
      source_sha256: texture.sha256,
      provenance: 'NOBLESSE_STUDIO_ORIGINAL_WITH_RECORDS',
      license_evidence: `packs/${definition.packId}/source/${definition.provenanceFile}`,
      status: 'VALIDATED',
      platforms: ['UEFN', 'Unreal'],
      catalog_visibility: 'dependency',
      notes: `${materialSet.label}; ${texture.key}; texture technique du pack asset.`,
    })))
    const materialAssets = materialBuilds.map(({ materialSet, textureAssets: textures }) => ({
      asset_id: materialSet.assetId,
      display_name: materialSet.assetName,
      label: materialSet.label,
      asset_type: 'MaterialRecipe',
      domain: 'AssetsDependencies',
      category: 'Dépendance',
      pack_id: definition.packId,
      pack_version: definition.packVersion,
      source_project: 'NOBLESSE_STUDIO_APP',
      provenance: 'NOBLESSE_STUDIO_ORIGINAL_WITH_RECORDS',
      license_evidence: `packs/${definition.packId}/source/${definition.provenanceFile}`,
      status: 'VALIDATED',
      platforms: ['UEFN', 'Unreal'],
      dependencies: textures.map((texture) => texture.assetId).join(';'),
      technical_maps: textures.length,
      install_mode: 'UEFN_RECIPE',
      catalog_visibility: 'dependency',
      notes: 'Recette PBR technique installée automatiquement avec le mesh parent.',
    }))
    const meshAssets = definition.modules.map((module, order) => ({
      asset_id: module.assetId,
      display_name: module.displayName,
      label: module.displayName,
      description: definition.description,
      asset_type: 'StaticMesh',
      domain: 'Assets',
      category: definition.category,
      pack_id: definition.packId,
      pack_version: definition.packVersion,
      source_project: 'NOBLESSE_STUDIO_APP',
      source: `${packSourcePrefix}/${module.source}`,
      source_sha256: sourceHashes.get(module.source),
      preview_source: `${packSourcePrefix}/${definition.heroPreview}`,
      preview_sha256: sourceHashes.get(definition.heroPreview),
      model_preview_source: `packs/${definition.packId}/${previewRelative}`,
      model_preview_sha256: previewSha256,
      provenance: 'NOBLESSE_STUDIO_ORIGINAL_WITH_RECORDS',
      license_evidence: `${packSourcePrefix}/${definition.provenanceFile}`,
      status: 'VALIDATED',
      platforms: ['UEFN', 'Unreal'],
      dependencies: materialIds.join(';'),
      asset_group: definition.packId,
      group_label: definition.displayName,
      module_id: module.moduleId,
      module_label: module.moduleLabel,
      module_order: order,
      install_mode: 'UEFN_STATIC_MESH',
      unreal_asset_name: module.unrealAssetName,
      mesh_object_count: module.meshObjectCount,
      vertex_count: module.vertexCount,
      triangle_count: module.triangleCount,
      bounds_x_m: module.boundsMeters.x,
      bounds_y_m: module.boundsMeters.y,
      bounds_z_m: module.boundsMeters.z,
      material_bindings: module.materialBindings,
      pack_manifest: `packs/${definition.packId}/static-mesh-pack.v1.json`,
      order,
      notes: 'Module mesh géré ; validation visuelle UEFN requise avant statut READY.',
    }))
    const additions = [...textureAssets, ...materialAssets, ...meshAssets]
    if (new Set(additions.map((asset) => asset.asset_id)).size !== additions.length) throw new Error('IDs du pack dupliqués pendant la publication.')

    await mkdir(path.dirname(finalPackRoot), { recursive: true })
    await rename(temporaryPackRoot, finalPackRoot)
    packMoved = true
    const nextCatalog = { ...catalog, generatedAt, assets: [...catalog.assets, ...additions] }
    const nextCatalogBuffer = jsonBuffer(nextCatalog)
    const nextIntegrity = {
      ...integrity,
      generatedAt,
      status: 'PASS',
      catalogSha256: sha256(nextCatalogBuffer),
      assetCount: nextCatalog.assets.length,
      staticMeshCount: nextCatalog.assets.filter((asset) => asset.asset_type === 'StaticMesh').length,
      materialRecipeCount: nextCatalog.assets.filter((asset) => asset.asset_type === 'MaterialRecipe').length,
      textureCount: nextCatalog.assets.filter((asset) => asset.asset_type === 'Texture2D').length,
      checkedFileCount: Number(integrity.checkedFileCount || 0) + managedFileList.length + 1,
      missingFileCount: 0,
      hashMismatchCount: 0,
    }
    await atomicWrite(catalogFile, nextCatalogBuffer)
    catalogMutated = true
    await atomicWrite(integrityFile, jsonBuffer(nextIntegrity))
    await rebuildIndexes()
    return {
      status: 'PUBLISHED',
      assetIds: additions.map((asset) => asset.asset_id),
      sourceAggregateSha256: sourceInventory.aggregateSha256,
      sourceFileCount: sourceInventory.files.length,
      previewBytes: previewDetails.size,
    }
  } catch (error) {
    if (catalogMutated) {
      await atomicWrite(catalogFile, originalCatalogBuffer).catch(() => undefined)
      await atomicWrite(integrityFile, originalIntegrityBuffer).catch(() => undefined)
      await rebuildIndexes().catch(() => undefined)
    }
    if (packMoved) await rm(finalPackRoot, { recursive: true, force: true }).catch(() => undefined)
    throw error
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}

export const managedStaticMeshPackPublisherInternals = Object.freeze({
  assertRelativeFile,
  buildMaterialRecipe,
  inventoryDirectory,
  textureIdFor,
})
