import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createOperationJobStore } from './operationJobStore.mjs'
import { processSoundFile } from './audioFileProcessor.mjs'
import { createSoundBatchImportService } from './soundBatchImportService.mjs'
import { createSoundLibraryService } from './soundLibraryService.mjs'

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

const pcmWav = (sample = 0) => {
  const dataBytes = 9_600
  const buffer = Buffer.alloc(44 + dataBytes)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(buffer.length - 8, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(48_000, 24)
  buffer.writeUInt32LE(96_000, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataBytes, 40)
  buffer.fill(sample, 44)
  return buffer
}

const uuids = () => {
  let count = 0
  return () => `00000000-0000-4000-8000-${String(++count).padStart(12, '0')}`
}

const fixture = async (t, { processSource = processSoundFile } = {}) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-sound-batch-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const vault = path.join(root, 'library', 'storage')
  const sources = path.join(root, 'sources')
  await Promise.all([mkdir(vault, { recursive: true }), mkdir(sources, { recursive: true })])
  const catalogBuffer = Buffer.from(`${JSON.stringify({ schemaVersion: 1, generatedAt: '2026-08-22T00:00:00.000Z', assets: [] }, null, 2)}\n`)
  await writeFile(path.join(vault, 'catalog.json'), catalogBuffer)
  await writeFile(path.join(vault, 'integrity.json'), `${JSON.stringify({
    schemaVersion: 1,
    status: 'PASS',
    catalogSha256: sha256(catalogBuffer),
    assetCount: 0,
    checkedFileCount: 0,
    missingFileCount: 0,
    hashMismatchCount: 0,
  }, null, 2)}\n`)
  const first = path.join(sources, 'Impact_lourd.wav')
  const second = path.join(sources, 'Ambiance usine.wav')
  await Promise.all([writeFile(first, pcmWav(1)), writeFile(second, pcmWav(2))])
  const jobStore = createOperationJobStore({ root: path.join(root, 'operations'), idFactory: uuids() })
  const soundLibrary = createSoundLibraryService({
    vaultRoot: vault,
    rebuildIndexes: async () => undefined,
    processSource,
    idFactory: uuids(),
  })
  let rebuildCount = 0
  const service = createSoundBatchImportService({
    soundLibrary,
    jobStore,
    rebuildIndexes: async () => { rebuildCount += 1 },
    itemIdFactory: uuids(),
  })
  await service.initialize()
  return { root, vault, first, second, soundLibrary, service, rebuildCount: () => rebuildCount }
}

test('imports a filename-titled batch through one durable operation and one index rebuild', async (t) => {
  const { vault, first, second, soundLibrary, service, rebuildCount } = await fixture(t)
  const selection = await soundLibrary.describeSelections([first, second])
  assert.deepEqual(selection.files.map((file) => file.suggestedTitle), ['Impact lourd', 'Ambiance usine'])
  assert.equal(JSON.stringify(selection).includes(path.dirname(first)), false)

  const started = await service.start({
    items: selection.files.map((file) => ({ selectionToken: file.selectionToken, title: file.suggestedTitle })),
    category: 'Effets',
    rightsConfirmed: true,
  })
  assert.equal(started.status, 'QUEUED')
  const completed = await service.waitForIdle(started.id)
  assert.equal(completed.status, 'COMPLETED')
  assert.equal(completed.progress.completed, 2)
  assert.equal(completed.items.some((item) => Object.hasOwn(item, 'sourcePath')), false)
  assert.equal(JSON.stringify(completed).includes(path.dirname(first)), false)
  assert.equal(rebuildCount(), 1)
  assert.equal(JSON.parse(await readFile(path.join(vault, 'catalog.json'), 'utf8')).assets.length, 2)
})
test('keeps successful sounds and resumes only failed files', async (t) => {
  let failSecond = true
  const processSource = async (request) => {
    if (failSecond && path.basename(request.sourcePath) === 'Ambiance usine.wav') throw new Error('Échec audio injecté')
    return processSoundFile(request)
  }
  const { vault, first, second, soundLibrary, service, rebuildCount } = await fixture(t, { processSource })
  const selection = await soundLibrary.describeSelections([first, second])
  const started = await service.start({
    items: selection.files.map((file) => ({ selectionToken: file.selectionToken, title: file.suggestedTitle })),
    category: 'Ambiances',
    rightsConfirmed: true,
  })
  const partial = await service.waitForIdle(started.id)
  assert.equal(partial.status, 'PARTIAL')
  assert.equal(partial.progress.completed, 1)
  assert.equal(partial.progress.failed, 1)

  failSecond = false
  await service.resume(started.id)
  const completed = await service.waitForIdle(started.id)
  assert.equal(completed.status, 'COMPLETED')
  assert.equal(completed.items[0].attempts, 1)
  assert.equal(completed.items[1].attempts, 2)
  assert.equal(rebuildCount(), 2)
  assert.equal(JSON.parse(await readFile(path.join(vault, 'catalog.json'), 'utf8')).assets.length, 2)
})
