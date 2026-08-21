import { randomUUID } from 'node:crypto'

import { serializeError } from './operationJobStore.mjs'

const JOB_TYPE = 'DOCUMENT_IMPORT'
const RESUMABLE_STATUSES = new Set(['INTERRUPTED', 'PARTIAL', 'FAILED'])

export class DocumentImportService {
  constructor({ documentLibrary, jobStore, now = () => new Date(), itemIdFactory = randomUUID, onChanged = () => {} } = {}) {
    if (!documentLibrary || !jobStore || typeof now !== 'function' || typeof itemIdFactory !== 'function' || typeof onChanged !== 'function') {
      throw new Error('La configuration du service d’importation documentaire est invalide.')
    }
    this.documentLibrary = documentLibrary
    this.jobStore = jobStore
    this.now = now
    this.itemIdFactory = itemIdFactory
    this.onChanged = onChanged
    this.activeRuns = new Map()
  }

  _nowIso() {
    return this.now().toISOString()
  }

  async initialize() {
    await Promise.all([this.documentLibrary.ensure(), this.jobStore.ensure()])
    const interrupted = await this.jobStore.recoverInterrupted({ type: JOB_TYPE })
    for (const job of interrupted) this.onChanged(job)
    return { ready: true, interruptedCount: interrupted.length }
  }

  async start(request) {
    const prepared = await this.documentLibrary.prepareImport(request)
    const job = await this.jobStore.create({
      type: JOB_TYPE,
      title: prepared.sources.length === 1 ? `Import de ${prepared.sources[0].originalName}` : `Import de ${prepared.sources.length} documents`,
      metadata: {
        projectId: prepared.projectId,
        title: prepared.title,
        canonicalStatus: prepared.canonicalStatus,
        tags: prepared.tags,
      },
      items: prepared.sources.map((source) => ({
        id: `import-${this.itemIdFactory()}`,
        label: source.originalName,
        sourcePath: source.file,
      })),
    })
    this.onChanged(job)
    this._schedule(job.id)
    return job
  }

  _schedule(jobId) {
    const running = this.activeRuns.get(jobId)
    if (running) return running
    const promise = this._execute(jobId)
      .catch(async (error) => {
        try {
          const job = await this.jobStore.finalize(jobId, { status: 'FAILED', summary: serializeError(error).message })
          this.onChanged(job)
          return job
        } catch {
          throw error
        }
      })
      .finally(() => this.activeRuns.delete(jobId))
    this.activeRuns.set(jobId, promise)
    return promise
  }

  async _publish(value) {
    const job = await value
    this.onChanged(job)
    return job
  }

  async _execute(jobId) {
    await this._publish(this.jobStore.markRunning(jobId))
    let privateJob = await this.jobStore.get(jobId, { includePrivate: true })

    for (const currentItem of privateJob.items) {
      privateJob = await this.jobStore.get(jobId, { includePrivate: true })
      if (privateJob.cancelRequestedAt) {
        return this._publish(this.jobStore.finalize(jobId, { status: 'CANCELLED', summary: 'Importation annulée entre deux fichiers.' }))
      }
      const item = privateJob.items.find((entry) => entry.id === currentItem.id)
      if (!item || item.status === 'COMPLETED' || item.status === 'CANCELLED') continue

      await this._publish(this.jobStore.updateItem(jobId, item.id, (entry) => ({
        ...entry,
        status: 'RUNNING',
        attempts: entry.attempts + 1,
        startedAt: this._nowIso(),
        completedAt: null,
        error: null,
      })))

      try {
        const latest = await this.jobStore.get(jobId, { includePrivate: true })
        const activeItem = latest.items.find((entry) => entry.id === item.id)
        const [document] = await this.documentLibrary.import({
          projectId: latest.metadata.projectId,
          filePaths: [activeItem.sourcePath],
          title: latest.items.length === 1 ? latest.metadata.title : undefined,
          canonicalStatus: latest.metadata.canonicalStatus,
          tags: latest.metadata.tags,
          operationItemId: activeItem.id,
        })
        await this._publish(this.jobStore.updateItem(jobId, item.id, (entry) => ({
          ...entry,
          status: 'COMPLETED',
          completedAt: this._nowIso(),
          result: document,
          error: null,
        })))
      } catch (error) {
        await this._publish(this.jobStore.updateItem(jobId, item.id, (entry) => ({
          ...entry,
          status: 'FAILED',
          completedAt: this._nowIso(),
          error: serializeError(error),
        })))
      }
    }

    const final = await this.jobStore.get(jobId)
    const completed = final.progress.completed
    const failed = final.progress.failed
    const status = failed === 0 ? 'COMPLETED' : completed > 0 ? 'PARTIAL' : 'FAILED'
    const summary = status === 'COMPLETED'
      ? `${completed} document${completed > 1 ? 's' : ''} importé${completed > 1 ? 's' : ''}.`
      : `${completed} importé${completed > 1 ? 's' : ''}, ${failed} en échec. La reprise reste disponible.`
    return this._publish(this.jobStore.finalize(jobId, { status, summary }))
  }

  async list() {
    return this.jobStore.list({ type: JOB_TYPE, limit: 100 })
  }

  async get(jobId) {
    const job = await this.jobStore.get(jobId)
    if (job.type !== JOB_TYPE) throw new Error('Cette opération n’est pas une importation documentaire.')
    return job
  }

  async resume(jobId) {
    const current = await this.get(jobId)
    if (!RESUMABLE_STATUSES.has(current.status)) throw new Error('Cette importation ne peut pas être reprise dans son état actuel.')
    const reset = await this.jobStore.update(jobId, (job) => {
      job.status = 'QUEUED'
      job.completedAt = null
      job.cancelRequestedAt = null
      job.summary = ''
      for (const item of job.items) {
        if (item.status === 'FAILED' || item.status === 'RUNNING' || item.status === 'CANCELLED') {
          item.status = 'PENDING'
          item.startedAt = null
          item.completedAt = null
          item.error = null
        }
      }
      return job
    })
    this.onChanged(reset)
    this._schedule(jobId)
    return reset
  }

  async cancel(jobId) {
    const job = await this.get(jobId)
    if (['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(job.status)) return job
    return this._publish(this.jobStore.requestCancel(jobId))
  }

  async waitForIdle(jobId) {
    const running = this.activeRuns.get(jobId)
    if (running) await running
    return this.get(jobId)
  }
}

export function createDocumentImportService(options) {
  return new DocumentImportService(options)
}
