import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import {
  access,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
} from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'

export const ALLOWED_DOCUMENT_PROJECTS = Object.freeze([
  'studio',
  'primebot-rush',
  'prime-industry',
  'how-many-boxes',
])

export const BLOCKED_DOCUMENT_EXTENSIONS = Object.freeze([
  '.app', '.apk', '.bat', '.bash', '.cjs', '.cmd', '.com', '.dll', '.dmg',
  '.docm', '.exe', '.fish', '.hta', '.jar', '.js', '.jse', '.lnk', '.mjs',
  '.msi', '.msp', '.pkg', '.pl', '.ps1', '.psd1', '.psm1', '.py', '.pyw',
  '.rb', '.reg', '.scr', '.sh', '.url', '.vbe', '.vbs', '.wsf', '.wsh',
  '.xlam', '.xlsm', '.zsh',
])

const ALLOWED_PROJECT_SET = new Set(ALLOWED_DOCUMENT_PROJECTS)
const BLOCKED_EXTENSION_SET = new Set(BLOCKED_DOCUMENT_EXTENSIONS)
const CANONICAL_STATUSES = new Set(['CANON', 'REFERENCE', 'WORKING', 'ARCHIVE'])
const HISTORY_ACTIONS = new Set(['BASELINE', 'IMPORT', 'REPLACE', 'REVERT', 'DELETE', 'RESTORE'])
const MANIFEST_VERSION = 1
const DEFAULT_TEXT_LIMIT = 4 * 1024 * 1024
const DEFAULT_SELECTION_TTL = 15 * 60 * 1000
const DEFAULT_DOCUMENT_SIZE_LIMIT = 8 * 1024 * 1024 * 1024
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/

const MIME_BY_EXTENSION = Object.freeze({
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.flac': 'audio/flac',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.m4a': 'audio/mp4',
  '.markdown': 'text/markdown',
  '.md': 'text/markdown',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.oga': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.ogv': 'video/ogg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.rtf': 'application/rtf',
  '.text': 'text/plain',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.tsv': 'text/tab-separated-values',
  '.txt': 'text/plain',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
})

const TEXT_EXTENSIONS = new Set(['.csv', '.json', '.markdown', '.md', '.text', '.tsv', '.txt', '.yaml', '.yml'])
const OFFICE_EXTENSIONS = new Set(['.doc', '.docx', '.odp', '.ods', '.odt', '.ppt', '.pptx', '.rtf', '.xls', '.xlsx'])

export class DocumentLibraryError extends Error {
  constructor(code, message, details = undefined) {
    super(message)
    this.name = 'DocumentLibraryError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

const libraryError = (code, message, details) => new DocumentLibraryError(code, message, details)

const normalizeForComparison = (value) => {
  const normalized = path.normalize(value)
  return process.platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized
}

const isContained = (base, target, allowBase = false) => {
  const relative = path.relative(base, target)
  if (relative === '') return allowBase
  return !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

const pathExists = async (target) => {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

const sha256Text = (value) => createHash('sha256').update(value).digest('hex')

const sha256File = async (file) => {
  const hash = createHash('sha256')
  await pipeline(createReadStream(file), new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk)
      callback()
    },
  }))
  return hash.digest('hex')
}

const extensionOf = (fileName) => path.extname(fileName).toLocaleLowerCase('en-US')

const classifyFile = (fileName) => {
  const extensionWithDot = extensionOf(fileName)
  const mimeType = MIME_BY_EXTENSION[extensionWithDot] || 'application/octet-stream'
  let kind = 'other'
  if (extensionWithDot === '.pdf') kind = 'pdf'
  else if (extensionWithDot === '.md' || extensionWithDot === '.markdown') kind = 'markdown'
  else if (TEXT_EXTENSIONS.has(extensionWithDot)) kind = 'text'
  else if (mimeType.startsWith('image/')) kind = 'image'
  else if (mimeType.startsWith('video/')) kind = 'video'
  else if (mimeType.startsWith('audio/')) kind = 'audio'
  else if (OFFICE_EXTENSIONS.has(extensionWithDot)) kind = 'document'
  return {
    extension: extensionWithDot.replace(/^\./, ''),
    extensionWithDot,
    kind,
    mimeType,
  }
}

const derivedTitle = (fileName) => {
  const extension = path.extname(fileName)
  const stem = path.basename(fileName, extension).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return stem || path.basename(fileName)
}

const cleanTitle = (value, fallback) => {
  const title = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  if (!title) return fallback
  if (title.length > 300) throw libraryError('TITLE_TOO_LONG', 'Le titre du document dépasse 300 caractères.')
  return title
}

const cleanTags = (value) => {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw libraryError('INVALID_TAGS', 'Les étiquettes du document sont invalides.')
  const tags = [...new Set(value.map((tag) => String(tag).trim()).filter(Boolean))]
  if (tags.length > 50 || tags.some((tag) => tag.length > 80)) {
    throw libraryError('INVALID_TAGS', 'Les étiquettes du document dépassent les limites autorisées.')
  }
  return tags
}

const cleanCanonicalStatus = (value = 'REFERENCE') => {
  const status = String(value || 'REFERENCE').toLocaleUpperCase('en-US')
  if (!CANONICAL_STATUSES.has(status)) {
    throw libraryError('INVALID_CANONICAL_STATUS', 'Le statut documentaire est invalide.')
  }
  return status
}

const validateProjectId = (projectId) => {
  if (!ALLOWED_PROJECT_SET.has(projectId)) {
    throw libraryError('PROJECT_NOT_ALLOWED', 'Ce projet n’est pas autorisé dans la bibliothèque documentaire.')
  }
  return projectId
}

const validateId = (id, label = 'identifiant') => {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw libraryError('INVALID_ID', `L’${label} est invalide.`)
  }
  return id
}

const isoFrom = (value) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw libraryError('INVALID_TIME', 'La date documentaire est invalide.')
  return date.toISOString()
}

const safeEqual = (left, right) => {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

const historyEntryFor = (manifest, { revision, action, at, restoredFromRevision = null } = {}) => ({
  revision,
  action,
  at,
  sha256: manifest.sha256,
  sizeBytes: manifest.sizeBytes,
  originalName: manifest.originalName,
  extension: manifest.extension,
  kind: manifest.kind,
  mimeType: manifest.mimeType,
  ...(restoredFromRevision === null ? {} : { restoredFromRevision }),
})

const versionedManifest = (manifest) => {
  const revision = Number.isSafeInteger(manifest.revision) && manifest.revision >= 1 ? manifest.revision : 1
  const history = Array.isArray(manifest.history) && manifest.history.length
    ? manifest.history.map((entry) => ({ ...entry }))
    : [historyEntryFor(manifest, { revision: 1, action: 'BASELINE', at: manifest.createdAt })]
  return { ...manifest, revision, history }
}

const appendHistory = (manifest, action, at, extras = {}) => {
  const current = versionedManifest(manifest)
  const revision = current.revision + 1
  return {
    ...current,
    revision,
    history: [...current.history, historyEntryFor(current, { revision, action, at, ...extras })],
  }
}

const noPublicPath = (sourceManifest, available) => {
  const manifest = versionedManifest(sourceManifest)
  return {
  id: manifest.id,
  projectId: manifest.projectId,
  title: manifest.title,
  originalName: manifest.originalName,
  extension: manifest.extension,
  kind: manifest.kind,
  mimeType: manifest.mimeType,
  sizeBytes: manifest.sizeBytes,
  sha256: manifest.sha256,
  revision: manifest.revision,
  canonicalStatus: manifest.canonicalStatus,
  tags: [...manifest.tags],
  origin: manifest.origin.kind,
  createdAt: manifest.createdAt,
  updatedAt: manifest.updatedAt,
  deletedAt: manifest.deletedAt || null,
  available: Boolean(available),
  }
}

export class DocumentLibrary {
  constructor({
    root,
    bootstrapFile = '',
    now = () => new Date(),
    idFactory = randomUUID,
    selectionTtlMs = DEFAULT_SELECTION_TTL,
    maxFileBytes = DEFAULT_DOCUMENT_SIZE_LIMIT,
  } = {}) {
    if (typeof root !== 'string' || !path.isAbsolute(root)) {
      throw libraryError('INVALID_ROOT', 'La bibliothèque documentaire exige une racine locale absolue.')
    }
    if (bootstrapFile && !path.isAbsolute(bootstrapFile)) {
      throw libraryError('INVALID_BOOTSTRAP', 'Le manifeste bootstrap doit utiliser un chemin absolu.')
    }
    if (typeof now !== 'function' || typeof idFactory !== 'function') {
      throw libraryError('INVALID_CONFIGURATION', 'La configuration de la bibliothèque documentaire est invalide.')
    }
    if (!Number.isFinite(selectionTtlMs) || selectionTtlMs <= 0) {
      throw libraryError('INVALID_CONFIGURATION', 'La durée des sélections documentaires est invalide.')
    }

    if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes <= 0) {
      throw libraryError('INVALID_CONFIGURATION', 'La taille maximale des documents est invalide.')
    }

    this.root = path.resolve(root)
    this.bootstrapFile = bootstrapFile ? path.resolve(bootstrapFile) : ''
    this.now = now
    this.idFactory = idFactory
    this.selectionTtlMs = selectionTtlMs
    this.maxFileBytes = maxFileBytes
    this.manifestRoot = path.join(this.root, 'manifests')
    this.objectRoot = path.join(this.root, 'objects')
    this.planRoot = path.join(this.root, 'plans')
    this.tempRoot = path.join(this.root, '.tmp')
    this.trashRoot = path.join(this.root, '.trash')
    this.trashManifestRoot = path.join(this.trashRoot, 'manifests')
    this.trashObjectRoot = path.join(this.trashRoot, 'objects')
    this._rootReal = ''
    this._ensurePromise = null
    this._selectionTokens = new Map()
    this._mutationQueue = Promise.resolve()
  }

  async ensure() {
    if (!this._ensurePromise) this._ensurePromise = this._ensureInternal()
    try {
      return await this._ensurePromise
    } catch (error) {
      this._ensurePromise = null
      throw error
    }
  }

  async _ensureInternal() {
    await mkdir(this.root, { recursive: true })
    const rootDetails = await lstat(this.root)
    if (rootDetails.isSymbolicLink() || !rootDetails.isDirectory()) {
      throw libraryError('SYMLINK_NOT_ALLOWED', 'La racine documentaire doit être un dossier réel, sans lien symbolique.')
    }
    this._rootReal = await realpath(this.root)
    for (const folder of [
      this.manifestRoot,
      this.objectRoot,
      this.planRoot,
      this.tempRoot,
      this.trashRoot,
      this.trashManifestRoot,
      this.trashObjectRoot,
    ]) {
      await mkdir(folder, { recursive: true })
      await this._assertInternalDirectory(folder)
    }
    return {
      schemaVersion: MANIFEST_VERSION,
      ready: true,
      projectIds: [...ALLOWED_DOCUMENT_PROJECTS],
    }
  }

  async _withMutation(task) {
    const previous = this._mutationQueue
    let release
    this._mutationQueue = new Promise((resolve) => { release = resolve })
    await previous
    try {
      return await task()
    } finally {
      release()
    }
  }

  _nowIso() {
    return isoFrom(this.now())
  }

  _nowMs() {
    return new Date(this.now()).getTime()
  }

  _assertLexicalContainment(target, allowRoot = false) {
    const resolved = path.resolve(target)
    if (!isContained(this.root, resolved, allowRoot)) {
      throw libraryError('PATH_OUTSIDE_LIBRARY', 'Un chemin documentaire sort de la bibliothèque autorisée.')
    }
    return resolved
  }

  async _assertNoInternalSymlink(target, { allowMissingFinal = false } = {}) {
    const resolved = this._assertLexicalContainment(target)
    const relative = path.relative(this.root, resolved)
    let cursor = this.root
    const segments = relative.split(path.sep).filter(Boolean)
    for (let index = 0; index < segments.length; index += 1) {
      cursor = path.join(cursor, segments[index])
      let details
      try {
        details = await lstat(cursor)
      } catch (error) {
        if (error?.code === 'ENOENT' && allowMissingFinal) return resolved
        throw error
      }
      if (details.isSymbolicLink()) {
        throw libraryError('SYMLINK_NOT_ALLOWED', 'Les liens symboliques ne sont pas autorisés dans la bibliothèque documentaire.')
      }
    }
    return resolved
  }

  async _assertInternalDirectory(folder) {
    const resolved = await this._assertNoInternalSymlink(folder)
    const details = await lstat(resolved)
    if (!details.isDirectory()) throw libraryError('INVALID_LIBRARY_DIRECTORY', 'La structure documentaire locale est invalide.')
    const resolvedReal = await realpath(resolved)
    if (!isContained(this._rootReal || this.root, resolvedReal, true)) {
      throw libraryError('PATH_OUTSIDE_LIBRARY', 'Un dossier documentaire sort de la bibliothèque autorisée.')
    }
    return resolved
  }

  async _assertInternalFile(file) {
    const resolved = await this._assertNoInternalSymlink(file)
    const details = await lstat(resolved)
    if (!details.isFile()) throw libraryError('INVALID_LIBRARY_FILE', 'Un fichier interne de la bibliothèque est invalide.')
    const resolvedReal = await realpath(resolved)
    if (!isContained(this._rootReal || this.root, resolvedReal)) {
      throw libraryError('PATH_OUTSIDE_LIBRARY', 'Un fichier documentaire sort de la bibliothèque autorisée.')
    }
    return { file: resolved, details }
  }

  async _validateExternalFile(file, expectedRealPath = '') {
    if (typeof file !== 'string' || !path.isAbsolute(file)) {
      throw libraryError('INVALID_SOURCE', 'La sélection documentaire est invalide.')
    }
    const resolved = path.resolve(file)
    let details
    try {
      details = await lstat(resolved)
    } catch (error) {
      if (error?.code === 'ENOENT') throw libraryError('SOURCE_MISSING', 'Le fichier sélectionné est introuvable.')
      throw error
    }
    if (details.isSymbolicLink()) {
      throw libraryError('SYMLINK_NOT_ALLOWED', 'Les liens symboliques ne sont pas acceptés comme documents.')
    }
    if (!details.isFile()) throw libraryError('NOT_A_FILE', 'La sélection doit désigner un fichier.')
    if (details.size > this.maxFileBytes) {
      throw libraryError('FILE_TOO_LARGE', `Le document dépasse la limite de ${this.maxFileBytes} octets.`)
    }
    const resolvedReal = await realpath(resolved)
    if (normalizeForComparison(resolvedReal) !== normalizeForComparison(resolved)) {
      throw libraryError('SYMLINK_NOT_ALLOWED', 'Les chemins traversant un lien symbolique ne sont pas acceptés.')
    }
    if (expectedRealPath && normalizeForComparison(resolvedReal) !== normalizeForComparison(expectedRealPath)) {
      throw libraryError('LINK_TARGET_CHANGED', 'La cible du document lié a changé.')
    }
    const classification = classifyFile(resolved)
    if (BLOCKED_EXTENSION_SET.has(classification.extensionWithDot)) {
      throw libraryError('BLOCKED_EXTENSION', 'Ce type de fichier exécutable ou script est bloqué.')
    }
    return {
      file: resolvedReal,
      details,
      originalName: path.basename(resolved),
      ...classification,
    }
  }

  _manifestPath(id, deleted = false) {
    validateId(id)
    return path.join(deleted ? this.trashManifestRoot : this.manifestRoot, `${id}.json`)
  }

  _objectPath(sha256, deleted = false) {
    if (!SHA256_PATTERN.test(sha256)) throw libraryError('INVALID_HASH', 'Le hash documentaire est invalide.')
    return path.join(deleted ? this.trashObjectRoot : this.objectRoot, sha256)
  }

  _planPath(operationId) {
    validateId(operationId, 'identifiant d’opération')
    return path.join(this.planRoot, `${operationId}.json`)
  }

  async _atomicWriteJson(file, payload) {
    this._assertLexicalContainment(file)
    await this._assertInternalDirectory(path.dirname(file))
    await this._assertNoInternalSymlink(file, { allowMissingFinal: true })
    const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`)
    let handle
    try {
      handle = await open(temp, 'wx', 0o600)
      await handle.writeFile(`${JSON.stringify(payload, null, 2)}\n`, 'utf8')
      await handle.sync()
      await handle.close()
      handle = null
      await rename(temp, file)
    } catch (error) {
      await handle?.close().catch(() => {})
      await rm(temp, { force: true }).catch(() => {})
      throw error
    }
  }

  _validateManifest(manifest, expectedId = '') {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || manifest.schemaVersion !== MANIFEST_VERSION) {
      throw libraryError('MANIFEST_INVALID', 'Un manifeste documentaire est invalide.')
    }
    validateId(manifest.id)
    if (expectedId && manifest.id !== expectedId) throw libraryError('MANIFEST_INVALID', 'Le manifeste ne correspond pas à son identifiant.')
    validateProjectId(manifest.projectId)
    if (typeof manifest.title !== 'string' || !manifest.title.trim() || manifest.title.length > 300) {
      throw libraryError('MANIFEST_INVALID', 'Le titre d’un manifeste documentaire est invalide.')
    }
    if (typeof manifest.originalName !== 'string' || !manifest.originalName || path.basename(manifest.originalName) !== manifest.originalName) {
      throw libraryError('MANIFEST_INVALID', 'Le nom original d’un document est invalide.')
    }
    if (typeof manifest.extension !== 'string' || typeof manifest.kind !== 'string' || typeof manifest.mimeType !== 'string') {
      throw libraryError('MANIFEST_INVALID', 'Le format d’un document est invalide.')
    }
    if (!Number.isSafeInteger(manifest.sizeBytes) || manifest.sizeBytes < 0 || !SHA256_PATTERN.test(manifest.sha256)) {
      throw libraryError('MANIFEST_INVALID', 'L’intégrité d’un document est invalide.')
    }
    cleanCanonicalStatus(manifest.canonicalStatus)
    cleanTags(manifest.tags)
    isoFrom(manifest.createdAt)
    isoFrom(manifest.updatedAt)
    if (manifest.deletedAt) isoFrom(manifest.deletedAt)
    if (manifest.importOperationId !== undefined) validateId(manifest.importOperationId, 'identifiant d’importation')
    if (manifest.revision !== undefined || manifest.history !== undefined) {
      if (!Number.isSafeInteger(manifest.revision) || manifest.revision < 1 || !Array.isArray(manifest.history) || !manifest.history.length) {
        throw libraryError('MANIFEST_INVALID', 'L’historique du document est invalide.')
      }
      let previousRevision = 0
      for (const entry of manifest.history) {
        if (!entry || !Number.isSafeInteger(entry.revision) || entry.revision <= previousRevision || !HISTORY_ACTIONS.has(entry.action)) {
          throw libraryError('MANIFEST_INVALID', 'Une révision documentaire est invalide.')
        }
        isoFrom(entry.at)
        if (!SHA256_PATTERN.test(entry.sha256) || !Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 0) {
          throw libraryError('MANIFEST_INVALID', 'L’intégrité d’une révision documentaire est invalide.')
        }
        if (typeof entry.originalName !== 'string' || path.basename(entry.originalName) !== entry.originalName) {
          throw libraryError('MANIFEST_INVALID', 'Le nom d’une révision documentaire est invalide.')
        }
        if (entry.restoredFromRevision !== undefined && (!Number.isSafeInteger(entry.restoredFromRevision) || entry.restoredFromRevision < 1)) {
          throw libraryError('MANIFEST_INVALID', 'La source d’une restauration documentaire est invalide.')
        }
        previousRevision = entry.revision
      }
      if (previousRevision !== manifest.revision) throw libraryError('MANIFEST_INVALID', 'La révision courante ne correspond pas à l’historique.')
    }
    if (!manifest.origin || !['managed', 'linked'].includes(manifest.origin.kind)) {
      throw libraryError('MANIFEST_INVALID', 'L’origine d’un document est invalide.')
    }
    if (manifest.origin.kind === 'managed') {
      if (manifest.origin.objectKey !== manifest.sha256) throw libraryError('MANIFEST_INVALID', 'La clé objet d’un document est invalide.')
    } else {
      if (!path.isAbsolute(manifest.origin.sourcePath || '') || !path.isAbsolute(manifest.origin.sourceRealPath || '')) {
        throw libraryError('MANIFEST_INVALID', 'La source d’un document lié est invalide.')
      }
    }
    return manifest
  }

  async _readJson(file, code = 'INVALID_JSON') {
    await this._assertInternalFile(file)
    try {
      return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
    } catch (error) {
      if (error instanceof DocumentLibraryError) throw error
      throw libraryError(code, 'Un fichier de données documentaire est illisible.')
    }
  }

  async _readManifest(id, deleted = false) {
    const manifest = await this._readJson(this._manifestPath(id, deleted), 'MANIFEST_INVALID')
    return this._validateManifest(manifest, id)
  }

  async _manifestEntries(folder, deleted) {
    await this._assertInternalDirectory(folder)
    const entries = await readdir(folder, { withFileTypes: true })
    const manifests = []
    for (const entry of entries) {
      if (!entry.name.endsWith('.json')) continue
      if (entry.isSymbolicLink()) throw libraryError('SYMLINK_NOT_ALLOWED', 'Un manifeste symbolique a été refusé.')
      if (!entry.isFile()) continue
      const id = entry.name.slice(0, -5)
      validateId(id)
      const manifest = await this._readManifest(id, deleted)
      manifests.push(manifest)
    }
    return manifests
  }

  async _locateManifest(id, includeDeleted = false) {
    validateId(id)
    const activeFile = this._manifestPath(id)
    if (await pathExists(activeFile)) return { manifest: await this._readManifest(id), deleted: false }
    if (includeDeleted) {
      const trashFile = this._manifestPath(id, true)
      if (await pathExists(trashFile)) return { manifest: await this._readManifest(id, true), deleted: true }
    }
    throw libraryError('DOCUMENT_NOT_FOUND', 'Le document est introuvable.')
  }

  async _resolveManifestFile(manifest, deleted = false) {
    if (manifest.origin.kind === 'linked') {
      const source = await this._validateExternalFile(manifest.origin.sourcePath, manifest.origin.sourceRealPath)
      return source.file
    }
    const activeObject = this._objectPath(manifest.sha256)
    const trashObject = this._objectPath(manifest.sha256, true)
    let objectFile = activeObject
    if (!(await pathExists(activeObject)) && deleted && await pathExists(trashObject)) objectFile = trashObject
    if (!(await pathExists(objectFile))) throw libraryError('OBJECT_MISSING', 'Le fichier géré par la bibliothèque est manquant.')
    await this._assertInternalFile(objectFile)
    return objectFile
  }

  async _isAvailable(manifest, deleted = false) {
    try {
      await this._resolveManifestFile(manifest, deleted)
      return true
    } catch (error) {
      if (error instanceof DocumentLibraryError && [
        'SOURCE_MISSING', 'OBJECT_MISSING', 'LINK_TARGET_CHANGED', 'SYMLINK_NOT_ALLOWED', 'NOT_A_FILE',
      ].includes(error.code)) return false
      throw error
    }
  }

  async list({ projectId, query = '', kind = '', includeDeleted = false } = {}) {
    await this.ensure()
    if (projectId !== undefined && projectId !== '') validateProjectId(projectId)
    const active = await this._manifestEntries(this.manifestRoot, false)
    const deleted = includeDeleted ? await this._manifestEntries(this.trashManifestRoot, true) : []
    const byId = new Map()
    for (const manifest of [...deleted, ...active]) byId.set(manifest.id, manifest)
    const needle = String(query || '').trim().toLocaleLowerCase('fr')
    const requestedKind = String(kind || '').trim().toLocaleLowerCase('en-US')
    const output = []
    for (const manifest of byId.values()) {
      const isDeleted = Boolean(manifest.deletedAt)
      if (isDeleted && !includeDeleted) continue
      if (projectId && manifest.projectId !== projectId) continue
      if (requestedKind && manifest.kind.toLocaleLowerCase('en-US') !== requestedKind) continue
      if (needle) {
        const haystack = [manifest.title, manifest.originalName, manifest.kind, manifest.canonicalStatus, ...manifest.tags]
          .join(' ')
          .toLocaleLowerCase('fr')
        if (!haystack.includes(needle)) continue
      }
      output.push(noPublicPath(manifest, await this._isAvailable(manifest, isDeleted)))
    }
    return output.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title, 'fr'))
  }

  _pruneSelectionTokens() {
    const current = this._nowMs()
    for (const [token, selection] of this._selectionTokens) {
      if (selection.expiresAtMs <= current) this._selectionTokens.delete(token)
    }
  }

  async describeSelection(filePaths) {
    await this.ensure()
    if (!Array.isArray(filePaths) || !filePaths.length) {
      throw libraryError('EMPTY_SELECTION', 'Aucun document n’a été sélectionné.')
    }
    this._pruneSelectionTokens()
    const descriptions = []
    for (const candidate of filePaths) {
      try {
        const source = await this._validateExternalFile(candidate)
        const selectionToken = randomUUID()
        this._selectionTokens.set(selectionToken, {
          file: source.file,
          sizeBytes: source.details.size,
          mtimeMs: source.details.mtimeMs,
          expiresAtMs: this._nowMs() + this.selectionTtlMs,
        })
        descriptions.push({
          selectionToken,
          originalName: source.originalName,
          extension: source.extension,
          kind: source.kind,
          mimeType: source.mimeType,
          sizeBytes: source.details.size,
          allowed: true,
          blockedReason: null,
        })
      } catch (error) {
        const classification = classifyFile(typeof candidate === 'string' ? candidate : '')
        descriptions.push({
          selectionToken: null,
          originalName: typeof candidate === 'string' ? path.basename(candidate) : '',
          extension: classification.extension,
          kind: classification.kind,
          mimeType: classification.mimeType,
          sizeBytes: null,
          allowed: false,
          blockedReason: error instanceof DocumentLibraryError ? error.code : 'INVALID_SOURCE',
        })
      }
    }
    return descriptions
  }

  async _sourcesFromImportRequest({ selectionTokens, filePaths }) {
    if (selectionTokens !== undefined && filePaths !== undefined) {
      throw libraryError('AMBIGUOUS_SELECTION', 'Une importation ne peut pas mélanger jetons et chemins privilégiés.')
    }
    if (selectionTokens !== undefined) {
      if (!Array.isArray(selectionTokens) || !selectionTokens.length) throw libraryError('EMPTY_SELECTION', 'Aucun document n’a été sélectionné.')
      this._pruneSelectionTokens()
      const sources = []
      for (const token of selectionTokens) {
        if (typeof token !== 'string') throw libraryError('INVALID_SELECTION_TOKEN', 'Un jeton de sélection est invalide.')
        const selected = this._selectionTokens.get(token)
        if (!selected) throw libraryError('SELECTION_EXPIRED', 'La sélection documentaire a expiré.')
        const source = await this._validateExternalFile(selected.file)
        if (source.details.size !== selected.sizeBytes || source.details.mtimeMs !== selected.mtimeMs) {
          throw libraryError('SELECTION_CHANGED', 'Un document sélectionné a changé avant son importation.')
        }
        sources.push({ ...source, selectionToken: token })
      }
      return sources
    }
    if (!Array.isArray(filePaths) || !filePaths.length) throw libraryError('EMPTY_SELECTION', 'Aucun document n’a été sélectionné.')
    return Promise.all(filePaths.map((file) => this._validateExternalFile(file)))
  }

  async prepareImport({ projectId, selectionTokens, title, canonicalStatus = 'REFERENCE', tags = [] } = {}) {
    await this.ensure()
    validateProjectId(projectId)
    if (!Array.isArray(selectionTokens) || !selectionTokens.length) {
      throw libraryError('EMPTY_SELECTION', 'Aucun document n’a été sélectionné.')
    }
    const sources = await this._sourcesFromImportRequest({ selectionTokens })
    for (const source of sources) if (source.selectionToken) this._selectionTokens.delete(source.selectionToken)
    return {
      projectId,
      title: sources.length === 1 ? cleanTitle(title, derivedTitle(sources[0].originalName)) : '',
      canonicalStatus: cleanCanonicalStatus(canonicalStatus),
      tags: cleanTags(tags),
      sources: sources.map((source) => ({
        file: source.file,
        originalName: source.originalName,
        extension: source.extension,
        kind: source.kind,
        mimeType: source.mimeType,
        sizeBytes: source.details.size,
      })),
    }
  }

  async _findByImportOperationId(operationItemId) {
    if (!operationItemId) return null
    validateId(operationItemId, 'identifiant d’importation')
    const active = await this._manifestEntries(this.manifestRoot, false)
    const deleted = await this._manifestEntries(this.trashManifestRoot, true)
    const manifest = [...active, ...deleted].find((entry) => entry.importOperationId === operationItemId)
    if (!manifest) return null
    return noPublicPath(manifest, await this._isAvailable(manifest, Boolean(manifest.deletedAt)))
  }

  async _nextDocumentId() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const id = String(this.idFactory())
      validateId(id)
      if (!(await pathExists(this._manifestPath(id))) && !(await pathExists(this._manifestPath(id, true)))) return id
    }
    throw libraryError('ID_COLLISION', 'Impossible de créer un identifiant documentaire unique.')
  }

  async _copyAndHash(sourceFile) {
    const temp = path.join(this.tempRoot, `import-${randomUUID()}.part`)
    await this._assertNoInternalSymlink(temp, { allowMissingFinal: true })
    const hash = createHash('sha256')
    let sizeBytes = 0
    try {
      await pipeline(
        createReadStream(sourceFile),
        new Transform({
          transform(chunk, _encoding, callback) {
            hash.update(chunk)
            sizeBytes += chunk.length
            callback(null, chunk)
          },
        }),
        createWriteStream(temp, { flags: 'wx', mode: 0o600 }),
      )
      return { temp, sha256: hash.digest('hex'), sizeBytes }
    } catch (error) {
      await rm(temp, { force: true }).catch(() => {})
      throw error
    }
  }

  async _importManagedSource(source, { projectId, title, canonicalStatus, tags, operationItemId = '' }) {
    const existingImport = await this._findByImportOperationId(operationItemId)
    if (existingImport) return existingImport
    const copied = await this._copyAndHash(source.file)
    const objectFile = this._objectPath(copied.sha256)
    let objectCreated = false
    try {
      if (await pathExists(objectFile)) {
        await this._assertInternalFile(objectFile)
        if (await sha256File(objectFile) !== copied.sha256) {
          throw libraryError('OBJECT_CORRUPT', 'Un objet documentaire existant a échoué au contrôle d’intégrité.')
        }
        await rm(copied.temp, { force: true })
      } else {
        await rename(copied.temp, objectFile)
        objectCreated = true
      }

      const id = await this._nextDocumentId()
      const timestamp = this._nowIso()
      const manifest = {
        schemaVersion: MANIFEST_VERSION,
        id,
        projectId,
        title: cleanTitle(title, derivedTitle(source.originalName)),
        originalName: source.originalName,
        extension: source.extension,
        kind: source.kind,
        mimeType: source.mimeType,
        sizeBytes: copied.sizeBytes,
        sha256: copied.sha256,
        canonicalStatus,
        tags,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
        origin: { kind: 'managed', objectKey: copied.sha256 },
        ...(operationItemId ? { importOperationId: operationItemId } : {}),
      }
      manifest.revision = 1
      manifest.history = [historyEntryFor(manifest, { revision: 1, action: 'IMPORT', at: timestamp })]
      this._validateManifest(manifest, id)
      await this._atomicWriteJson(this._manifestPath(id), manifest)
      if (source.selectionToken) this._selectionTokens.delete(source.selectionToken)
      return noPublicPath(manifest, true)
    } catch (error) {
      await rm(copied.temp, { force: true }).catch(() => {})
      if (objectCreated) await rm(objectFile, { force: true }).catch(() => {})
      throw error
    }
  }

  async import({ projectId, selectionTokens, filePaths, title, canonicalStatus = 'REFERENCE', tags = [], operationItemId = '' } = {}) {
    await this.ensure()
    validateProjectId(projectId)
    const status = cleanCanonicalStatus(canonicalStatus)
    const cleanTagList = cleanTags(tags)
    return this._withMutation(async () => {
      const sources = await this._sourcesFromImportRequest({ selectionTokens, filePaths })
      if (operationItemId && sources.length !== 1) {
        throw libraryError('INVALID_IMPORT_OPERATION', 'Une opération reprenable doit correspondre à un seul document.')
      }
      const singleTitle = sources.length === 1 ? title : undefined
      const imported = []
      for (const source of sources) {
        imported.push(await this._importManagedSource(source, {
          projectId,
          title: singleTitle,
          canonicalStatus: status,
          tags: cleanTagList,
          operationItemId,
        }))
      }
      return imported
    })
  }

  async _loadBootstrapPayload(payload) {
    if (payload !== undefined) return payload
    if (!this.bootstrapFile) return { schemaVersion: MANIFEST_VERSION, documents: [] }
    let details
    try {
      details = await lstat(this.bootstrapFile)
    } catch (error) {
      if (error?.code === 'ENOENT') throw libraryError('BOOTSTRAP_NOT_FOUND', 'Le bootstrap documentaire est introuvable.')
      throw error
    }
    if (details.isSymbolicLink() || !details.isFile()) throw libraryError('SYMLINK_NOT_ALLOWED', 'Le bootstrap documentaire doit être un fichier réel.')
    try {
      return JSON.parse((await readFile(this.bootstrapFile, 'utf8')).replace(/^\uFEFF/, ''))
    } catch {
      throw libraryError('INVALID_BOOTSTRAP', 'Le bootstrap documentaire est illisible.')
    }
  }

  async bootstrap(payload = undefined) {
    await this.ensure()
    return this._withMutation(async () => {
      const bootstrap = await this._loadBootstrapPayload(payload)
      if (!bootstrap || typeof bootstrap !== 'object' || bootstrap.schemaVersion !== MANIFEST_VERSION || !Array.isArray(bootstrap.documents)) {
        throw libraryError('INVALID_BOOTSTRAP', 'Le contrat bootstrap documentaire est invalide.')
      }
      const result = { added: 0, existing: 0, skippedDeleted: 0, missing: [], rejected: [], documents: [] }
      for (const entry of bootstrap.documents) {
        const safeEntry = {
          id: typeof entry?.id === 'string' ? entry.id : '',
          projectId: typeof entry?.projectId === 'string' ? entry.projectId : '',
          title: typeof entry?.title === 'string' ? entry.title : '',
        }
        try {
          validateId(entry?.id)
          validateProjectId(entry?.projectId)
          if (await pathExists(this._manifestPath(entry.id))) {
            const manifest = await this._readManifest(entry.id)
            result.existing += 1
            result.documents.push(noPublicPath(manifest, await this._isAvailable(manifest)))
            continue
          }
          if (await pathExists(this._manifestPath(entry.id, true))) {
            result.skippedDeleted += 1
            continue
          }
          let source
          try {
            source = await this._validateExternalFile(entry.sourcePath)
          } catch (error) {
            if (error instanceof DocumentLibraryError && error.code === 'SOURCE_MISSING') {
              result.missing.push({ ...safeEntry, reason: error.code })
              continue
            }
            throw error
          }
          const digest = await sha256File(source.file)
          const timestamp = entry.createdAt ? isoFrom(entry.createdAt) : this._nowIso()
          const manifest = {
            schemaVersion: MANIFEST_VERSION,
            id: entry.id,
            projectId: entry.projectId,
            title: cleanTitle(entry.title, derivedTitle(source.originalName)),
            originalName: source.originalName,
            extension: source.extension,
            kind: source.kind,
            mimeType: source.mimeType,
            sizeBytes: source.details.size,
            sha256: digest,
            canonicalStatus: cleanCanonicalStatus(entry.canonicalStatus || 'CANON'),
            tags: cleanTags(entry.tags || []),
            createdAt: timestamp,
            updatedAt: timestamp,
            deletedAt: null,
            origin: { kind: 'linked', sourcePath: source.file, sourceRealPath: source.file },
          }
          manifest.revision = 1
          manifest.history = [historyEntryFor(manifest, { revision: 1, action: 'IMPORT', at: timestamp })]
          this._validateManifest(manifest, entry.id)
          await this._atomicWriteJson(this._manifestPath(entry.id), manifest)
          result.added += 1
          result.documents.push(noPublicPath(manifest, true))
        } catch (error) {
          result.rejected.push({
            ...safeEntry,
            reason: error instanceof DocumentLibraryError ? error.code : 'BOOTSTRAP_ENTRY_FAILED',
          })
        }
      }
      return result
    })
  }

  async resolveFile(id, { includeDeleted = false } = {}) {
    await this.ensure()
    const located = await this._locateManifest(id, includeDeleted)
    const filePath = await this._resolveManifestFile(located.manifest, located.deleted)
    return {
      filePath,
      document: noPublicPath(located.manifest, true),
    }
  }

  async readText(id, { includeDeleted = false, maxBytes = DEFAULT_TEXT_LIMIT } = {}) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw libraryError('INVALID_TEXT_LIMIT', 'La limite de lecture texte est invalide.')
    const resolved = await this.resolveFile(id, { includeDeleted })
    if (!['markdown', 'text'].includes(resolved.document.kind)) {
      throw libraryError('NOT_TEXT_DOCUMENT', 'Ce document ne peut pas être lu comme du texte.')
    }
    const details = await stat(resolved.filePath)
    if (details.size > maxBytes) throw libraryError('TEXT_TOO_LARGE', 'Ce document texte dépasse la limite de lecture intégrée.')
    const buffer = await readFile(resolved.filePath)
    if (buffer.includes(0)) throw libraryError('BINARY_TEXT', 'Ce fichier contient des données binaires.')
    return {
      id: resolved.document.id,
      text: buffer.toString('utf8').replace(/^\uFEFF/, ''),
      kind: resolved.document.kind,
      mimeType: resolved.document.mimeType,
      sha256: createHash('sha256').update(buffer).digest('hex'),
    }
  }

  async listHistory(id) {
    await this.ensure()
    const { manifest } = await this._locateManifest(id, true)
    const versioned = versionedManifest(manifest)
    return versioned.history
      .map((entry) => ({ ...entry, current: entry.revision === versioned.revision }))
      .sort((left, right) => right.revision - left.revision)
  }

  async replaceVersion(id, selectionToken) {
    await this.ensure()
    validateId(id)
    return this._withMutation(async () => {
      const manifest = await this._readManifest(id)
      if (manifest.deletedAt) throw libraryError('DOCUMENT_DELETED', 'Un document supprimé ne peut pas recevoir une nouvelle version.')
      if (manifest.origin.kind !== 'managed') throw libraryError('LINKED_VERSION_UNSUPPORTED', 'Un document lié doit être importé en mode géré avant de créer des versions.')
      const [source] = await this._sourcesFromImportRequest({ selectionTokens: [selectionToken] })
      const copied = await this._copyAndHash(source.file)
      const objectFile = this._objectPath(copied.sha256)
      let objectCreated = false
      try {
        if (await pathExists(objectFile)) {
          await this._assertInternalFile(objectFile)
          if (await sha256File(objectFile) !== copied.sha256) throw libraryError('OBJECT_CORRUPT', 'La version existante a échoué au contrôle d’intégrité.')
          await rm(copied.temp, { force: true })
        } else {
          await rename(copied.temp, objectFile)
          objectCreated = true
        }
        const updatedAt = this._nowIso()
        const content = {
          ...versionedManifest(manifest),
          originalName: source.originalName,
          extension: source.extension,
          kind: source.kind,
          mimeType: source.mimeType,
          sizeBytes: copied.sizeBytes,
          sha256: copied.sha256,
          updatedAt,
          origin: { kind: 'managed', objectKey: copied.sha256 },
        }
        const updated = appendHistory(content, 'REPLACE', updatedAt)
        this._validateManifest(updated, id)
        await this._atomicWriteJson(this._manifestPath(id), updated)
        this._selectionTokens.delete(selectionToken)
        return noPublicPath(updated, true)
      } catch (error) {
        await rm(copied.temp, { force: true }).catch(() => {})
        if (objectCreated) await rm(objectFile, { force: true }).catch(() => {})
        throw error
      }
    })
  }

  async revertVersion(id, targetRevision) {
    await this.ensure()
    validateId(id)
    if (!Number.isSafeInteger(targetRevision) || targetRevision < 1) throw libraryError('INVALID_REVISION', 'La révision demandée est invalide.')
    return this._withMutation(async () => {
      const manifest = await this._readManifest(id)
      if (manifest.deletedAt) throw libraryError('DOCUMENT_DELETED', 'Restaure le document avant de revenir à une ancienne version.')
      if (manifest.origin.kind !== 'managed') throw libraryError('LINKED_VERSION_UNSUPPORTED', 'Les documents liés ne possèdent pas de versions gérées.')
      const versioned = versionedManifest(manifest)
      const target = versioned.history.find((entry) => entry.revision === targetRevision)
      if (!target) throw libraryError('REVISION_NOT_FOUND', 'La version demandée est introuvable.')
      const objectFile = this._objectPath(target.sha256)
      await this._assertInternalFile(objectFile)
      if (await sha256File(objectFile) !== target.sha256) throw libraryError('OBJECT_CORRUPT', 'La version demandée a échoué au contrôle d’intégrité.')
      const updatedAt = this._nowIso()
      const content = {
        ...versioned,
        originalName: target.originalName,
        extension: target.extension,
        kind: target.kind,
        mimeType: target.mimeType,
        sizeBytes: target.sizeBytes,
        sha256: target.sha256,
        updatedAt,
        origin: { kind: 'managed', objectKey: target.sha256 },
      }
      const updated = appendHistory(content, 'REVERT', updatedAt, { restoredFromRevision: targetRevision })
      this._validateManifest(updated, id)
      await this._atomicWriteJson(this._manifestPath(id), updated)
      return noPublicPath(updated, true)
    })
  }

  _revisionForManifest(manifest) {
    return sha256Text(JSON.stringify(manifest))
  }

  _planHash(plan) {
    return sha256Text(JSON.stringify({
      schemaVersion: MANIFEST_VERSION,
      operationId: plan.operationId,
      documentId: plan.documentId,
      revision: plan.revision,
      action: plan.action,
      origin: plan.origin,
    }))
  }

  _publicPlan(plan) {
    return {
      operationId: plan.operationId,
      documentId: plan.documentId,
      id: plan.documentId,
      title: plan.title,
      projectId: plan.projectId,
      origin: plan.origin,
      action: plan.action,
      recoverable: true,
      originalSourceWillBeDeleted: false,
      revision: plan.revision,
      planHash: plan.planHash,
    }
  }

  async _readPlan(operationId) {
    const plan = await this._readJson(this._planPath(operationId), 'PLAN_INVALID')
    if (!plan || plan.schemaVersion !== MANIFEST_VERSION || plan.operationId !== operationId) {
      throw libraryError('PLAN_INVALID', 'Le plan de suppression est invalide.')
    }
    validateId(plan.documentId)
    if (!['PLANNED', 'COMPLETED'].includes(plan.status) || !SHA256_PATTERN.test(plan.revision) || !SHA256_PATTERN.test(plan.planHash)) {
      throw libraryError('PLAN_INVALID', 'Le plan de suppression est invalide.')
    }
    if (!safeEqual(this._planHash(plan), plan.planHash)) throw libraryError('PLAN_INVALID', 'Le plan de suppression a été altéré.')
    return plan
  }

  async _planDeleteUnlocked(id) {
    const { manifest, deleted } = await this._locateManifest(id, true)
    if (deleted || manifest.deletedAt) throw libraryError('DOCUMENT_ALREADY_DELETED', 'Le document est déjà dans la corbeille.')
    const revision = this._revisionForManifest(manifest)
    const operationId = `delete-${sha256Text(`${manifest.id}\0${revision}`).slice(0, 32)}`
    const planFile = this._planPath(operationId)
    if (await pathExists(planFile)) return this._publicPlan(await this._readPlan(operationId))
    const plan = {
      schemaVersion: MANIFEST_VERSION,
      operationId,
      documentId: manifest.id,
      title: manifest.title,
      projectId: manifest.projectId,
      origin: manifest.origin.kind,
      action: manifest.origin.kind === 'managed' ? 'MOVE_TO_TRASH' : 'UNLINK',
      revision,
      createdAt: this._nowIso(),
      status: 'PLANNED',
    }
    plan.planHash = this._planHash(plan)
    await this._atomicWriteJson(planFile, plan)
    return this._publicPlan(plan)
  }

  async planDelete(id) {
    await this.ensure()
    return this._withMutation(() => this._planDeleteUnlocked(id))
  }

  async _activeManagedReferenceCount(sha256) {
    const manifests = await this._manifestEntries(this.manifestRoot, false)
    return manifests.filter((manifest) => !manifest.deletedAt && manifest.origin.kind === 'managed' && manifest.sha256 === sha256).length
  }

  async _moveManagedObjectToTrash(manifest) {
    if (await this._activeManagedReferenceCount(manifest.sha256)) return
    const activeObject = this._objectPath(manifest.sha256)
    if (!(await pathExists(activeObject))) return
    await this._assertInternalFile(activeObject)
    const trashObject = this._objectPath(manifest.sha256, true)
    if (await pathExists(trashObject)) {
      await this._assertInternalFile(trashObject)
      if (await sha256File(trashObject) !== manifest.sha256) throw libraryError('OBJECT_CORRUPT', 'Un objet de corbeille a échoué au contrôle d’intégrité.')
      await unlink(activeObject)
      return
    }
    await rename(activeObject, trashObject)
  }

  async _completePlan(plan, document) {
    const completed = {
      ...plan,
      status: 'COMPLETED',
      completedAt: document.deletedAt || this._nowIso(),
      result: document,
    }
    await this._atomicWriteJson(this._planPath(plan.operationId), completed)
    return document
  }

  async _applyDeleteUnlocked(request, options = {}) {
    let operationId
    let planHash
    if (typeof request === 'string') {
      if (options.operationId && options.planHash) {
        operationId = options.operationId
        planHash = options.planHash
      } else {
        const planned = await this._planDeleteUnlocked(request)
        if (options.revision && options.revision !== planned.revision) throw libraryError('REVISION_CONFLICT', 'Le document a changé depuis la demande de suppression.')
        operationId = planned.operationId
        planHash = planned.planHash
      }
    } else {
      operationId = request?.operationId
      planHash = request?.planHash
    }
    validateId(operationId, 'identifiant d’opération')
    const plan = await this._readPlan(operationId)
    if (!safeEqual(plan.planHash, planHash)) throw libraryError('PLAN_MISMATCH', 'La confirmation de suppression ne correspond pas au plan préparé.')
    if (plan.status === 'COMPLETED' && plan.result) return plan.result

    const activeFile = this._manifestPath(plan.documentId)
    const trashFile = this._manifestPath(plan.documentId, true)
    if (!(await pathExists(activeFile)) && await pathExists(trashFile)) {
      const alreadyDeleted = await this._readManifest(plan.documentId, true)
      return this._completePlan(plan, noPublicPath(alreadyDeleted, await this._isAvailable(alreadyDeleted, true)))
    }
    const manifest = await this._readManifest(plan.documentId)
    if (!safeEqual(this._revisionForManifest(manifest), plan.revision)) {
      throw libraryError('REVISION_CONFLICT', 'Le document a changé depuis la préparation de sa suppression.')
    }
    if (await pathExists(trashFile)) throw libraryError('TRASH_CONFLICT', 'Une entrée de corbeille utilise déjà cet identifiant.')

    const deletedAt = this._nowIso()
    const deletedManifest = appendHistory({ ...manifest, updatedAt: deletedAt, deletedAt }, 'DELETE', deletedAt)
    await this._atomicWriteJson(activeFile, deletedManifest)
    await rename(activeFile, trashFile)
    if (manifest.origin.kind === 'managed') await this._moveManagedObjectToTrash(manifest)
    return this._completePlan(plan, noPublicPath(deletedManifest, await this._isAvailable(deletedManifest, true)))
  }

  async applyDelete(request, options = {}) {
    await this.ensure()
    return this._withMutation(() => this._applyDeleteUnlocked(request, options))
  }

  async restore(id) {
    await this.ensure()
    validateId(id)
    return this._withMutation(async () => {
      const activeFile = this._manifestPath(id)
      const trashFile = this._manifestPath(id, true)
      if (!(await pathExists(trashFile))) {
        if (await pathExists(activeFile)) {
          const active = await this._readManifest(id)
          return noPublicPath(active, await this._isAvailable(active))
        }
        throw libraryError('DOCUMENT_NOT_FOUND', 'Le document est introuvable dans la corbeille.')
      }
      if (await pathExists(activeFile)) throw libraryError('RESTORE_CONFLICT', 'Un document actif utilise déjà cet identifiant.')
      const manifest = await this._readManifest(id, true)
      if (manifest.origin.kind === 'linked') {
        await this._validateExternalFile(manifest.origin.sourcePath, manifest.origin.sourceRealPath)
      } else {
        const activeObject = this._objectPath(manifest.sha256)
        const trashObject = this._objectPath(manifest.sha256, true)
        if (!(await pathExists(activeObject))) {
          if (!(await pathExists(trashObject))) throw libraryError('OBJECT_MISSING', 'Le fichier géré à restaurer est manquant.')
          await this._assertInternalFile(trashObject)
          await rename(trashObject, activeObject)
        }
      }
      const restoredAt = this._nowIso()
      const restored = appendHistory({ ...manifest, updatedAt: restoredAt, deletedAt: null }, 'RESTORE', restoredAt)
      await this._atomicWriteJson(trashFile, restored)
      await rename(trashFile, activeFile)
      return noPublicPath(restored, true)
    })
  }
}

export function createDocumentLibrary(options) {
  return new DocumentLibrary(options)
}
