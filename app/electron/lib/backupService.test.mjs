import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { BackupServiceError, createBackupService } from './backupService.mjs'

const makeIds = () => {
  let counter = 0
  return () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`
}

const createFixture = async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'noblesse-backup-'))
  const roots = {
    vault: path.join(base, 'live', 'vault'),
    documents: path.join(base, 'live', 'documents'),
    state: path.join(base, 'live', 'state'),
  }
  await Promise.all(Object.values(roots).map((folder) => mkdir(folder, { recursive: true })))
  await writeFile(path.join(roots.vault, 'asset.bin'), Buffer.from('asset-v1'))
  await writeFile(path.join(roots.documents, 'brief.md'), '# Brief\n')
  await writeFile(path.join(roots.state, 'calendar.json'), '{"revision":1}\n')
  const service = createBackupService({
    backupRoot: path.join(base, 'backup-repository'),
    roots,
    now: () => new Date('2026-08-21T12:00:00.000Z'),
    idFactory: makeIds(),
  })
  return { base, roots, service }
}

test('creates content-addressed snapshots, verifies them, and restores through a confirmed plan', async (t) => {
  const fixture = await createFixture()
  t.after(() => rm(fixture.base, { recursive: true, force: true }))

  const first = await fixture.service.createSnapshot({ reason: 'manual', label: 'Baseline' })
  assert.equal(first.fileCount, 3)
  assert.equal((await fixture.service.verifySnapshot(first.snapshotId)).status, 'PASS')

  await writeFile(path.join(fixture.roots.vault, 'asset.bin'), Buffer.from('asset-v2'))
  const second = await fixture.service.createSnapshot({ reason: 'manual', label: 'Après modification' })
  assert.notEqual(second.manifestSha256, first.manifestSha256)
  assert.equal((await fixture.service.listSnapshots()).length, 2)

  const plan = await fixture.service.planRestore(first.snapshotId)
  const restored = await fixture.service.applyRestore({ planId: plan.planId, planHash: plan.planHash })
  assert.equal(restored.status, 'COMPLETED')
  assert.equal(restored.snapshotId, first.snapshotId)
  assert.match(restored.safetySnapshotId, /^snapshot-/)
  assert.equal(await readFile(path.join(fixture.roots.vault, 'asset.bin'), 'utf8'), 'asset-v1')

  const repeated = await fixture.service.applyRestore({ planId: plan.planId, planHash: (await fixture.service._readPlan(plan.planId)).planHash })
  assert.deepEqual(repeated, restored)
})

test('refuses stale restore plans and tampered manifests', async (t) => {
  const fixture = await createFixture()
  t.after(() => rm(fixture.base, { recursive: true, force: true }))

  const snapshot = await fixture.service.createSnapshot()
  const plan = await fixture.service.planRestore(snapshot.snapshotId)
  await writeFile(path.join(fixture.roots.state, 'calendar.json'), '{"revision":2}\n')
  await assert.rejects(
    fixture.service.applyRestore({ planId: plan.planId, planHash: plan.planHash }),
    (error) => error instanceof BackupServiceError && error.code === 'SOURCE_CHANGED',
  )

  const manifestFile = fixture.service._snapshotFile(snapshot.snapshotId)
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
  manifest.files[0].relativePath = '../escape.txt'
  await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
  await assert.rejects(
    fixture.service.verifySnapshot(snapshot.snapshotId),
    (error) => error instanceof BackupServiceError && error.code === 'MANIFEST_TAMPERED',
  )
})

test('never allows the backup repository inside a protected source root', async (t) => {
  const fixture = await createFixture()
  t.after(() => rm(fixture.base, { recursive: true, force: true }))
  const invalid = createBackupService({
    backupRoot: path.join(fixture.roots.state, 'backups'),
    roots: fixture.roots,
  })
  await assert.rejects(
    invalid.ensure(),
    (error) => error instanceof BackupServiceError && error.code === 'RECURSIVE_BACKUP_ROOT',
  )
})
