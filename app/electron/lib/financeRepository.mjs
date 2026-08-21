import { constants as fsConstants } from 'node:fs'
import { copyFile, mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import {
  FINANCE_LEDGER_SCHEMA_VERSION,
  FinanceConflictError,
  FinanceValidationError,
  stableStringify,
} from './financeDomain.mjs'

const DEFAULT_LEDGER_FILE = 'treasury-ledger.v1.json'
const repositoryWriters = new Map()

const isoFromClock = (clock) => {
  const value = clock()
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) throw new FinanceValidationError('Horloge du registre Finance invalide')
  return date.toISOString()
}

const createEmptyLedger = (timestamp) => ({
  schema_version: FINANCE_LEDGER_SCHEMA_VERSION,
  ledger_id: 'noblesse-studio-treasury',
  revision: 1,
  created_at: timestamp,
  updated_at: timestamp,
  bootstrap_imports: [],
  applied_operations: [],
  transactions: [],
})

const cloneJson = (value) => JSON.parse(JSON.stringify(value))

const assertLedger = (ledger, validateTransaction) => {
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) {
    throw new FinanceValidationError('Le registre Finance est illisible', { code: 'FINANCE_LEDGER_INVALID' })
  }
  if (ledger.schema_version !== FINANCE_LEDGER_SCHEMA_VERSION
    || ledger.ledger_id !== 'noblesse-studio-treasury'
    || !Number.isSafeInteger(ledger.revision)
    || ledger.revision < 1
    || !Array.isArray(ledger.bootstrap_imports)
    || !Array.isArray(ledger.applied_operations)
    || !Array.isArray(ledger.transactions)) {
    throw new FinanceValidationError('Version ou structure du registre Finance incompatible', {
      code: 'FINANCE_LEDGER_INVALID',
    })
  }

  const transactionIds = new Set()
  for (const transaction of ledger.transactions) {
    validateTransaction(transaction)
    if (transactionIds.has(transaction.transaction_id)) {
      throw new FinanceValidationError('Identifiant de transaction dupliqué dans le registre', {
        code: 'FINANCE_LEDGER_INVALID',
      })
    }
    transactionIds.add(transaction.transaction_id)
  }

  const operationKeys = new Set()
  for (const operation of ledger.applied_operations) {
    if (!operation || typeof operation.idempotency_key !== 'string'
      || typeof operation.plan_hash !== 'string'
      || typeof operation.transaction_id !== 'string') {
      throw new FinanceValidationError('Reçu d\'opération Finance invalide', { code: 'FINANCE_LEDGER_INVALID' })
    }
    if (operationKeys.has(operation.idempotency_key)) {
      throw new FinanceValidationError('Clé d\'idempotence dupliquée dans le registre', {
        code: 'FINANCE_LEDGER_INVALID',
      })
    }
    if (!transactionIds.has(operation.transaction_id)) {
      throw new FinanceValidationError('Une opération Finance référence une transaction absente', {
        code: 'FINANCE_LEDGER_INVALID',
      })
    }
    operationKeys.add(operation.idempotency_key)
  }
  return ledger
}

const assertBootstrap = (bootstrap, validateTransaction) => {
  if (!bootstrap || bootstrap.schema_version !== 1
    || typeof bootstrap.bootstrap_id !== 'string'
    || !/^sha256:[a-f0-9]{64}$/.test(bootstrap.source_hash || '')
    || !Array.isArray(bootstrap.entries)) {
    throw new FinanceValidationError('Bootstrap Finance invalide', { code: 'FINANCE_BOOTSTRAP_INVALID' })
  }
  for (const entry of bootstrap.entries) validateTransaction(entry)
  return bootstrap
}

export const createFinanceRepository = ({
  dataDirectory,
  validateTransaction,
  now = () => new Date(),
  ledgerFileName = DEFAULT_LEDGER_FILE,
} = {}) => {
  if (typeof dataDirectory !== 'string' || !dataDirectory.trim()) {
    throw new FinanceValidationError('dataDirectory Finance est requis')
  }
  if (typeof validateTransaction !== 'function') {
    throw new FinanceValidationError('Le validateur du contrat Finance est requis')
  }
  if (path.basename(ledgerFileName) !== ledgerFileName || !ledgerFileName.endsWith('.json')) {
    throw new FinanceValidationError('Nom de registre Finance invalide')
  }

  const root = path.resolve(dataDirectory)
  const ledgerPath = path.join(root, ledgerFileName)
  const backupDirectory = path.join(root, 'backups')

  const enqueueWrite = (operation) => {
    const previous = repositoryWriters.get(ledgerPath) || Promise.resolve()
    const result = previous.then(operation, operation)
    const settled = result.catch(() => undefined)
    repositoryWriters.set(ledgerPath, settled)
    void settled.then(() => {
      if (repositoryWriters.get(ledgerPath) === settled) repositoryWriters.delete(ledgerPath)
    })
    return result
  }

  const readLedgerFile = async ({ missingAllowed = false } = {}) => {
    try {
      const raw = (await readFile(ledgerPath, 'utf8')).replace(/^\uFEFF/, '')
      return assertLedger(JSON.parse(raw), validateTransaction)
    } catch (error) {
      if (error?.code === 'ENOENT' && missingAllowed) return null
      if (error instanceof SyntaxError) {
        throw new FinanceValidationError('Le registre Finance JSON est corrompu; consultez les backups', {
          code: 'FINANCE_LEDGER_CORRUPTED',
        })
      }
      throw error
    }
  }

  const atomicWrite = async (ledger, { backupCurrent = false } = {}) => {
    assertLedger(ledger, validateTransaction)
    await mkdir(root, { recursive: true })

    if (backupCurrent) {
      await mkdir(backupDirectory, { recursive: true })
      const current = await readLedgerFile()
      const stamp = current.updated_at.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
      const backupName = `${path.basename(ledgerFileName, '.json')}.rev-${String(current.revision).padStart(8, '0')}.${stamp}.${randomUUID()}.json`
      await copyFile(ledgerPath, path.join(backupDirectory, backupName), fsConstants.COPYFILE_EXCL)
    }

    const tempPath = path.join(root, `.${ledgerFileName}.${process.pid}.${randomUUID()}.tmp`)
    const payload = `${JSON.stringify(ledger, null, 2)}\n`
    try {
      await writeFile(tempPath, payload, { encoding: 'utf8', flag: 'wx' })
      const handle = await open(tempPath, 'r')
      try {
        try {
          await handle.sync()
        } catch (error) {
          // Some Windows/sandbox filesystems reject fsync even though the file
          // is fully written. Rename-in-place remains the atomic commit point.
          if (!['EPERM', 'EINVAL', 'ENOTSUP'].includes(error?.code)) throw error
        }
      } finally {
        await handle.close()
      }
      await rename(tempPath, ledgerPath)
    } catch (error) {
      // A failed temporary write never mutates the last committed ledger.
      await unlink(tempPath).catch(() => undefined)
      throw error
    }
  }

  const initialize = () => enqueueWrite(async () => {
    let ledger = await readLedgerFile({ missingAllowed: true })
    if (!ledger) {
      ledger = createEmptyLedger(isoFromClock(now))
      await atomicWrite(ledger)
    }
    return {
      ledgerRevision: ledger.revision,
      ledgerPath,
      transactionCount: ledger.transactions.length,
    }
  })

  const importBootstrap = (bootstrapPayload) => enqueueWrite(async () => {
    const bootstrap = assertBootstrap(bootstrapPayload, validateTransaction)
    let ledger = await readLedgerFile({ missingAllowed: true })
    if (!ledger) ledger = createEmptyLedger(isoFromClock(now))

    const receipt = ledger.bootstrap_imports.find((item) => item.bootstrap_id === bootstrap.bootstrap_id)
    if (receipt) {
      if (receipt.source_hash !== bootstrap.source_hash) {
        throw new FinanceConflictError('Le bootstrap Finance existe déjà avec un autre hash', 'FINANCE_BOOTSTRAP_CONFLICT')
      }
      return {
        status: 'ALREADY_IMPORTED',
        bootstrapId: bootstrap.bootstrap_id,
        importedCount: 0,
        ledgerRevision: ledger.revision,
      }
    }

    const next = cloneJson(ledger)
    let importedCount = 0
    for (const entry of bootstrap.entries) {
      const existing = next.transactions.find((transaction) => transaction.transaction_id === entry.transaction_id)
      if (existing) {
        if (stableStringify(existing) !== stableStringify(entry)) {
          throw new FinanceConflictError('Une transaction bootstrap existe avec un contenu différent', 'FINANCE_TRANSACTION_CONFLICT')
        }
        continue
      }
      next.transactions.push(cloneJson(entry))
      importedCount += 1
    }

    const timestamp = isoFromClock(now)
    next.bootstrap_imports.push({
      bootstrap_id: bootstrap.bootstrap_id,
      source_hash: bootstrap.source_hash,
      source_reference: bootstrap.source_reference ?? null,
      imported_at: timestamp,
      entry_count: bootstrap.entries.length,
    })
    next.revision += 1
    next.updated_at = timestamp
    await atomicWrite(next, { backupCurrent: Boolean(await readLedgerFile({ missingAllowed: true })) })
    return {
      status: 'IMPORTED',
      bootstrapId: bootstrap.bootstrap_id,
      importedCount,
      ledgerRevision: next.revision,
    }
  })

  const appendPlannedTransaction = ({ plan, planHash, idempotencyKey }) => enqueueWrite(async () => {
    const ledger = await readLedgerFile()
    const previous = ledger.applied_operations.find((item) => item.idempotency_key === idempotencyKey)
    if (previous) {
      if (previous.plan_hash !== planHash) {
        throw new FinanceConflictError('Cette clé d\'idempotence a déjà servi pour un autre plan', 'FINANCE_IDEMPOTENCY_CONFLICT')
      }
      const transaction = ledger.transactions.find((item) => item.transaction_id === previous.transaction_id)
      return {
        status: 'ALREADY_APPLIED',
        transaction: cloneJson(transaction),
        ledgerRevision: ledger.revision,
      }
    }

    validateTransaction(plan.transaction)
    if (ledger.transactions.some((item) => item.transaction_id === plan.transaction.transaction_id)) {
      throw new FinanceConflictError('Cette transaction existe déjà sans le même reçu d\'opération', 'FINANCE_TRANSACTION_CONFLICT')
    }

    const next = cloneJson(ledger)
    const timestamp = isoFromClock(now)
    next.transactions.push(cloneJson(plan.transaction))
    next.applied_operations.push({
      idempotency_key: idempotencyKey,
      plan_hash: planHash,
      transaction_id: plan.transaction.transaction_id,
      applied_at: timestamp,
    })
    next.revision += 1
    next.updated_at = timestamp
    await atomicWrite(next, { backupCurrent: true })
    return {
      status: 'APPLIED',
      transaction: cloneJson(plan.transaction),
      ledgerRevision: next.revision,
    }
  })

  const readSnapshot = async () => {
    await repositoryWriters.get(ledgerPath)
    return cloneJson(await readLedgerFile())
  }

  return Object.freeze({
    initialize,
    importBootstrap,
    appendPlannedTransaction,
    readSnapshot,
    paths: Object.freeze({ ledgerPath, backupDirectory }),
  })
}
