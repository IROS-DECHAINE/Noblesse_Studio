import { randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'

const SCHEMA_VERSION = 1
const JOB_ID_PATTERN = /^job-[a-f0-9-]{36}$/
const TERMINAL_STATUSES = new Set(['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'])
const JOB_STATUSES = new Set(['QUEUED', 'RUNNING', 'INTERRUPTED', ...TERMINAL_STATUSES])
const ITEM_STATUSES = new Set(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'])

export class OperationJobError extends Error {
  constructor(code, message, details = undefined) {
    super(message)
    this.name = 'OperationJobError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

const jobError = (code, message, details) => new OperationJobError(code, message, details)

const cleanText = (value, max, fallback = '') => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return (text || fallback).slice(0, max)
}

const serializeError = (error) => ({
  code: cleanText(error?.code, 80, 'OPERATION_FAILED'),
  message: cleanText(error?.message, 600, 'Lâ€™opÃ©ration a Ã©chouÃ©.'),
})

const publicItem = (item) => ({
  id: item.id,
  label: item.label,
  status: item.status,
  attempts: item.attempts,
  startedAt: item.startedAt,
  completedAt: item.completedAt,
  result: item.result ?? null,
  error: item.error ?? null,
})

export const publicOperationJob = (job) => ({
  schemaVersion: job.schemaVersion,
  id: job.id,
  type: job.type,
  title: job.title,
  status: job.status,
  revision: job.revision,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  startedAt: job.startedAt,
  completedAt: job.completedAt,
  cancelRequestedAt: job.cancelRequestedAt,
  summary: job.summary,
  metadata: job.metadata,
  progress: {
    total: job.items.length,
    pending: job.items.filter((item) => item.status === 'PENDING').length,
    running: job.items.filter((item) => item.status === 'RUNNING').length,
    completed: job.items.filter((item) => item.status === 'COMPLETED').length,
    failed: job.items.filter((item) => item.status === 'FAILED').length,
    cancelled: job.items.filter((item) => item.status === 'CANCELLED').length,
  },
  items: job.items.map(publicItem),
})

export class OperationJobStore {
  constructor({ root, now = () => new Date(), idFactory = randomUUID } = {}) {
    if (typeof root !== 'string' || !path.isAbsolute(root) || typeof now !== 'function' || typeof idFactory !== 'function') {
      throw jobError('INVALID_CONFIGURATION', 'La configuration du journal dâ€™opÃ©rations est invalide.')
    }
    this.root = path.resolve(root)
    this.now = now
    this.idFactory = idFactory
    this.jobsRoot = path.join(this.root, 'jobs')
    this._mutationQueue = Promise.resolve()
  }

  _nowIso() {
    const value = this.now()
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) throw jobError('INVALID_TIME', 'La date du journal dâ€™opÃ©rations est invalide.')
    return date.toISOString()
  }

  async ensure() {
    await mkdir(this.jobsRoot, { recursive: true })
    for (const folder of [this.root, this.jobsRoot]) {
      const details = await lstat(folder)
      if (details.isSymbolicLink() || !details.isDirectory()) throw jobError('SYMLINK_NOT_ALLOWED', 'Le journal dâ€™opÃ©rations doit utiliser des dossiers rÃ©els.')
    }
    return { ready: true, schemaVersion: SCHEMA_VERSION }
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

  _jobFile(id) {
    if (!JOB_ID_PATTERN.test(String(id || ''))) throw jobError('INVALID_JOB_ID', 'Lâ€™identifiant de lâ€™opÃ©ration est invalide.')
    return path.join(this.jobsRoot, `${id}.json`)
  }

  async _atomicWrite(job) {
    const file = this._jobFile(job.id)
    const temporary = path.join(this.jobsRoot, `.${job.id}.${randomUUID()}.tmp`)
    let handle
    try {
      handle = await open(temporary, 'wx', 0o600)
      await handle.writeFile(`${JSON.stringify(job, null, 2)}\n`, 'utf8')
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

  _validate(job, expectedId = '') {
    if (!job || job.schemaVersion !== SCHEMA_VERSION || !JOB_ID_PATTERN.test(job.id) || (expectedId && job.id !== expectedId)) {
      throw jobError('JOB_INVALID', 'Un journal dâ€™opÃ©ration est invalide.')
    }
    if (!JOB_STATUSES.has(job.status) || !Number.isSafeInteger(job.revision) || job.revision < 1 || !Array.isArray(job.items)) {
      throw jobError('JOB_INVALID', 'Lâ€™Ã©tat dâ€™une opÃ©ration est invalide.')
    }
    const ids = new Set()
    for (const item of job.items) {
      if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || !ITEM_STATUSES.has(item.status)) {
        throw jobError('JOB_INVALID', 'Une Ã©tape du journal dâ€™opÃ©ration est invalide.')
      }
      if (item.sourcePath !== undefined && (typeof item.sourcePath !== 'string' || !path.isAbsolute(item.sourcePath))) {
        throw jobError('JOB_INVALID', 'Une source privÃ©e du journal est invalide.')
      }
      ids.add(item.id)
    }
    return job
  }

  async _read(id) {
    const file = this._jobFile(id)
    let details
    try {
      details = await lstat(file)
    } catch (error) {
      if (error?.code === 'ENOENT') throw jobError('JOB_NOT_FOUND', 'Lâ€™opÃ©ration est introuvable.')
      throw error
    }
    if (details.isSymbolicLink() || !details.isFile()) throw jobError('SYMLINK_NOT_ALLOWED', 'Le journal dâ€™opÃ©ration doit Ãªtre un fichier rÃ©el.')
    try {
      return this._validate(JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, '')), id)
    } catch (error) {
      if (error instanceof OperationJobError) throw error
      throw jobError('JOB_INVALID', 'Le journal dâ€™opÃ©ration est illisible.')
    }
  }

  async create({ type, title, items, metadata = {} } = {}) {
    await this.ensure()
    const cleanType = cleanText(type, 80)
    if (!cleanType || !Array.isArray(items) || !items.length || items.length > 10_000) {
      throw jobError('INVALID_JOB', 'La nouvelle opÃ©ration est invalide.')
    }
    return this._withMutation(async () => {
      const timestamp = this._nowIso()
      const id = `job-${this.idFactory()}`
      const normalizedItems = items.map((item, index) => ({
        id: cleanText(item?.id, 128, `item-${String(index + 1).padStart(6, '0')}`),
        label: cleanText(item?.label, 300, `Ã‰lÃ©ment ${index + 1}`),
        sourcePath: item?.sourcePath,
        status: 'PENDING',
        attempts: 0,
        startedAt: null,
        completedAt: null,
        result: null,
        error: null,
      }))
      const job = this._validate({
        schemaVersion: SCHEMA_VERSION,
        id,
        type: cleanType,
        title: cleanText(title, 200, cleanType),
        status: 'QUEUED',
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        startedAt: null,
        completedAt: null,
        cancelRequestedAt: null,
        summary: '',
        metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
        items: normalizedItems,
      })
      await this._atomicWrite(job)
      return publicOperationJob(job)
    })
  }

  async get(id, { includePrivate = false } = {}) {
    await this.ensure()
    const job = await this._read(id)
    return includePrivate ? structuredClone(job) : publicOperationJob(job)
  }

  async list({ type = '', limit = 100 } = {}) {
    await this.ensure()
    const max = Math.max(1, Math.min(500, Number(limit) || 100))
    const entries = await readdir(this.jobsRoot, { withFileTypes: true })
    const jobs = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const id = entry.name.slice(0, -5)
      if (!JOB_ID_PATTERN.test(id)) continue
      const job = await this._read(id)
      if (type && job.type !== type) continue
      jobs.push(publicOperationJob(job))
    }
    return jobs.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, max)
  }

  async update(id, updater) {
    await this.ensure()
    if (typeof updater !== 'function') throw jobError('INVALID_UPDATE', 'La mise Ã  jour de lâ€™opÃ©ration est invalide.')
    return this._withMutation(async () => {
      const current = await this._read(id)
      const nextValue = await updater(structuredClone(current))
      const next = this._validate(nextValue || current, id)
      next.revision = current.revision + 1
      next.updatedAt = this._nowIso()
      await this._atomicWrite(next)
      return publicOperationJob(next)
    })
  }

  async markRunning(id) {
    return this.update(id, (job) => {
      if (job.status === 'COMPLETED' || job.status === 'CANCELLED') return job
      job.status = 'RUNNING'
      job.startedAt ||= this._nowIso()
      job.completedAt = null
      return job
    })
  }

  async updateItem(id, itemId, updater) {
    return this.update(id, (job) => {
      const item = job.items.find((entry) => entry.id === itemId)
      if (!item) throw jobError('JOB_ITEM_NOT_FOUND', 'Lâ€™Ã©tape demandÃ©e est introuvable.')
      const changed = updater(item, job) || item
      Object.assign(item, changed)
      if (!ITEM_STATUSES.has(item.status)) throw jobError('INVALID_ITEM_STATUS', 'Le statut de lâ€™Ã©tape est invalide.')
      return job
    })
  }

  async requestCancel(id) {
    return this.update(id, (job) => {
      if (TERMINAL_STATUSES.has(job.status)) return job
      job.cancelRequestedAt ||= this._nowIso()
      return job
    })
  }

  async finalize(id, { status, summary = '' } = {}) {
    if (!TERMINAL_STATUSES.has(status)) throw jobError('INVALID_FINAL_STATUS', 'Le statut final de lâ€™opÃ©ration est invalide.')
    return this.update(id, (job) => {
      job.status = status
      job.summary = cleanText(summary, 600)
      job.completedAt = this._nowIso()
      if (status === 'CANCELLED') {
        for (const item of job.items) {
          if (item.status === 'PENDING' || item.status === 'RUNNING') {
            item.status = 'CANCELLED'
            item.completedAt = job.completedAt
          }
        }
      }
      return job
    })
  }

  async recoverInterrupted({ type = '' } = {}) {
    await this.ensure()
    const entries = await readdir(this.jobsRoot, { withFileTypes: true })
    const recovered = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const id = entry.name.slice(0, -5)
      if (!JOB_ID_PATTERN.test(id)) continue
      const current = await this._read(id)
      if (current.status !== 'RUNNING' || (type && current.type !== type)) continue
      recovered.push(await this.update(id, (job) => {
        job.status = 'INTERRUPTED'
        job.summary = 'Lâ€™application sâ€™est arrÃªtÃ©e avant la fin. La reprise est disponible.'
        for (const item of job.items) if (item.status === 'RUNNING') item.status = 'PENDING'
        return job
      }))
    }
    return recovered
  }

  async remove(id) {
    await this.ensure()
    return this._withMutation(async () => {
      const job = await this._read(id)
      if (!TERMINAL_STATUSES.has(job.status)) throw jobError('JOB_NOT_TERMINAL', 'Une opÃ©ration active ne peut pas Ãªtre supprimÃ©e du journal.')
      await rm(this._jobFile(id), { force: true })
      return { removed: true, id }
    })
  }
}

export function createOperationJobStore(options) {
  return new OperationJobStore(options)
}

export { serializeError }
