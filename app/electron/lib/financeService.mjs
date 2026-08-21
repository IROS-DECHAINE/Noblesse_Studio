import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import {
  assertFinancePlan,
  assertTreasuryContract,
  assertTreasuryTransaction,
  createManualTransactionPlan,
  FinanceValidationError,
  projectFinanceDashboard,
} from './financeDomain.mjs'
import { createFinanceRepository } from './financeRepository.mjs'

const DEFAULT_CONTRACT_FILE = new URL('../contracts/finance/treasury-transaction.v1.schema.json', import.meta.url)
const DEFAULT_BOOTSTRAP_FILE = new URL('../data/finance-bootstrap.v1.json', import.meta.url)
const STUDIO_TIME_ZONE = 'Europe/Paris'

const calendarDateInTimeZone = (value, timeZone = STUDIO_TIME_ZONE) => {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) {
    throw new FinanceValidationError('Horloge Finance invalide', { code: 'FINANCE_CLOCK_INVALID' })
  }
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

const readJson = async (file, label) => {
  try {
    return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new FinanceValidationError(`${label} contient un JSON invalide`, { code: 'FINANCE_CONFIGURATION_INVALID' })
    }
    throw error
  }
}

const validDateFilter = (value, field) => {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new FinanceValidationError(`${field} doit être une date YYYY-MM-DD`, { path: `$.${field}` })
  }
  return value
}

export const createFinanceService = ({
  dataDirectory,
  bootstrapFile = DEFAULT_BOOTSTRAP_FILE,
  contractFile = DEFAULT_CONTRACT_FILE,
  now = () => new Date(),
  randomUUID: randomUUIDImpl = randomUUID,
} = {}) => {
  let contractSchema = null
  let initialization = null
  const repository = createFinanceRepository({
    dataDirectory,
    now,
    validateTransaction: (transaction) => {
      if (!contractSchema) throw new FinanceValidationError('Le contrat Finance n\'est pas chargé')
      return assertTreasuryTransaction(transaction, contractSchema)
    },
  })

  const initialize = async () => {
    if (!initialization) {
      initialization = (async () => {
        contractSchema = assertTreasuryContract(await readJson(contractFile, 'Le contrat Finance'))
        const bootstrap = await readJson(bootstrapFile, 'Le bootstrap Finance')
        await repository.initialize()
        const bootstrapResult = await repository.importBootstrap(bootstrap)
        const snapshot = await repository.readSnapshot()
        return {
          status: 'READY',
          ledgerRevision: snapshot.revision,
          transactionCount: snapshot.transactions.length,
          bootstrap: bootstrapResult,
          paths: repository.paths,
        }
      })().catch((error) => {
        initialization = null
        throw error
      })
    }
    return initialization
  }

  const listTransactions = async ({
    limit = 200,
    offset = 0,
    flow,
    projectId,
    from,
    to,
  } = {}) => {
    await initialize()
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
      throw new FinanceValidationError('limit doit être compris entre 1 et 1000', { path: '$.limit' })
    }
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new FinanceValidationError('offset doit être un entier positif', { path: '$.offset' })
    }
    if (flow !== undefined && !['INFLOW', 'OUTFLOW'].includes(flow)) {
      throw new FinanceValidationError('flow doit valoir INFLOW ou OUTFLOW', { path: '$.flow' })
    }
    const fromDate = validDateFilter(from, 'from')
    const toDate = validDateFilter(to, 'to')
    if (fromDate && toDate && fromDate > toDate) {
      throw new FinanceValidationError('from ne peut pas être après to', { path: '$.from' })
    }

    const snapshot = await repository.readSnapshot()
    const filtered = snapshot.transactions
      .filter((transaction) => flow === undefined || transaction.flow === flow)
      .filter((transaction) => projectId === undefined || transaction.project_id === projectId)
      .filter((transaction) => !fromDate || transaction.effective_date >= fromDate)
      .filter((transaction) => !toDate || transaction.effective_date <= toDate)
      .sort((left, right) => right.effective_date.localeCompare(left.effective_date)
        || right.created_at.localeCompare(left.created_at)
        || right.transaction_id.localeCompare(left.transaction_id))

    return {
      schemaVersion: 1,
      transactions: filtered.slice(offset, offset + limit),
      total: filtered.length,
      limit,
      offset,
      ledgerRevision: snapshot.revision,
    }
  }

  const getDashboard = async ({ range = '12M', asOf, currency = 'EUR' } = {}) => {
    await initialize()
    const snapshot = await repository.readSnapshot()
    return {
      ...projectFinanceDashboard(snapshot.transactions, { range, asOf: asOf ?? calendarDateInTimeZone(now()), currency }),
      ledgerRevision: snapshot.revision,
      updatedAt: snapshot.updated_at,
      timezone: STUDIO_TIME_ZONE,
      bankConnection: {
        status: 'NOT_CONFIGURED',
        provider: null,
        lastSyncAt: null,
      },
    }
  }

  const planManualTransaction = async (draft) => {
    await initialize()
    if (typeof draft?.effectiveDate === 'string' && draft.effectiveDate > calendarDateInTimeZone(now())) {
      throw new FinanceValidationError('Une dépense payée ne peut pas être datée dans le futur', {
        path: '$.effectiveDate',
        code: 'FINANCE_FUTURE_PAID_EXPENSE',
      })
    }
    return createManualTransactionPlan({
      ...(draft && typeof draft === 'object' ? draft : {}),
      flow: 'OUTFLOW',
      kind: 'OPERATING_EXPENSE',
      currency: 'EUR',
      financialStatus: 'PAID',
      settlement: 'PAID',
    }, {
      contractSchema,
      now,
      randomUUID: randomUUIDImpl,
    })
  }

  const applyTransactionPlan = async (confirmation) => {
    await initialize()
    const validated = assertFinancePlan(confirmation || {}, contractSchema)
    return repository.appendPlannedTransaction(validated)
  }

  return Object.freeze({
    initialize,
    listTransactions,
    getDashboard,
    planManualTransaction,
    applyTransactionPlan,
  })
}

export const financeIpcChannels = Object.freeze({
  dashboard: 'finance:get-dashboard',
  listTransactions: 'finance:list-transactions',
  planTransaction: 'finance:plan-transaction',
  applyTransaction: 'finance:apply-transaction',
  changed: 'finance:changed',
})
