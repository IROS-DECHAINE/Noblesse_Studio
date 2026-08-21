import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readFile as readContract } from 'node:fs/promises'
import { assertTreasuryTransaction, createManualTransactionPlan } from './financeDomain.mjs'
import { createFinanceRepository } from './financeRepository.mjs'

const contractSchema = JSON.parse(await readContract(new URL('../contracts/finance/treasury-transaction.v1.schema.json', import.meta.url), 'utf8'))
const bootstrap = JSON.parse(await readContract(new URL('../data/finance-bootstrap.v1.json', import.meta.url), 'utf8'))

const makeTempDirectory = async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'noblesse-finance-repository-'))
  t.after(async () => rm(directory, { recursive: true, force: true }))
  return directory
}

const idGenerator = () => {
  let index = 0
  return () => `${String(++index).padStart(8, '0')}-1111-4111-8111-111111111111`
}

test('importe le bootstrap une fois et garde une sauvegarde avant chaque mutation', async (t) => {
  const dataDirectory = await makeTempDirectory(t)
  const repository = createFinanceRepository({
    dataDirectory,
    validateTransaction: (entry) => assertTreasuryTransaction(entry, contractSchema),
    now: () => new Date('2026-08-21T12:00:00.000Z'),
  })

  assert.equal((await repository.initialize()).ledgerRevision, 1)
  assert.equal((await repository.importBootstrap(bootstrap)).status, 'IMPORTED')
  assert.equal((await repository.importBootstrap(bootstrap)).status, 'ALREADY_IMPORTED')
  const snapshot = await repository.readSnapshot()
  assert.equal(snapshot.transactions.length, 1)
  assert.equal(snapshot.bootstrap_imports.length, 1)
  assert.equal((await readdir(repository.paths.backupDirectory)).length, 1)
})

test('sérialise les writers concurrents sans perte et rend apply idempotent', async (t) => {
  const dataDirectory = await makeTempDirectory(t)
  const repositoryOptions = {
    dataDirectory,
    validateTransaction: (entry) => assertTreasuryTransaction(entry, contractSchema),
    now: () => new Date('2026-08-21T12:00:00.000Z'),
  }
  const repository = createFinanceRepository(repositoryOptions)
  const secondRepositoryInstance = createFinanceRepository(repositoryOptions)
  await repository.initialize()
  await repository.importBootstrap(bootstrap)
  await secondRepositoryInstance.initialize()

  const nextId = idGenerator()
  const confirmations = ['10,00', '20,00'].map((amount, index) => createManualTransactionPlan({
    amount,
    effectiveDate: `2026-08-${20 + index}`,
    label: `Dépense ${index + 1}`,
    categoryId: 'software',
  }, {
    contractSchema,
    now: () => new Date('2026-08-21T12:00:00.000Z'),
    randomUUID: nextId,
  }))

  const applied = await Promise.all([
    repository.appendPlannedTransaction(confirmations[0]),
    secondRepositoryInstance.appendPlannedTransaction(confirmations[1]),
  ])
  assert.deepEqual(applied.map((item) => item.status), ['APPLIED', 'APPLIED'])
  assert.equal((await repository.readSnapshot()).transactions.length, 3)
  assert.equal((await repository.appendPlannedTransaction(confirmations[0])).status, 'ALREADY_APPLIED')

  const ledger = JSON.parse(await readFile(repository.paths.ledgerPath, 'utf8'))
  assert.equal(ledger.transactions.length, 3)
  assert.equal(ledger.applied_operations.length, 2)
  const files = await readdir(dataDirectory)
  assert.equal(files.some((file) => file.endsWith('.tmp')), false)
  assert.equal((await readdir(repository.paths.backupDirectory)).length, 3)
})
