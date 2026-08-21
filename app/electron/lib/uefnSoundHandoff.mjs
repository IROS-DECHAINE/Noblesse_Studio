import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { UefnMcpClient } from './uefnMcpClient.mjs'
import {
  ASSET_TOOLSET,
  EDITOR_APP_TOOLSET,
  SOUND_HANDOFF_REQUIREMENTS,
} from './uefnTransferContract.mjs'
import { studioInstallHandoffsRoot } from './studioPaths.mjs'
import {
  loadVaultAsset,
  resolveVaultSource,
  validateVaultIntegrity,
  writeInstallReceipt,
} from './vaultService.mjs'

const SAFE_ID = /^[A-Za-z0-9_-]{1,160}$/

const normalizeMount = (value) => String(value || '').trim().replace(/^\/+|\/+$/g, '')

const safeUnrealSegment = (value, fallback) => {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return (normalized || fallback).slice(0, 64)
}

const soundAssetName = (asset) => {
  const label = safeUnrealSegment(asset.display_name || asset.label, 'Audio')
  const suffix = safeUnrealSegment(asset.asset_id, 'Sound').slice(-8)
  return `S_NBL_${label}_${suffix}`.slice(0, 96)
}

const sha256 = (file) => new Promise((resolve, reject) => {
  const hash = createHash('sha256')
  const stream = createReadStream(file)
  stream.on('data', (chunk) => hash.update(chunk))
  stream.on('error', reject)
  stream.on('end', () => resolve(hash.digest('hex')))
})

export const createUefnSoundHandoff = ({
  clientFactory = (endpoint) => new UefnMcpClient(endpoint),
  integrityValidator = validateVaultIntegrity,
  assetLoader = loadVaultAsset,
  sourceResolver = resolveVaultSource,
  handoffRoot = studioInstallHandoffsRoot(),
  receiptWriter = writeInstallReceipt,
  clock = () => new Date(),
} = {}) => async ({ assetId, projectId }, { sessionService } = {}) => {
  if (!SAFE_ID.test(String(assetId || ''))) throw new Error('Identifiant audio invalide')
  if (!projectId || typeof projectId !== 'string' || projectId.length > 160) throw new Error('Projet destination invalide')
  await integrityValidator(assetId)
  const asset = await assetLoader(assetId)
  if (asset.asset_type !== 'SoundWave') throw new Error('Cet élément du Coffre n’est pas un son installable')
  if (!String(asset.source || '').toLowerCase().endsWith('.wav')) throw new Error('Le son géré ne possède pas de WAV installable')
  if (!sessionService) throw new Error('Le gestionnaire de sessions UEFN est indisponible')

  const project = await sessionService.resolveActiveSession(projectId, { capability: 'soundHandoff' })
  const mcp = clientFactory(project.endpoint)
  await mcp.initialize()
  const missingTools = await mcp.missingTools(SOUND_HANDOFF_REQUIREMENTS)
  if (missingTools.length) {
    throw new Error(`Cette session UEFN ne peut pas préparer un son : ${missingTools.join(', ')}`)
  }

  const browserPath = await mcp.call(EDITOR_APP_TOOLSET, 'GetContentBrowserPath', {})
  const activeMount = normalizeMount(String(browserPath || '').split('/').filter(Boolean)[0])
  if (!activeMount || activeMount.toLocaleLowerCase('en-US') !== normalizeMount(project.mount).toLocaleLowerCase('en-US')) {
    throw new Error(`Le projet choisi est ${project.name}, mais UEFN affiche un autre projet`)
  }

  const packName = safeUnrealSegment(asset.pack_id, 'Noblesse_User_Audio')
  const targetFolder = `/${activeMount}/NoblesseStudio/${packName}/Audio`
  const created = await mcp.call(ASSET_TOOLSET, 'create_folder', { path: targetFolder })
  if (created !== true) throw new Error('UEFN n’a pas pu préparer le dossier Audio du projet')

  const assetName = soundAssetName(asset)
  const destinationFolder = path.join(handoffRoot, asset.asset_id)
  const handoffFile = path.join(destinationFolder, `${assetName}.wav`)
  await mkdir(destinationFolder, { recursive: true })
  await copyFile(sourceResolver(asset.source), handoffFile)
  const stagedHash = await sha256(handoffFile)
  if (asset.source_sha256 && stagedHash !== asset.source_sha256) {
    throw new Error('La copie audio préparée ne correspond pas à l’original du Vault')
  }

  await mcp.call(EDITOR_APP_TOOLSET, 'SetContentBrowserPath', { path: targetFolder })
  const preparedAt = clock().toISOString()
  await receiptWriter({
    schemaVersion: 1,
    status: 'AWAITING_USER_IMPORT',
    mode: 'UEFN_AUDIO_HANDOFF',
    assetId: asset.asset_id,
    assetName,
    sourceSha256: stagedHash,
    projectId,
    projectMount: activeMount,
    targetFolder,
    preparedAt,
    sourceOriginalPreserved: true,
  })

  return {
    mode: 'MANUAL_AUDIO_IMPORT_READY',
    project: project.name,
    assetName,
    handoffFile,
    sourceOriginalPreserved: true,
  }
}

export const prepareUefnSoundHandoff = createUefnSoundHandoff()

export const uefnSoundHandoffInternals = { safeUnrealSegment, soundAssetName }
