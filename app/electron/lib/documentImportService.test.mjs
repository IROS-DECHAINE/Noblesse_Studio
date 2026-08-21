import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDocumentImportService } from './documentImportService.mjs'
import { createDocumentLibrary } from './documentLibrary.mjs'
import { createOperationJobStore } from './operationJobStore.mjs'

const ids = (prefix) => {
  let count = 0
  return () => `${prefix}-${String(++count).padStart(6, '0')}`
}

const uuids = () => {
  let count = 0
  return () => `00000000-0000-4000-8000-${String(++count).padStart(12, '0')}`
}

const fixture = async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-import-service-'))
  const sources = path.join(root, 'sources')
  await mkdir(sources, { recursive: true })
  const library = createDocumentLibrary({ root: path.join(root, 'documents'), idFactory: ids('document') })
  const jobStore = createOperationJobStore({ root: path.join(root, 'operations'), idFactory: uuids() })
  const service = createDocumentImportService({ documentLibrary: library, jobStore, itemIdFactory: uuids() })
  t.after(() => rm(root, { recursive: true, force: true }))
  await service.initialize()
  return { root, sources, library, jobStore, service }
}

test('imports selected files through a durable background job', async (t) => {
  const { sources, library, service } = await fixture(t)
  const first = path.join(sources, 'first.md')
  const second = path.join(sources, 'second.md')
  await writeFile(first, '# First\n')
  await writeFile(second, '# Second\n')
  const selections = await library.describeSelection([first, second])
  const started = await service.start({
    projectId: 'studio',
    selectionTokens: selections.map((item) => item.selectionToken),
    canonicalStatus: 'CANON',
    tags: ['imported'],
  })
  assert.equal(started.status, 'QUEUED')
  const completed = await service.waitForIdle(started.id)
  assert.equal(completed.status, 'COMPLETED')
  assert.equal(completed.progress.completed, 2)
  assert.equal((await library.list({ projectId: 'studio' })).length, 2)
  assert.equal(completed.items.some((item) => Object.hasOwn(item, 'sourcePath')), false)
})

test('partial jobs resume only failed items and remain idempotent', async (t) => {
  const { sources, library, jobStore, service } = await fixture(t)
  const available = path.join(sources, 'available.md')
  const delayed = path.join(sources, 'delayed.md')
  await writeFile(available, '# Available\n')
  const created = await jobStore.create({
    type: 'DOCUMENT_IMPORT',
    metadata: { projectId: 'studio', title: '', canonicalStatus: 'REFERENCE', tags: [] },
    items: [
      { id: 'import-00000000-0000-4000-8000-000000000001', label: 'available.md', sourcePath: available },
      { id: 'import-00000000-0000-4000-8000-000000000002', label: 'delayed.md', sourcePath: delayed },
    ],
  })
  await jobStore.update(created.id, (job) => ({ ...job, status: 'INTERRUPTED' }))
  await service.resume(created.id)
  const partial = await service.waitForIdle(created.id)
  assert.equal(partial.status, 'PARTIAL')
  assert.equal(partial.progress.completed, 1)
  assert.equal(partial.progress.failed, 1)

  await writeFile(delayed, '# Delayed\n')
  await service.resume(created.id)
  const completed = await service.waitForIdle(created.id)
  assert.equal(completed.status, 'COMPLETED')
  assert.equal(completed.items[0].attempts, 1)
  assert.equal(completed.items[1].attempts, 2)
  assert.equal((await library.list()).length, 2)
})
