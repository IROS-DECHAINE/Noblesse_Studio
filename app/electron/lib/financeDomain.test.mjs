import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  assertFinancePlan,
  createManualTransactionPlan,
  parseEurAmountToMinor,
  projectFinanceDashboard,
} from './financeDomain.mjs'

const contractFile = new URL('../contracts/finance/treasury-transaction.v1.schema.json', import.meta.url)
const contractSchema = JSON.parse(await readFile(contractFile, 'utf8'))

test('parse les montants EUR en centimes sans flottants et avec virgule française', () => {
  assert.equal(parseEurAmountToMinor('0,01'), 1)
  assert.equal(parseEurAmountToMinor('12,5'), 1250)
  assert.equal(parseEurAmountToMinor('1 234,56'), 123456)
  assert.equal(parseEurAmountToMinor('1\u202f234,56'), 123456)
  assert.throws(() => parseEurAmountToMinor('12.50'))
  assert.throws(() => parseEurAmountToMinor('-12,50'))
  assert.throws(() => parseEurAmountToMinor('12,500'))
  assert.throws(() => parseEurAmountToMinor(12.5))
  assert.throws(() => parseEurAmountToMinor('0,00'))
})

test('construit un plan manuel EUR traçable et détecte toute altération', () => {
  const result = createManualTransactionPlan({
    amount: '79,90',
    effectiveDate: '2026-08-21',
    label: 'Outil de production',
    categoryId: 'ai-software',
    projectId: 'primebot-rush',
    counterparty: 'Fournisseur',
  }, {
    contractSchema,
    now: () => new Date('2026-08-21T10:00:00.000Z'),
    randomUUID: () => '11111111-2222-4333-8444-555555555555',
  })

  assert.equal(result.plan.transaction.amount_minor, 7990)
  assert.equal(result.plan.transaction.flow, 'OUTFLOW')
  assert.equal(result.plan.transaction.verification, 'DECLARED')
  assert.equal(result.plan.transaction.source.type, 'MANUAL')
  assert.match(result.plan.transaction.source.raw_hash, /^sha256:[a-f0-9]{64}$/)
  assert.deepEqual(assertFinancePlan(result, contractSchema), result)

  const tampered = structuredClone(result)
  tampered.plan.transaction.amount_minor += 1
  assert.throws(() => assertFinancePlan(tampered, contractSchema), { code: 'FINANCE_PLAN_TAMPERED' })
  assert.throws(() => createManualTransactionPlan({
    amount: '10,00',
    currency: 'USD',
    effectiveDate: '2026-08-21',
    label: 'Devise interdite',
  }, {
    contractSchema,
    randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  }), { code: 'FINANCE_CURRENCY_UNSUPPORTED' })
})

const transaction = (id, date, flow, amount, overrides = {}) => ({
  schema_version: 1,
  transaction_id: `txn_${id.padEnd(8, '0')}`,
  revision: 1,
  flow,
  kind: flow === 'INFLOW' ? 'REVENUE' : 'OPERATING_EXPENSE',
  amount_minor: amount,
  currency: 'EUR',
  effective_date: date,
  project_id: null,
  category_id: 'test',
  label: `Transaction ${id}`,
  counterparty: null,
  notes: null,
  lifecycle: 'POSTED',
  financial_status: 'PAID',
  settlement: 'PAID',
  verification: 'DECLARED',
  source: {
    type: 'MANUAL',
    provider_id: 'tests',
    external_id: id,
    source_reference: null,
    observed_at: '2026-08-01T00:00:00.000Z',
    raw_hash: null,
  },
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  ...overrides,
})

test('projette 3M/6M/12M/ALL uniquement depuis les écritures actives du registre', () => {
  const entries = [
    transaction('income', '2026-08-10', 'INFLOW', 50_000),
    transaction('expense', '2026-07-10', 'OUTFLOW', 12_000),
    transaction('old', '2025-01-10', 'OUTFLOW', 5_000),
    transaction('reversed', '2026-08-11', 'INFLOW', 99_999, { lifecycle: 'REVERSED', financial_status: 'REVERSED' }),
    transaction('estimated', '2026-08-12', 'OUTFLOW', 77_777, { financial_status: 'ESTIMATED', settlement: 'UNPAID' }),
    transaction('transfer', '2026-08-13', 'OUTFLOW', 66_666, { kind: 'TRANSFER' }),
    transaction('usd', '2026-08-14', 'OUTFLOW', 55_555, { currency: 'USD' }),
    transaction('future', '2026-09-01', 'INFLOW', 88_888),
  ]

  const threeMonths = projectFinanceDashboard(entries, { range: '3M', asOf: '2026-08-21' })
  assert.equal(threeMonths.bars.length, 3)
  assert.equal(threeMonths.totals.revenueMinor, 50_000)
  assert.equal(threeMonths.totals.expenseMinor, 12_000)
  assert.equal(threeMonths.totals.netMinor, 38_000)
  assert.equal(threeMonths.totals.lifetimeBalanceMinor, 33_000)
  assert.equal(threeMonths.dataPolicy.revenue, 'REGISTERED_TRANSACTIONS_ONLY')
  assert.deepEqual(threeMonths.dataPolicy.excluded, ['ESTIMATED', 'REVERSED', 'TRANSFER'])
  assert.equal(threeMonths.dataPolicy.currencyAggregation, 'SINGLE_NATIVE_CURRENCY')
  assert.ok(threeMonths.bars.every((bucket) => Array.isArray(bucket.sourceTypes)))

  assert.equal(projectFinanceDashboard(entries, { range: '6M', asOf: '2026-08-21' }).bars.length, 6)
  assert.equal(projectFinanceDashboard(entries, { range: '12M', asOf: '2026-08-21' }).bars.length, 12)
  const all = projectFinanceDashboard(entries, { range: 'ALL', asOf: '2026-08-21' })
  assert.equal(all.rangeStart, '2025-01-01')
  assert.equal(all.totals.expenseMinor, 17_000)
})
