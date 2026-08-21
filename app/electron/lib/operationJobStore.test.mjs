import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createOperationJobStore } from './operationJobStore.mjs'

const createFixture = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-jobs-'))
  let id = 0
  let tick = 0
  const store = createOperationJobStore({
    root,
    idFactory: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`,
    now: () => new Date(1_700_000_000_000 + tick++ * 1_000),
  })
  return { root, store }
}

test('persists resumable operation jobs without exposing private source paths', async (t) => {
  const fixture = await createFixture()
  t.after(() => rm(fixture.root, { recursive: true, force: true }))
  const sourcePath = path.join(fixture.root, 'private-source.pdf')
  const created = await fixture.store.create({
    type: 'DOCUMENT_IMPORT',
    title: 'Import de documents',
    items: [{ id: 'item-1', label: 'Brief.pdf', sourcePath }],
    metadata: { projectId: 'studio' },
  })
  assert.equal(created.status, 'QUEUED')
  assert.equal(created.items[0].sourcePath, undefined)

  await fixture.store.markRunning(created.id)
  await fixture.store.updateItem(created.id, 'item-1', (item) => ({
    ...item,
    status: 'COMPLETED',
    attempts: item.attempts + 1,
    completedAt: new Date().toISOString(),
    result: { id: 'doc-1' },
  }))
  const completed = await fixture.store.finalize(created.id, { status: 'COMPLETED', summary: '1 document importé.' })
  assert.equal(completed.progress.completed, 1)
  assert.equal((await fixture.store.get(created.id, { includePrivate: true })).items[0].sourcePath, sourcePath)
})

test('recovers jobs left running and supports cancellation', async (t) => {
  const fixture = await createFixture()
  t.after(() => rm(fixture.root, { recursive: true, force: true }))
  const created = await fixture.store.create({
    type: 'DOCUMENT_IMPORT',
    items: [{ id: 'item-1', label: 'A' }, { id: 'item-2', label: 'B' }],
  })
  await fixture.store.markRunning(created.id)
  await fixture.store.updateItem(created.id, 'item-1', (item) => ({ ...item, status: 'RUNNING' }))
  const recovered = await fixture.store.recoverInterrupted({ type: 'DOCUMENT_IMPORT' })
  assert.equal(recovered.length, 1)
  assert.equal(recovered[0].status, 'INTERRUPTED')
  assert.equal(recovered[0].items[0].status, 'PENDING')

  await fixture.store.requestCancel(created.id)
  const cancelled = await fixture.store.finalize(created.id, { status: 'CANCELLED' })
  assert.equal(cancelled.progress.cancelled, 2)
})
