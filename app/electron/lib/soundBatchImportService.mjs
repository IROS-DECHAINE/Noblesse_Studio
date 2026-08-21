import { randomUUID } from 'node:crypto'
import { lstat } from 'node:fs/promises'

import { serializeError } from './operationJobStore.mjs'

const JOB_TYPE = 'SOUND_IMPORT'
const RESUMABLE_STATUSES = new Set(['INTERRUPTED', 'PARTIAL', 'FAILED', 'CANCELLED'])
const TERMINAL_STATUSES = new Set(['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'])

export class SoundBatchImportService {
  constructor({
    soundLibrary,
    jobStore,
    rebuildIndexes,
    now = () => new Date(),
    itemIdFactory = randomUUID,
    onChanged = () => {},
    onAssetImported = () => {},
  } = {}) {
    if (!soundLibrary || !jobStore || typeof rebuildIndexes !== 'function' || typeof now !== 'function'
      || typeof itemIdFactory !== 'function' || typeof onChanged !== 'function' || typeof onAssetImported !== 'function') {
      throw new Error('La configuration de l’import audio multiple est invalide.')
    }
    this.soundLibrary = soundLibrary
    this.jobStore = jobStore
    this.rebuildIndexes = rebuildIndexes
    this.now = now
    this.itemIdFactory = itemIdFactory
    this.onChanged = onChanged
    this.onAssetImported = onAssetImported
    this.activeRuns = new Map()
  }

  _nowIso() {
    return this.now().toISOString()
  }

  async initialize() {
    await this.jobStore.ensure()
    const interrupted = await this.jobStore.recoverInterrupted({ type: JOB_TYPE })
    if (interrupted.length) await this.rebuildIndexes()
    for (const job of interrupted) this.onChanged(job)
    return { ready: true, interruptedCount: interrupted.length }
  }

  async start(request) {
    const prepared = this.soundLibrary.prepareBatch(request)
    const sounds = prepared.items.map((item) => ({
      id: `sound-${this.itemIdFactory()}`,
      title: item.title,
      sizeBytes: item.sizeBytes,
      modifiedAt: item.modifiedAt,
      format: item.format,
    }))
    const job = await this.jobStore.create({
      type: JOB_TYPE,
      title: prepared.items.length === 1 ? `Import de ${prepared.items[0].title}` : `Import de ${prepared.items.length} sons`,
      metadata: {
        category: prepared.category,
        rightsConfirmedAt: this._nowIso(),
        sounds,
      },
      items: prepared.items.map((item, index) => ({
        id: sounds[index].id,
        label: item.title,
        sourcePath: item.sourcePath,
      })),
    })
    this.soundLibrary.releaseSelections(prepared.items.map((item) => item.selectionToken))
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
        await this.rebuildIndexes()
        return this._publish(this.jobStore.finalize(jobId, { status: 'CANCELLED', summary: 'Import audio annulé entre deux fichiers.' }))
      }
      const item = privateJob.items.find((entry) => entry.id === currentItem.id)
      if (!item || item.status === 'COMPLETED' || item.status === 'CANCELLED') continue
      const sound = privateJob.metadata.sounds?.find((entry) => entry.id === item.id)
      if (!sound) throw new Error('Le journal audio ne contient plus les informations de ce fichier.')

      await this._publish(this.jobStore.updateItem(jobId, item.id, (entry) => ({
        ...entry,
        status: 'RUNNING',
        attempts: entry.attempts + 1,
        startedAt: this._nowIso(),
        completedAt: null,
        result: null,
        error: null,
      })))

      try {
        const details = await lstat(item.sourcePath)
        if (!details.isFile() || details.isSymbolicLink() || details.size !== sound.sizeBytes || details.mtimeMs !== sound.modifiedAt) {
          throw new Error('Le fichier audio a changé ou disparu depuis la création du lot.')
        }
        const selection = await this.soundLibrary.describeSelection(item.sourcePath)
        if (selection.file.format !== sound.format) throw new Error('Le format du fichier audio a changé depuis la création du lot.')
        const result = await this.soundLibrary.importSound({
          selectionToken: selection.file.selectionToken,
          title: sound.title,
          category: privateJob.metadata.category,
          rightsConfirmed: true,
        }, { rebuildAfter: false })
        const publicResult = {
          status: result.status,
          assetId: result.asset.asset_id,
          displayName: result.asset.display_name,
        }
        await this._publish(this.jobStore.updateItem(jobId, item.id, (entry) => ({
          ...entry,
          status: 'COMPLETED',
          completedAt: this._nowIso(),
          result: publicResult,
          error: null,
        })))
        this.onAssetImported(publicResult)
      } catch (error) {
        await this._publish(this.jobStore.updateItem(jobId, item.id, (entry) => ({
          ...entry,
          status: 'FAILED',
          completedAt: this._nowIso(),
          error: serializeError(error),
        })))
      }
    }

    await this.rebuildIndexes()
    const final = await this.jobStore.get(jobId)
    const imported = final.items.filter((item) => item.result?.status === 'IMPORTED').length
    const duplicates = final.items.filter((item) => item.result?.status === 'ALREADY_PRESENT').length
    const failed = final.progress.failed
    const status = failed === 0 ? 'COMPLETED' : final.progress.completed > 0 ? 'PARTIAL' : 'FAILED'
    const summary = status === 'COMPLETED'
      ? `${imported} son${imported > 1 ? 's' : ''} ajouté${imported > 1 ? 's' : ''}${duplicates ? `, ${duplicates} déjà présent${duplicates > 1 ? 's' : ''}` : ''}.`
      : `${imported} ajouté${imported > 1 ? 's' : ''}, ${duplicates} déjà présent${duplicates > 1 ? 's' : ''}, ${failed} en échec. La reprise reste disponible.`
    return this._publish(this.jobStore.finalize(jobId, { status, summary }))
  }

  async list() {
    return this.jobStore.list({ type: JOB_TYPE, limit: 100 })
  }

  async get(jobId) {
    const job = await this.jobStore.get(jobId)
    if (job.type !== JOB_TYPE) throw new Error('Cette opération n’est pas une importation audio.')
    return job
  }

  async resume(jobId) {
    const current = await this.get(jobId)
    if (!RESUMABLE_STATUSES.has(current.status)) throw new Error('Cette importation audio ne peut pas être reprise dans son état actuel.')
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
          item.result = null
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
    if (TERMINAL_STATUSES.has(job.status)) return job
    return this._publish(this.jobStore.requestCancel(jobId))
  }

  async waitForIdle(jobId) {
    const running = this.activeRuns.get(jobId)
    if (running) await running
    return this.get(jobId)
  }
}

export function createSoundBatchImportService(options) {
  return new SoundBatchImportService(options)
}
