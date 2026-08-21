import { createHash } from 'node:crypto'
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { studioVaultRoot } from '../electron/lib/studioPaths.mjs'

const PREVIEW_RESOLUTION = 1024
const PACK_ID_PATTERN = /^[A-Za-z0-9._-]+$/u
const REQUIRED_ROLES = Object.freeze(['baseColor', 'normal', 'orm'])

const requiredEnv = (name) => {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new Error(`Variable requise absente : ${name}`)
  return path.resolve(value)
}

const readJson = async (file) => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/u, ''))

const fileSha256 = async (file) => {
  const hash = createHash('sha256')
  hash.update(await readFile(file))
  return hash.digest('hex')
}

const assertWithin = (candidate, root, label) => {
  const resolved = path.resolve(candidate)
  const relation = path.relative(path.resolve(root), resolved)
  if (!relation || relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw new Error(`${label} doit rester dans ${root}`)
  }
  return resolved
}

const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-6000) })
  child.once('error', reject)
  child.once('exit', (code) => {
    if (code === 0) resolve()
    else reject(new Error(`${command} a échoué (${code}). ${stderr}`))
  })
})

const mapSource = (packId, filename) => (
  `packs/${packId}/previews/material-pbr-v1/${filename}`
)

const imageArguments = (source, destination, role) => {
  const colorTransform = role === 'baseColor'
    ? ['-colorspace', 'RGB', '-filter', 'Lanczos', '-resize', `${PREVIEW_RESOLUTION}x${PREVIEW_RESOLUTION}>`, '-colorspace', 'sRGB']
    : ['-set', 'colorspace', 'RGB', '-filter', 'Lanczos', '-resize', `${PREVIEW_RESOLUTION}x${PREVIEW_RESOLUTION}>`, '-set', 'colorspace', 'sRGB']
  return [
    source,
    '-alpha', 'off',
    ...colorTransform,
    '-define', 'webp:lossless=true',
    '-quality', '100',
    destination,
  ]
}

const rawRoot = requiredEnv('NOBLESSE_NATIVE_PREVIEW_RAW_ROOT')
const exportReceiptPath = requiredEnv('NOBLESSE_NATIVE_PREVIEW_EXPORT_RECEIPT')
const auditReceiptPath = requiredEnv('NOBLESSE_NATIVE_PREVIEW_AUDIT_RECEIPT')
const imageMagick = String(process.env.NOBLESSE_IMAGEMAGICK || 'magick.exe').trim()
const vaultRoot = path.resolve(studioVaultRoot())
const [exportReceipt, auditReceipt, catalog] = await Promise.all([
  readJson(exportReceiptPath),
  readJson(auditReceiptPath),
  readJson(path.join(vaultRoot, 'catalog.json')),
])

if (exportReceipt.status !== 'PASS' || exportReceipt.mode !== 'UNREAL_NATIVE_PREVIEW_MAP_EXPORT') {
  throw new Error('Le reçu d’export Unreal n’est pas validé.')
}
if (auditReceipt.status !== 'PASS' || auditReceipt.mode !== 'READ_ONLY_MATERIAL_PREVIEW_AUDIT') {
  throw new Error('Le reçu d’audit Unreal en lecture seule n’est pas validé.')
}
const packId = String(exportReceipt.packId || '')
if (!PACK_ID_PATTERN.test(packId) || packId !== auditReceipt.packId) {
  throw new Error('Identité de pack incohérente entre audit et export.')
}

const packRoot = assertWithin(path.join(vaultRoot, 'packs', packId), vaultRoot, 'Le pack')
const previewRoot = assertWithin(path.join(packRoot, 'previews'), packRoot, 'La racine des aperçus')
const finalRoot = assertWithin(path.join(previewRoot, 'material-pbr-v1'), previewRoot, 'Le cache final')
const stagingRoot = assertWithin(path.join(previewRoot, `.material-pbr-v1-staging-${process.pid}`), previewRoot, 'Le cache temporaire')
const manifestPath = assertWithin(path.join(packRoot, 'material-preview-maps.v1.json'), packRoot, 'Le manifeste')
const nativeCatalogPath = assertWithin(path.join(packRoot, 'native-catalog.json'), packRoot, 'Le catalogue natif')
const assetsById = new Map((catalog.assets || []).map((asset) => [asset.asset_id, asset]))

await access(rawRoot)
await access(nativeCatalogPath)
try {
  await access(finalRoot)
  throw new Error(`Le cache existe déjà : ${finalRoot}`)
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

await mkdir(stagingRoot, { recursive: false })
try {
  const convertedTextures = new Map()
  const textureEntries = Object.entries(exportReceipt.textures || {})
  let cursor = 0
  const workerCount = Math.min(6, Math.max(1, textureEntries.length))
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < textureEntries.length) {
      const index = cursor
      cursor += 1
      const [textureKey, texture] = textureEntries[index]
      if (!REQUIRED_ROLES.includes(texture.role) || !/^[A-Za-z0-9._-]+\.png$/u.test(texture.filename)) {
        throw new Error(`Texture exportée invalide : ${textureKey}`)
      }
      const source = assertWithin(path.join(rawRoot, texture.filename), rawRoot, 'La texture brute')
      const destinationName = `${path.basename(texture.filename, '.png')}.webp`
      const destination = assertWithin(path.join(stagingRoot, destinationName), stagingRoot, 'La texture dérivée')
      await run(imageMagick, imageArguments(source, destination, texture.role))
      const details = await stat(destination)
      if (!details.isFile() || details.size < 128) throw new Error(`Dérivé vide : ${destinationName}`)
      convertedTextures.set(textureKey, {
        colorSpace: texture.role === 'baseColor' ? 'srgb' : 'linear',
        role: texture.role,
        source: mapSource(packId, destinationName),
        sha256: await fileSha256(destination),
        sizeBytes: details.size,
        sourceObjectPath: texture.objectPath,
      })
    }
  })
  await Promise.all(workers)

  const manifestAssets = {}
  for (const [assetId, exportedAsset] of Object.entries(exportReceipt.assets || {})) {
    const catalogAsset = assetsById.get(assetId)
    const auditedAsset = (auditReceipt.assets || []).find((asset) => asset.assetId === assetId)
    if (!catalogAsset || catalogAsset.asset_type !== 'UnrealMaterialInstance' || catalogAsset.pack_id !== packId) {
      throw new Error(`Asset natif non publié : ${assetId}`)
    }
    if (!auditedAsset || auditedAsset.objectPath !== catalogAsset.source_unreal_path) {
      throw new Error(`Preuve d’audit incohérente : ${assetId}`)
    }
    const parameters = exportedAsset.parameters || {}
    if ((parameters.colorAdd || []).slice(0, 3).some((value) => Math.abs(Number(value)) > 0.00001)) {
      throw new Error(`ColorAdd non nul non pris en charge sans approximation : ${assetId}`)
    }
    const maps = Object.fromEntries(REQUIRED_ROLES.map((role) => {
      const texture = convertedTextures.get(exportedAsset.maps?.[role])
      if (!texture || texture.role !== role) throw new Error(`Carte ${role} absente : ${assetId}`)
      return [role, {
        colorSpace: texture.colorSpace,
        source: texture.source,
        sha256: texture.sha256,
        ...(role === 'orm' ? { channels: 'R=AO · G=Roughness · B=Metallic' } : {}),
      }]
    }))
    manifestAssets[assetId] = {
      assetId,
      sourceSha256: catalogAsset.source_sha256,
      sourceUnrealPath: catalogAsset.source_unreal_path,
      parentPath: exportedAsset.parentPath,
      maps,
      material: {
        baseColor: (parameters.colorMultiply || [1, 1, 1, 1]).slice(0, 4),
        emissiveColor: [0, 0, 0, 1],
        emissiveIntensity: 0,
        metalness: Number(parameters.metalness ?? 1),
        roughness: Number(parameters.roughness ?? 1),
        specularIntensity: 0.5,
      },
      uvOffset: parameters.uvOffset || [0, 0],
      uvRotationDegrees: Number(parameters.uvRotationDegrees || 0),
      uvScale: parameters.uvScale || [1, 1],
    }
  }

  if (Object.keys(manifestAssets).length !== exportReceipt.assetCount) {
    throw new Error('Le nombre d’assets dérivés ne correspond pas au reçu Unreal.')
  }

  const nativeCatalogSha256 = await fileSha256(nativeCatalogPath)
  const manifest = {
    schemaVersion: 1,
    status: 'PASS',
    kind: 'NOBLESSE_UNREAL_NATIVE_MATERIAL_PREVIEW_MAPS',
    packId,
    packVersion: catalog.assets?.find((asset) => asset.pack_id === packId)?.pack_version || '',
    nativeCatalogSha256,
    sourceAuditMode: auditReceipt.mode,
    sourceExportMode: exportReceipt.mode,
    encoding: 'WEBP_LOSSLESS',
    maxResolution: PREVIEW_RESOLUTION,
    normalConvention: 'UNREAL_DIRECTX',
    ormTransfer: 'SRGB',
    textureCount: convertedTextures.size,
    assetCount: Object.keys(manifestAssets).length,
    assets: manifestAssets,
    generatedAt: new Date().toISOString(),
  }
  const manifestTemporaryPath = `${manifestPath}.${process.pid}.tmp`
  await writeFile(manifestTemporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await rename(stagingRoot, finalRoot)
  await rename(manifestTemporaryPath, manifestPath)
  const finalBytes = [...convertedTextures.values()].reduce((sum, texture) => sum + texture.sizeBytes, 0)
  console.log(JSON.stringify({
    status: 'PASS',
    packId,
    assetCount: manifest.assetCount,
    textureCount: manifest.textureCount,
    finalBytes,
    finalRoot,
    manifestPath,
  }, null, 2))
} catch (error) {
  const relation = path.relative(previewRoot, stagingRoot)
  if (relation && relation !== '..' && !relation.startsWith(`..${path.sep}`) && !path.isAbsolute(relation)) {
    await rm(stagingRoot, { recursive: true, force: true })
  }
  throw error
}
