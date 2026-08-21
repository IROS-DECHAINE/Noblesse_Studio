import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  access,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
} from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'

const SNAPSHOT_SCHEMA_VERSION = 1
const PLAN_SCHEMA_VERSION = 1
const ROOT_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/
const SNAPSHOT_ID_PATTERN = /^snapshot-[0-9TZ-]{16,32}-[a-f0-9]{12}$/
const PLAN_ID_PATTERN = /^restore-[a-f0-9-]{36}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/

export class BackupServiceError extends Error {
  constructor(code, message, details = undefined) {
    super(message)
    this.name = 'BackupServiceError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

const backupError = (code, message, details) => new BackupServiceError(code, message, details)

const exists = async (target) => {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

const sortObject = (value) => {
  if (Array.isArray(value)) return value.map(sortObject)
  if (!value || typeof value !== 'object' || value instanceof Date) return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]))
}

export const canonicalJson = (value) => JSON.stringify(sortObject(value))
export const sha256Text = (value) => createHash('sha256').update(String(value)).digest('hex')

export const sha256File = async (file) => {
  const hash = createHash('sha256')
  await pipeline(createReadStream(file), new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk)
      callback()
    },
  }))
  return hash.digest('hex')
}

const safeEqual = (left, right) => {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

const safeRelativePath = (value) => {
  if (typeof value !== 'string' || !value || value.includes('\0') || path.isAbsolute(value)) {
    throw backupError('INVALID_RELATIVE_PATH', 'Un chemin de sauvegarde est invalide.')
  }
  const normalized = value.replaceAll('\\', '/')
  const segments = normalized.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw backupError('INVALID_RELATIVE_PATH', 'Un chemin de sauvegarde sort de sa racine autorisÃ©e.')
  }
  return normalized
}

const ensureContained = (root, candidate, { allowRoot = false } = {}) => {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(candidate)
  const relative = path.relative(resolvedRoot, resolved)
  if (relative === '') {
    if (allowRoot) return resolved
    throw backupError('PATH_OUTSIDE_ROOT', 'Le chemin de sauvegarde ne peut pas viser directement sa racine.')
  }
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw backupError('PATH_OUTSIDE_ROOT', 'Un chemin de sauvegarde sort de sa racine autorisÃ©e.')
  }
  return resolved
}

const atomicWrite = async (file, content) => {
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`)
  let handle
  try {
    handle = await open(temporary, 'wx', 0o600)
    await handle.writeFile(content)
    await handle.sync()
    await handle.close()
    handle = null
    await rename(temporary, file)
  } catch (error) {
    await handle?.close().catch(() => {})
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

const atomicWriteJson = (file, payload) => atomicWrite(file, `${JSON.stringify(payload, null, 2)}\n`)

const readJson = async (file, code = 'INVALID_JSON') => {
  try {
    return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
  } catch (error) {
    if (error?.code === 'ENOENT') throw backupError('NOT_FOUND', 'La sauvegarde demandÃ©e est introuvable.')
    throw backupError(code, 'Un fichier de sauvegarde est illisible.')
  }
}

const timestampToken = (date) => date.toISOString().replace(/[:.]/g, '-').replace('Z', 'Z')

const normalizeRoots = (roots) => {
  if (!roots || typeof roots !== 'object' || Array.isArray(roots)) {
    throw backupError('INVALID_CONFIGURATION', 'Les racines de sauvegarde sont invalides.')
  }
  const normalized = Object.entries(roots).map(([key, value]) => {
    if (!ROOT_KEY_PATTERN.test(key) || typeof value !== 'string' || !path.isAbsolute(value)) {
      throw backupError('INVALID_CONFIGURATION', 'Une racine de sauvegarde est invalide.')
    }
    return { key, root: path.resolve(value) }
  })
  if (!normalized.length) throw backupError('INVALID_CONFIGURATION', 'Aucune racine de sauvegarde nâ€™est configurÃ©e.')
  return normalized.sort((left, right) => left.key.localeCompare(right.key, 'en'))
}

const enumerateFiles = async (rootKey, root) => {
  let rootDetails
  try {
    rootDetails = await lstat(root)
  } catch (error) {
    if (error?.code === 'ENOENT') throw backupError('SOURCE_ROOT_MISSING', `La racine ${rootKey} est introuvable.`)
    throw error
  }
  if (rootDetails.isSymbolicLink() || !rootDetails.isDirectory()) {
    throw backupError('SYMLINK_NOT_ALLOWED', `La racine ${rootKey} doit Ãªtre un dossier rÃ©el.`)
  }

  const files = []
  const visit = async (folder, prefix = '') => {
    const entries = await readdir(folder, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))
    for (const entry of entries) {
      const absolute = path.join(folder, entry.name)
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isSymbolicLink()) throw backupError('SYMLINK_NOT_ALLOWED', `Lien symbolique refusÃ© : ${rootKey}/${relative}`)
      if (entry.isDirectory()) {
        await visit(absolute, relative)
        continue
      }
      if (!entry.isFile()) throw backupError('UNSUPPORTED_ENTRY', `EntrÃ©e non prise en charge : ${rootKey}/${relative}`)
      const details = await stat(absolute)
      files.push({
        rootKey,
        relativePath: safeRelativePath(relative),
        absolutePath: absolute,
        sizeBytes: details.size,
        mtimeMs: Math.trunc(details.mtimeMs),
      })
    }
  }
  await visit(root)
  return files
}

const publicSnapshot = (manifest, verification = null) => ({
  snapshotId: manifest.snapshotId,
  createdAt: manifest.createdAt,
  reason: manifest.reason,
  label: manifest.label,
  fileCount: manifest.fileCount,
  totalBytes: manifest.totalBytes,
  manifestSha256: manifest.manifestSha256,
  verified: verification?.status === 'PASS',
  verification,
})

export class BackupService {
  constructor({ backupRoot, roots, now = () => new Date(), idFactory = randomUUID } = {}) {
    if (typeof backupRoot !== 'string' || !path.isAbsolute(backupRoot)) {
      throw backupError('INVALID_CONFIGURATION', 'La destination des sauvegardes doit Ãªtre un chemin absolu.')
    }
    if (typeof now !== 'function' || typeof idFactory !== 'function') {
      throw backupError('INVALID_CONFIGURATION', 'La configuration temporelle des sauvegardes est invalide.')
    }
    this.backupRoot = path.resolve(backupRoot)
    this.roots = normalizeRoots(roots)
    this.now = now
    this.idFactory = idFactory
    this.objectsRoot = path.join(this.backupRoot, 'objects')
    this.snapshotsRoot = path.join(this.backupRoot, 'snapshots')
    this.plansRoot = path.join(this.backupRoot, 'restore-plans')
    this.stagingRoot = path.join(this.backupRoot, '.staging')
    this.lockFile = path.join(this.backupRoot, '.backup.lock')
  }

  async ensure() {
    await mkdir(this.backupRoot, { recursive: true })
    const backupDetails = await lstat(this.backupRoot)
    if (backupDetails.isSymbolicLink() || !backupDetails.isDirectory()) {
      throw backupError('SYMLINK_NOT_ALLOWED', 'La destination de sauvegarde doit Ãªtre un dossier rÃ©el.')
    }
    for (const folder of [this.objectsRoot, this.snapshotsRoot, this.plansRoot, this.stagingRoot]) {
      await mkdir(folder, { recursive: true })
      ensureContained(this.backupRoot, folder)
      const details = await lstat(folder)
      if (details.isSymbolicLink() || !details.isDirectory()) throw backupError('SYMLINK_NOT_ALLOWED', 'La structure de sauvegarde contient un lien interdit.')
    }
    for (const { key, root } of this.roots) {
      const relativeBackup = path.relative(root, this.backupRoot)
      if (relativeBackup === '' || (!relativeBackup.startsWith('..') && !path.isAbsolute(relativeBackup))) {
        throw backupError('RECURSIVE_BACKUP_ROOT', `La destination de sauvegarde ne peut pas se trouver dans la racine ${key}.`)
      }
    }
    return { ready: true, backupRoot: this.backupRoot }
  }

  async _withLock(task) {
    await this.ensure()
    let lock
    try {
      lock = await open(this.lockFile, 'wx', 0o600)
      await lock.writeFile(`${process.pid}\n${this.now().toISOString()}\n`, 'utf8')
    } catch (error) {
      if (error?.code === 'EEXIST') throw backupError('BACKUP_BUSY', 'Une opÃ©ration de sauvegarde ou restauration est dÃ©jÃ  en cours.')
      throw error
    }
    try {
      return await task()
    } finally {
      await lock.close().catch(() => {})
      await unlink(this.lockFile).catch(() => {})
    }
  }

  _objectPath(sha256) {
    if (!SHA256_PATTERN.test(sha256)) throw backupError('INVALID_HASH', 'Un hash de sauvegarde est invalide.')
    return path.join(this.objectsRoot, sha256.slice(0, 2), sha256.slice(2, 4), sha256)
  }

  _snapshotFile(snapshotId) {
    if (!SNAPSHOT_ID_PATTERN.test(snapshotId)) throw backupError('INVALID_SNAPSHOT_ID', 'Lâ€™identifiant de sauvegarde est invalide.')
    return path.join(this.snapshotsRoot, snapshotId, 'manifest.json')
  }

  _planFile(planId) {
    if (!PLAN_ID_PATTERN.test(planId)) throw backupError('INVALID_PLAN_ID', 'Lâ€™identifiant du plan de restauration est invalide.')
    return path.join(this.plansRoot, `${planId}.json`)
  }

  async _inventory() {
    const nested = await Promise.all(this.roots.map(({ key, root }) => enumerateFiles(key, root)))
    return nested.flat().sort((left, right) => (
      left.rootKey.localeCompare(right.rootKey, 'en') || left.relativePath.localeCompare(right.relativePath, 'en')
    ))
  }

  async estimate() {
    await this.ensure()
    const files = await this._inventory()
    return {
      rootCount: this.roots.length,
      fileCount: files.length,
      totalBytes: files.reduce((sum, item) => sum + item.sizeBytes, 0),
      backupRoot: this.backupRoot,
    }
  }

  async _ensureObject(source, sha256, sizeBytes) {
    const target = this._objectPath(sha256)
    await mkdir(path.dirname(target), { recursive: true })
    if (await exists(target)) {
      const details = await lstat(target)
      if (details.isSymbolicLink() || !details.isFile() || details.size !== sizeBytes || await sha256File(target) !== sha256) {
        throw backupError('BACKUP_OBJECT_CORRUPT', `Objet de sauvegarde corrompu : ${sha256}`)
      }
      return { target, created: false }
    }

    const temporary = path.join(path.dirname(target), `.${sha256}.${this.idFactory()}.part`)
    try {
      await copyFile(source, temporary)
      const copiedDetails = await lstat(temporary)
      if (copiedDetails.isSymbolicLink() || !copiedDetails.isFile() || copiedDetails.size !== sizeBytes) {
        throw backupError('BACKUP_COPY_INVALID', 'Une copie de sauvegarde est incomplÃ¨te.')
      }
      if (await sha256File(temporary) !== sha256) throw backupError('BACKUP_COPY_INVALID', 'Le hash de la copie ne correspond pas Ã  lâ€™original.')
      await rename(temporary, target)
      return { target, created: true }
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {})
      if (error?.code === 'EEXIST' && await exists(target)) return this._ensureObject(source, sha256, sizeBytes)
      throw error
    }
  }

  async _createSnapshotUnlocked({ reason = 'manual', label = '', onProgress } = {}) {
    const createdAt = this.now().toISOString()
    const snapshotId = `snapshot-${timestampToken(new Date(createdAt))}-${sha256Text(this.idFactory()).slice(0, 12)}`
    const inventory = await this._inventory()
    const files = []
    let completedBytes = 0
    let createdObjectCount = 0

    for (let index = 0; index < inventory.length; index += 1) {
      const item = inventory[index]
      const sha256 = await sha256File(item.absolutePath)
      const stored = await this._ensureObject(item.absolutePath, sha256, item.sizeBytes)
      if (stored.created) createdObjectCount += 1
      completedBytes += item.sizeBytes
      files.push({
        rootKey: item.rootKey,
        relativePath: item.relativePath,
        sizeBytes: item.sizeBytes,
        mtimeMs: item.mtimeMs,
        sha256,
      })
      onProgress?.({
        snapshotId,
        completedFiles: index + 1,
        totalFiles: inventory.length,
        completedBytes,
        totalBytes: inventory.reduce((sum, entry) => sum + entry.sizeBytes, 0),
      })
    }

    const manifestPayload = {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      snapshotId,
      createdAt,
      reason: String(reason || 'manual').slice(0, 80),
      label: String(label || '').trim().slice(0, 160),
      roots: this.roots.map(({ key }) => key),
      fileCount: files.length,
      totalBytes: files.reduce((sum, item) => sum + item.sizeBytes, 0),
      createdObjectCount,
      files,
    }
    const manifest = { ...manifestPayload, manifestSha256: sha256Text(canonicalJson(manifestPayload)) }
    const stage = path.join(this.stagingRoot, snapshotId)
    const destination = path.join(this.snapshotsRoot, snapshotId)
    await rm(stage, { recursive: true, force: true })
    await mkdir(stage, { recursive: true })
    await atomicWriteJson(path.join(stage, 'manifest.json'), manifest)
    await rename(stage, destination)
    return publicSnapshot(manifest, { status: 'PASS', verifiedAt: createdAt, checkedFileCount: files.length })
  }

  async createSnapshot(options = {}) {
    return this._withLock(() => this._createSnapshotUnlocked(options))
  }

  async _readManifest(snapshotId) {
    const manifest = await readJson(this._snapshotFile(snapshotId), 'MANIFEST_INVALID')
    if (!manifest || manifest.schemaVersion !== SNAPSHOT_SCHEMA_VERSION || manifest.snapshotId !== snapshotId || !Array.isArray(manifest.files)) {
      throw backupError('MANIFEST_INVALID', 'Le manifeste de sauvegarde est invalide.')
    }
    if (!Number.isSafeInteger(manifest.fileCount) || manifest.fileCount !== manifest.files.length || !Number.isSafeInteger(manifest.totalBytes)) {
      throw backupError('MANIFEST_INVALID', 'Les totaux de la sauvegarde sont invalides.')
    }
    const payload = { ...manifest }
    delete payload.manifestSha256
    if (!SHA256_PATTERN.test(manifest.manifestSha256) || !safeEqual(sha256Text(canonicalJson(payload)), manifest.manifestSha256)) {
      throw backupError('MANIFEST_TAMPERED', 'Le manifeste de sauvegarde a Ã©tÃ© altÃ©rÃ©.')
    }
    const seen = new Set()
    for (const item of manifest.files) {
      if (!this.roots.some((root) => root.key === item.rootKey)) throw backupError('MANIFEST_INVALID', 'Une racine inconnue apparaÃ®t dans la sauvegarde.')
      safeRelativePath(item.relativePath)
      if (!Number.isSafeInteger(item.sizeBytes) || item.sizeBytes < 0 || !Number.isSafeInteger(item.mtimeMs) || !SHA256_PATTERN.test(item.sha256)) {
        throw backupError('MANIFEST_INVALID', 'Une entrÃ©e de sauvegarde est invalide.')
      }
      const identity = `${item.rootKey}\0${item.relativePath}`
      if (seen.has(identity)) throw backupError('MANIFEST_INVALID', 'Une entrÃ©e de sauvegarde est dupliquÃ©e.')
      seen.add(identity)
    }
    return manifest
  }

  async verifySnapshot(snapshotId, { onProgress } = {}) {
    await this.ensure()
    const manifest = await this._readManifest(snapshotId)
    let checkedBytes = 0
    for (let index = 0; index < manifest.files.length; index += 1) {
      const item = manifest.files[index]
      const objectFile = this._objectPath(item.sha256)
      let details
      try {
        details = await lstat(objectFile)
      } catch (error) {
        if (error?.code === 'ENOENT') throw backupError('BACKUP_OBJECT_MISSING', `Objet manquant : ${item.sha256}`)
        throw error
      }
      if (details.isSymbolicLink() || !details.isFile() || details.size !== item.sizeBytes || await sha256File(objectFile) !== item.sha256) {
        throw backupError('BACKUP_OBJECT_CORRUPT', `Objet corrompu : ${item.sha256}`)
      }
      checkedBytes += item.sizeBytes
      onProgress?.({ completedFiles: index + 1, totalFiles: manifest.files.length, checkedBytes, totalBytes: manifest.totalBytes })
    }
    return {
      status: 'PASS',
      snapshotId,
      verifiedAt: this.now().toISOString(),
      checkedFileCount: manifest.files.length,
      checkedBytes,
      manifestSha256: manifest.manifestSha256,
    }
  }

  async listSnapshots() {
    await this.ensure()
    const entries = await readdir(this.snapshotsRoot, { withFileTypes: true })
    const output = []
    for (const entry of entries.sort((left, right) => right.name.localeCompare(left.name, 'en'))) {
      if (!entry.isDirectory() || !SNAPSHOT_ID_PATTERN.test(entry.name)) continue
      try {
        output.push(publicSnapshot(await this._readManifest(entry.name)))
      } catch (error) {
        output.push({ snapshotId: entry.name, status: 'INVALID', error: error.code || 'MANIFEST_INVALID' })
      }
    }
    return output
  }

  async status() {
    const [estimate, snapshots] = await Promise.all([this.estimate(), this.listSnapshots()])
    return {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      backupRoot: this.backupRoot,
      source: estimate,
      snapshotCount: snapshots.length,
      latestSnapshot: snapshots[0] || null,
      snapshots,
    }
  }

  async _currentStateFingerprint() {
    const inventory = await this._inventory()
    return sha256Text(canonicalJson(inventory.map(({ rootKey, relativePath, sizeBytes, mtimeMs }) => ({ rootKey, relativePath, sizeBytes, mtimeMs }))))
  }

  async planRestore(snapshotId) {
    return this._withLock(async () => {
      const manifest = await this._readManifest(snapshotId)
      const verification = await this.verifySnapshot(snapshotId)
      const planPayload = {
        schemaVersion: PLAN_SCHEMA_VERSION,
        planId: `restore-${this.idFactory()}`,
        snapshotId,
        snapshotManifestSha256: manifest.manifestSha256,
        currentStateFingerprint: await this._currentStateFingerprint(),
        createdAt: this.now().toISOString(),
        expiresAt: new Date(this.now().getTime() + 30 * 60 * 1000).toISOString(),
        fileCount: manifest.fileCount,
        totalBytes: manifest.totalBytes,
        status: 'PLANNED',
      }
      const plan = { ...planPayload, planHash: sha256Text(canonicalJson(planPayload)) }
      await atomicWriteJson(this._planFile(plan.planId), plan)
      return { ...plan, verification }
    })
  }

  async _readPlan(planId) {
    const plan = await readJson(this._planFile(planId), 'PLAN_INVALID')
    if (!plan || plan.schemaVersion !== PLAN_SCHEMA_VERSION || plan.planId !== planId || !['PLANNED', 'COMPLETED'].includes(plan.status)) {
      throw backupError('PLAN_INVALID', 'Le plan de restauration est invalide.')
    }
    const payload = { ...plan }
    delete payload.planHash
    if (!SHA256_PATTERN.test(plan.planHash) || !safeEqual(sha256Text(canonicalJson(payload)), plan.planHash)) {
      throw backupError('PLAN_TAMPERED', 'Le plan de restauration a Ã©tÃ© altÃ©rÃ©.')
    }
    return plan
  }

  async _prepareRestoreTarget(rootPath, target) {
    const safeTarget = ensureContained(rootPath, target)
    const rootDetails = await lstat(rootPath)
    if (rootDetails.isSymbolicLink() || !rootDetails.isDirectory()) {
      throw backupError('SYMLINK_NOT_ALLOWED', 'Une racine de restauration est invalide.')
    }

    const segments = path.relative(rootPath, path.dirname(safeTarget)).split(path.sep).filter(Boolean)
    let cursor = path.resolve(rootPath)
    for (const segment of segments) {
      cursor = ensureContained(rootPath, path.join(cursor, segment), { allowRoot: true })
      if (!await exists(cursor)) await mkdir(cursor)
      const details = await lstat(cursor)
      if (details.isSymbolicLink() || !details.isDirectory()) {
        throw backupError('SYMLINK_NOT_ALLOWED', 'Un dossier cible de restauration est invalide.')
      }
    }

    if (await exists(safeTarget)) {
      const targetDetails = await lstat(safeTarget)
      if (targetDetails.isSymbolicLink() || !targetDetails.isFile()) {
        throw backupError('SYMLINK_NOT_ALLOWED', 'Le fichier cible de restauration est invalide.')
      }
    }
    return safeTarget
  }

  async applyRestore({ planId, planHash } = {}) {
    return this._withLock(async () => {
      const plan = await this._readPlan(planId)
      if (!safeEqual(plan.planHash, planHash)) throw backupError('PLAN_MISMATCH', 'La confirmation ne correspond pas au plan de restauration.')
      if (plan.status === 'COMPLETED') return plan.result
      if (new Date(plan.expiresAt).getTime() < this.now().getTime()) throw backupError('PLAN_EXPIRED', 'Le plan de restauration a expirÃ©.')
      if (!safeEqual(plan.currentStateFingerprint, await this._currentStateFingerprint())) {
        throw backupError('SOURCE_CHANGED', 'Les donnÃ©es ont changÃ© depuis la prÃ©paration de la restauration.')
      }
      const manifest = await this._readManifest(plan.snapshotId)
      if (!safeEqual(manifest.manifestSha256, plan.snapshotManifestSha256)) throw backupError('SNAPSHOT_CHANGED', 'La sauvegarde a changÃ© depuis la prÃ©paration.')
      await this.verifySnapshot(plan.snapshotId)
      const safetySnapshot = await this._createSnapshotUnlocked({ reason: 'pre-restore', label: `Avant restauration de ${plan.snapshotId}` })

      for (const item of manifest.files) {
        const root = this.roots.find((entry) => entry.key === item.rootKey)
        const target = await this._prepareRestoreTarget(root.root, path.join(root.root, ...safeRelativePath(item.relativePath).split('/')))
        const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${this.idFactory()}.restore`)
        try {
          await copyFile(this._objectPath(item.sha256), temporary)
          if (await sha256File(temporary) !== item.sha256) throw backupError('RESTORE_COPY_INVALID', 'Une copie restaurÃ©e a Ã©chouÃ© au contrÃ´le de hash.')
          await rename(temporary, target)
        } catch (error) {
          await rm(temporary, { force: true }).catch(() => {})
          throw error
        }
      }

      const result = {
        status: 'COMPLETED',
        restoredAt: this.now().toISOString(),
        snapshotId: plan.snapshotId,
        fileCount: manifest.fileCount,
        totalBytes: manifest.totalBytes,
        safetySnapshotId: safetySnapshot.snapshotId,
        note: 'Les fichiers absents de la sauvegarde ont Ã©tÃ© conservÃ©s afin dâ€™Ã©viter toute suppression implicite.',
      }
      const completedPayload = { ...plan, status: 'COMPLETED', result }
      delete completedPayload.planHash
      const completed = { ...completedPayload, planHash: sha256Text(canonicalJson(completedPayload)) }
      await atomicWriteJson(this._planFile(plan.planId), completed)
      return result
    })
  }
}

export function createBackupService(options) {
  return new BackupService(options)
}
