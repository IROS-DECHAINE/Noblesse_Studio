import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createVaultTrashService } from './vaultTrashService.mjs'

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const jsonBuffer = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')

const fixture = async (t, rebuildIndexes = async () => undefined) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-vault-trash-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const soundFolder = path.join(root, 'user-audio', 'SOUND-01')
  await mkdir(soundFolder, { recursive: true })
  const soundBytes = Buffer.from('managed-wav')
  await writeFile(path.join(soundFolder, 'audio.wav'), soundBytes)
  const assets = [
    {
      asset_id: 'SOUND-01',
      display_name: 'Impact lourd',
      asset_type: 'SoundWave',
      source: 'user-audio/SOUND-01/audio.wav',
      source_sha256: sha256(soundBytes),
    },
    { asset_id: 'TEXTURE-01', display_name: 'T_Brique_BC', asset_type: 'Texture2D' },
    { asset_id: 'MATERIAL-01', display_name: 'M_Brique', asset_type: 'MaterialRecipe', dependencies: 'T_Brique_BC' },
  ]
  const catalogBuffer = jsonBuffer({ schemaVersion: 1, generatedAt: '2026-08-22T00:00:00.000Z', assets })
  await writeFile(path.join(root, 'catalog.json'), catalogBuffer)
  await writeFile(path.join(root, 'integrity.json'), jsonBuffer({
    schemaVersion: 1,
    generatedAt: '2026-08-22T00:00:00.000Z',
    status: 'PASS',
    catalogSha256: sha256(catalogBuffer),
    assetCount: 3,
    materialRecipeCount: 1,
    materialReferenceCount: 0,
    unrealMaterialInstanceCount: 0,
    textureCount: 1,
    soundCount: 1,
    checkedFileCount: 1,
    missingFileCount: 0,
    hashMismatchCount: 0,
  }))
  const service = createVaultTrashService({
    vaultRoot: root,
    rebuildIndexes,
    idFactory: () => '00000000-0000-4000-8000-000000000001',
    now: () => new Date('2026-08-22T12:00:00.000Z'),
  })
  return { root, service }
}

test('uses a persisted double-confirmation plan, preserves originals and restores a sound', async (t) => {
  let rebuildCount = 0
  const { root, service } = await fixture(t, async () => { rebuildCount += 1 })
  const plan = await service.plan({ assetIds: ['SOUND-01'] })
  assert.equal(plan.blocked, false)
  assert.equal(plan.originalsPreserved, true)
  assert.equal(JSON.stringify(plan).includes(root), false)

  await assert.rejects(service.apply({ operationId: plan.operationId, planHash: plan.planHash }), /seconde confirmation/i)
  const deleted = await service.apply({ operationId: plan.operationId, planHash: plan.planHash, confirmationPhrase: 'CORBEILLE' })
  assert.equal(deleted.targetCount, 1)
  assert.equal(JSON.stringify(deleted).includes(root), false)
  assert.deepEqual(await readFile(path.join(root, 'user-audio', 'SOUND-01', 'audio.wav')), Buffer.from('managed-wav'))
  const deletedCatalog = JSON.parse(await readFile(path.join(root, 'catalog.json'), 'utf8'))
  const deletedIntegrity = JSON.parse(await readFile(path.join(root, 'integrity.json'), 'utf8'))
  assert.equal(deletedCatalog.assets.some((asset) => asset.asset_id === 'SOUND-01'), false)
  assert.equal(deletedIntegrity.assetCount, 2)
  assert.equal(deletedIntegrity.soundCount, 0)
  assert.equal(deletedIntegrity.checkedFileCount, 1)
  assert.equal((await service.list()).items.length, 1)

  const restored = await service.restore({ trashId: deleted.trashId })
  assert.equal(restored.restored, true)
  assert.equal((await service.list()).items.length, 0)
  const restoredCatalog = JSON.parse(await readFile(path.join(root, 'catalog.json'), 'utf8'))
  assert.equal(restoredCatalog.assets.some((asset) => asset.asset_id === 'SOUND-01'), true)
  assert.equal(rebuildCount, 2)
})

test('blocks a texture still referenced by a material and rolls back a failed projection', async (t) => {
  const { service } = await fixture(t)
  const blocked = await service.plan({ assetIds: ['TEXTURE-01'] })
  assert.equal(blocked.blocked, true)
  assert.equal(blocked.blockers[0].id, 'MATERIAL-01')
  await assert.rejects(service.apply({ operationId: blocked.operationId, planHash: blocked.planHash, confirmationPhrase: 'CORBEILLE' }), /encore utilisé/i)
})

test('restores the catalog when rebuilding projections fails', async (t) => {
  const { root, service } = await fixture(t, async () => { throw new Error('projection failed') })
  const before = await readFile(path.join(root, 'catalog.json'))
  const plan = await service.plan({ assetIds: ['SOUND-01'] })
  await assert.rejects(service.apply({ operationId: plan.operationId, planHash: plan.planHash, confirmationPhrase: 'CORBEILLE' }), /projection failed/)
  assert.deepEqual(await readFile(path.join(root, 'catalog.json')), before)
  assert.equal((await service.list()).items.length, 0)
})
