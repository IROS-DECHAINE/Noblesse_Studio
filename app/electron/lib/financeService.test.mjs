import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createFinanceService, financeIpcChannels } from './financeService.mjs'

const makeTempDirectory = async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'noblesse-finance-service-'))
  t.after(async () => rm(directory, { recursive: true, force: true }))
  return directory
}

test('offre un parcours plan/apply durable, idempotent et sans API de suppression', async (t) => {
  const dataDirectory = await makeTempDirectory(t)
  const options = {
    dataDirectory,
    now: () => new Date('2026-08-21T15:00:00.000Z'),
    randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  }
  const service = createFinanceService(options)
  const ready = await service.initialize()
  assert.equal(ready.status, 'READY')
  assert.equal(ready.transactionCount, 1)
  assert.equal(service.deleteTransaction, undefined)

  const confirmation = await service.planManualTransaction({
    amount: '49,99',
    effectiveDate: '2026-08-21',
    projectId: 'primebot-rush',
    categoryId: 'ai-software',
    label: 'Abonnement de production',
    counterparty: 'OpenAI',
    notes: 'Saisie réelle par Theo',
  })
  const first = await service.applyTransactionPlan(confirmation)
  const retry = await service.applyTransactionPlan(confirmation)
  assert.equal(first.status, 'APPLIED')
  assert.equal(retry.status, 'ALREADY_APPLIED')
  assert.equal(retry.transaction.transaction_id, first.transaction.transaction_id)

  const dashboard = await service.getDashboard({ range: '3M', asOf: '2026-08-21' })
  assert.equal(dashboard.totals.revenueMinor, 0)
  assert.equal(dashboard.totals.expenseMinor, 14_999)
  assert.equal(dashboard.bars.length, 3)
  assert.equal(dashboard.dataPolicy.revenue, 'REGISTERED_TRANSACTIONS_ONLY')

  const listed = await service.listTransactions({ flow: 'OUTFLOW' })
  assert.equal(listed.total, 2)
  assert.equal(listed.transactions[0].label, 'Abonnement de production')

  const restarted = createFinanceService(options)
  const restartedReady = await restarted.initialize()
  assert.equal(restartedReady.transactionCount, 2)
  assert.equal(restartedReady.bootstrap.status, 'ALREADY_IMPORTED')
  assert.equal((await restarted.getDashboard({ range: 'ALL', asOf: '2026-08-21' })).totals.expenseMinor, 14_999)
})

test('refuse un plan altéré avant toute écriture', async (t) => {
  const service = createFinanceService({
    dataDirectory: await makeTempDirectory(t),
    now: () => new Date('2026-08-21T15:00:00.000Z'),
    randomUUID: () => 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
  })
  const confirmation = await service.planManualTransaction({
    amount: '10,00',
    effectiveDate: '2026-08-21',
    categoryId: 'other',
    label: 'Dépense test',
  })
  confirmation.plan.transaction.label = 'Plan altéré'
  await assert.rejects(() => service.applyTransactionPlan(confirmation), { code: 'FINANCE_PLAN_TAMPERED' })
  assert.equal((await service.listTransactions()).total, 1)
})

test('force une saisie V1 en dépense EUR payée malgré un brouillon hostile', async (t) => {
  const service = createFinanceService({
    dataDirectory: await makeTempDirectory(t),
    now: () => new Date('2026-08-21T15:00:00.000Z'),
    randomUUID: () => 'dddddddd-eeee-4fff-8aaa-bbbbbbbbbbbb',
  })
  const confirmation = await service.planManualTransaction({
    amount: '10,00',
    effectiveDate: '2026-08-21',
    categoryId: 'operations',
    label: 'Dépense réelle',
    flow: 'INFLOW',
    kind: 'REVENUE',
    currency: 'USD',
    financialStatus: 'ESTIMATED',
    settlement: 'UNPAID',
  })
  const transaction = confirmation.plan.transaction
  assert.equal(transaction.flow, 'OUTFLOW')
  assert.equal(transaction.kind, 'OPERATING_EXPENSE')
  assert.equal(transaction.currency, 'EUR')
  assert.equal(transaction.financial_status, 'PAID')
  assert.equal(transaction.settlement, 'PAID')
})

test('publie des noms IPC stables pour la couche Electron', () => {
  assert.deepEqual(financeIpcChannels, {
    dashboard: 'finance:get-dashboard',
    listTransactions: 'finance:list-transactions',
    planTransaction: 'finance:plan-transaction',
    applyTransaction: 'finance:apply-transaction',
    changed: 'finance:changed',
  })
})

test('utilise la date civile Europe/Paris et refuse une dépense payée future', async (t) => {
  const service = createFinanceService({
    dataDirectory: await makeTempDirectory(t),
    now: () => new Date('2026-08-20T23:30:00.000Z'),
    randomUUID: () => 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa',
  })

  const dashboard = await service.getDashboard({ range: '3M' })
  assert.equal(dashboard.asOf, '2026-08-21')
  assert.equal(dashboard.timezone, 'Europe/Paris')
  assert.deepEqual(dashboard.bankConnection, {
    status: 'NOT_CONFIGURED',
    provider: null,
    lastSyncAt: null,
  })

  await assert.doesNotReject(() => service.planManualTransaction({
    amount: '10,00',
    effectiveDate: '2026-08-21',
    categoryId: 'operations',
    label: 'Dépense du jour',
  }))
  await assert.rejects(() => service.planManualTransaction({
    amount: '10,00',
    effectiveDate: '2026-08-22',
    categoryId: 'operations',
    label: 'Dépense future',
  }), { code: 'FINANCE_FUTURE_PAID_EXPENSE' })
})

test('conserve deux dépenses concurrentes issues de deux instances de service', async (t) => {
  const dataDirectory = await makeTempDirectory(t)
  const common = {
    dataDirectory,
    now: () => new Date('2026-08-21T15:00:00.000Z'),
  }
  const firstService = createFinanceService({
    ...common,
    randomUUID: () => 'eeeeeeee-ffff-4000-8aaa-cccccccccccc',
  })
  const secondService = createFinanceService({
    ...common,
    randomUUID: () => 'ffffffff-aaaa-4111-8bbb-dddddddddddd',
  })
  await Promise.all([firstService.initialize(), secondService.initialize()])

  const makeDraft = (label) => ({
    amount: '10,00',
    effectiveDate: '2026-08-21',
    categoryId: 'operations',
    label,
  })
  const [firstPlan, secondPlan] = await Promise.all([
    firstService.planManualTransaction(makeDraft('Dépense concurrente A')),
    secondService.planManualTransaction(makeDraft('Dépense concurrente B')),
  ])
  await Promise.all([
    firstService.applyTransactionPlan(firstPlan),
    secondService.applyTransactionPlan(secondPlan),
  ])

  const snapshot = await firstService.listTransactions()
  assert.equal(snapshot.total, 3)
  assert.deepEqual(new Set(snapshot.transactions.map((item) => item.label)), new Set([
    'GPT Pro',
    'Dépense concurrente A',
    'Dépense concurrente B',
  ]))
})
