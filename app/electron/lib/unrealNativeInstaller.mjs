import { access, mkdir, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  listUnrealProjects,
  loadVaultAsset,
  resolveVaultSource,
  validateVaultIntegrity,
  vaultRoot,
  writeInstallReceipt,
} from './vaultService.mjs'
import { studioUnrealRoot } from './studioPaths.mjs'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const toolRoot = path.resolve(currentDir, '..', '..', 'scripts', 'unreal')
const defaultEngine = 'D:\\Program Files\\UE_5.8\\Engine\\Binaries\\Win64\\UnrealEditor-Cmd.exe'

const exists = async (target) => {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

const confinedTo = (candidate, root) => {
  const resolved = path.resolve(candidate).toLocaleLowerCase('en')
  const resolvedRoot = path.resolve(root).toLocaleLowerCase('en')
  return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`)
}

const safeToken = (value) => String(value || 'asset').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 96)

export const runUnrealCommandlet = (enginePath, projectPath, scriptPath, env, { timeoutMs = 12 * 60 * 1000 } = {}) => new Promise((resolve, reject) => {
  const args = [
    projectPath,
    '-run=pythonscript',
    `-script=${scriptPath}`,
    '-unattended',
    '-nop4',
    '-nosplash',
    '-NullRHI',
    '-NoSound',
  ]
  const child = spawn(enginePath, args, {
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  const retain = (current, chunk) => `${current}${chunk}`.slice(-80_000)
  child.stdout.on('data', (chunk) => { stdout = retain(stdout, chunk) })
  child.stderr.on('data', (chunk) => { stderr = retain(stderr, chunk) })
  const timeout = setTimeout(() => {
    child.kill()
    reject(new Error('La validation Unreal a dépassé le délai de sécurité.'))
  }, timeoutMs)
  child.once('error', (error) => {
    clearTimeout(timeout)
    reject(error)
  })
  child.once('exit', (code) => {
    clearTimeout(timeout)
    if (code !== 0) {
      reject(new Error(`Unreal a refusé le transfert (${code}). ${stderr.slice(-1200) || stdout.slice(-1200)}`))
      return
    }
    resolve({ code, stdout, stderr })
  })
})

const readJson = async (file) => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))

export const createUnrealNativeInstaller = ({
  projectIndex = listUnrealProjects,
  assetLoader = loadVaultAsset,
  integrityValidator = validateVaultIntegrity,
  sourceResolver = resolveVaultSource,
  receiptWriter = writeInstallReceipt,
  commandRunner = runUnrealCommandlet,
  enginePath = process.env.NOBLESSE_UNREAL_ENGINE_CMD || defaultEngine,
  unrealProjectRoot = studioUnrealRoot(),
  receiptDirectory = path.join(vaultRoot(), 'install-receipts'),
} = {}) => async ({ assetId, projectId }) => {
  const startedAt = Date.now()
  await integrityValidator(assetId)
  const asset = await assetLoader(assetId)
  if (asset.asset_type !== 'UnrealMaterialInstance' || asset.install_mode !== 'UNREAL_NATIVE_BUNDLE') {
    throw new Error('Cet asset n’est pas un matériau Unreal natif publiable.')
  }
  if (asset.status !== 'READY_IN_APP' || !asset.platforms?.includes('Unreal')) {
    throw new Error('Cette matière n’a pas validé la publication Unreal.')
  }

  const projects = await projectIndex()
  const project = projects.find((item) => item.id === projectId)
  if (!project || project.platform !== 'Unreal') throw new Error('Choisis un projet Unreal valide.')
  if (!project.canInstall || project.engineVersion !== '5.8') {
    throw new Error('Le projet destination doit utiliser Unreal Engine 5.8.')
  }
  if (!confinedTo(project.path, unrealProjectRoot)) throw new Error('Projet destination hors de l’espace Unreal Noblesse Studio.')
  if (!(await exists(project.path))) throw new Error('Le projet Unreal destination est introuvable.')
  if (!(await exists(enginePath))) throw new Error('Unreal Engine 5.8 est introuvable sur ce PC.')

  const sourceProject = sourceResolver(asset.native_source_project)
  if (!(await exists(sourceProject))) throw new Error('Le projet source natif du pack est incomplet.')
  if (!String(asset.source_unreal_path || '').startsWith('/Game/')) throw new Error('Chemin Unreal source invalide.')

  const runToken = `${new Date().toISOString().replace(/[:.]/g, '-')}_${safeToken(assetId)}`
  const receiptFolder = receiptDirectory
  await mkdir(receiptFolder, { recursive: true })
  const migrationReceiptPath = path.join(receiptFolder, `${runToken}_migration.json`)
  const validationReceiptPath = path.join(receiptFolder, `${runToken}_validation.json`)
  const migrationScript = path.join(toolRoot, 'unreal_migrate_native_material.py')
  const validationScript = path.join(toolRoot, 'unreal_validate_native_material.py')

  const migrationRun = await commandRunner(enginePath, sourceProject, migrationScript, {
    NOBLESSE_UNREAL_SOURCE_PACKAGE: asset.source_unreal_path,
    NOBLESSE_UNREAL_TARGET_CONTENT: path.join(project.folder, 'Content'),
    NOBLESSE_UNREAL_MIGRATION_RECEIPT: migrationReceiptPath,
  })
  if (!(await exists(migrationReceiptPath))) {
    throw new Error('Unreal n’a pas produit la preuve de migration attendue.')
  }
  const migration = await readJson(migrationReceiptPath)
  if (migration.status !== 'PASS' || migration.conflictingPackages?.length) {
    throw new Error('La migration Unreal n’a pas validé ses dépendances.')
  }

  const validationRun = await commandRunner(enginePath, project.path, validationScript, {
    NOBLESSE_UNREAL_SOURCE_PACKAGE: asset.source_unreal_path,
    NOBLESSE_UNREAL_VALIDATION_RECEIPT: validationReceiptPath,
  })
  if (!(await exists(validationReceiptPath))) {
    throw new Error('Unreal n’a pas produit la preuve de rechargement attendue.')
  }
  const validation = await readJson(validationReceiptPath)
  if (validation.status !== 'PASS' || validation.missingDependencies?.length) {
    throw new Error('Le matériau importé contient une dépendance manquante.')
  }

  const mode = migration.addedPayloads?.length || migration.changedPayloads?.length
    ? 'INSTALLED_AND_VALIDATED'
    : 'ALREADY_INSTALLED'
  const receipt = {
    schemaVersion: 1,
    status: 'PASS',
    mode,
    installer: 'NOBLESSE_STUDIO_UNREAL_NATIVE_V1',
    assetId,
    assetName: asset.display_name,
    packId: asset.pack_id,
    project: project.name,
    projectPath: project.path,
    engineVersion: project.engineVersion,
    targetPath: asset.source_unreal_path,
    payloadCount: migration.payloadCountAfter,
    addedPayloadCount: migration.addedPayloads?.length || 0,
    dependencyPackageCount: validation.dependencyCount,
    missingDependencies: validation.missingDependencies,
    parentPath: validation.parentPath,
    migrationReceiptPath,
    validationReceiptPath,
    installedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  }
  const receiptPath = await receiptWriter(receipt)
  return { accepted: true, ...receipt, receiptPath }
}

export const installUnrealNativeAsset = createUnrealNativeInstaller()
