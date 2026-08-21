import { createHash } from 'node:crypto'

export const FINANCE_SCHEMA_VERSION = 1
export const FINANCE_LEDGER_SCHEMA_VERSION = 1
export const DASHBOARD_RANGES = Object.freeze(['3M', '6M', '12M', 'ALL'])

export class FinanceValidationError extends Error {
  constructor(message, { code = 'FINANCE_VALIDATION_ERROR', path = null } = {}) {
    super(message)
    this.name = 'FinanceValidationError'
    this.code = code
    this.path = path
  }
}

export class FinanceConflictError extends Error {
  constructor(message, code = 'FINANCE_CONFLICT') {
    super(message)
    this.name = 'FinanceConflictError'
    this.code = code
  }
}

const fail = (message, path = null, code = 'FINANCE_VALIDATION_ERROR') => {
  throw new FinanceValidationError(message, { code, path })
}

const isPlainObject = (value) => value !== null
  && typeof value === 'object'
  && !Array.isArray(value)

const isCalendarDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [, year, month, day] = match.map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

const isDateTime = (value) => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && Number.isFinite(Date.parse(value))

const matchesType = (value, type) => {
  if (type === 'object') return isPlainObject(value)
  if (type === 'string') return typeof value === 'string'
  if (type === 'integer') return Number.isSafeInteger(value)
  if (type === 'null') return value === null
  return true
}

// Small, deliberately bounded JSON Schema 2020-12 validator for the keywords
// used by the checked-in TreasuryTransactionV1 contract.
export const assertJsonSchemaSubset = (value, schema, path = '$') => {
  if (Array.isArray(schema?.oneOf)) {
    const matches = schema.oneOf.filter((candidate) => {
      try {
        assertJsonSchemaSubset(value, candidate, path)
        return true
      } catch {
        return false
      }
    })
    if (matches.length !== 1) fail(`${path} ne respecte pas exactement une variante du contrat`, path)
    return value
  }

  if (Object.hasOwn(schema || {}, 'const') && value !== schema.const) {
    fail(`${path} doit valoir ${JSON.stringify(schema.const)}`, path)
  }
  if (Array.isArray(schema?.enum) && !schema.enum.includes(value)) {
    fail(`${path} contient une valeur non autorisée`, path)
  }
  if (schema?.type && !matchesType(value, schema.type)) {
    fail(`${path} n'a pas le type attendu (${schema.type})`, path)
  }

  if (schema?.type === 'object') {
    for (const required of schema.required || []) {
      if (!Object.hasOwn(value, required)) fail(`${path}.${required} est requis`, `${path}.${required}`)
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties || {}))
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) fail(`${path}.${key} n'est pas autorisé`, `${path}.${key}`)
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (Object.hasOwn(value, key)) assertJsonSchemaSubset(value[key], childSchema, `${path}.${key}`)
    }
  }

  if (schema?.type === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) fail(`${path} est trop court`, path)
    if (schema.maxLength !== undefined && value.length > schema.maxLength) fail(`${path} est trop long`, path)
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) fail(`${path} a un format invalide`, path)
    if (schema.format === 'date' && !isCalendarDate(value)) fail(`${path} doit être une date YYYY-MM-DD valide`, path)
    if (schema.format === 'date-time' && !isDateTime(value)) fail(`${path} doit être un instant ISO 8601 valide`, path)
  }

  if (schema?.type === 'integer') {
    if (schema.minimum !== undefined && value < schema.minimum) fail(`${path} est sous le minimum`, path)
    if (schema.maximum !== undefined && value > schema.maximum) fail(`${path} dépasse le maximum`, path)
  }

  return value
}

export const assertTreasuryContract = (schema) => {
  if (!isPlainObject(schema)
    || schema?.properties?.schema_version?.const !== FINANCE_SCHEMA_VERSION
    || !Array.isArray(schema?.required)
    || !schema.required.includes('transaction_id')) {
    fail('Le contrat TreasuryTransactionV1 est absent ou incompatible', '$schema', 'FINANCE_CONTRACT_UNSUPPORTED')
  }
  return schema
}

export const assertTreasuryTransaction = (transaction, contractSchema) => {
  assertTreasuryContract(contractSchema)
  assertJsonSchemaSubset(transaction, contractSchema)
  if (transaction.currency !== 'EUR') fail('La V1 Finance accepte uniquement EUR', '$.currency', 'FINANCE_CURRENCY_UNSUPPORTED')
  if (transaction.source.type === 'MANUAL' && transaction.verification !== 'DECLARED') {
    fail('Une saisie manuelle reste DECLARED jusqu\'au rapprochement avec une source', '$.verification')
  }
  if (transaction.kind === 'REVENUE' && transaction.flow !== 'INFLOW') {
    fail('Une recette doit être un flux entrant', '$.flow')
  }
  if (['OPERATING_EXPENSE', 'FEE', 'TAX'].includes(transaction.kind) && transaction.flow !== 'OUTFLOW') {
    fail('Cette nature de dépense doit être un flux sortant', '$.flow')
  }
  return transaction
}

export const stableStringify = (value) => {
  const visit = (input) => {
    if (Array.isArray(input)) return input.map(visit)
    if (isPlainObject(input)) {
      return Object.fromEntries(Object.keys(input).sort().map((key) => [key, visit(input[key])]))
    }
    if (input === undefined || (typeof input === 'number' && !Number.isFinite(input))) {
      fail('Une valeur non sérialisable a été fournie')
    }
    return input
  }
  return JSON.stringify(visit(value))
}

export const sha256Prefixed = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`

export const hashFinancePlan = (plan) => sha256Prefixed(stableStringify(plan))

export const parseEurAmountToMinor = (input) => {
  if (typeof input !== 'string') fail('Le montant doit être saisi comme texte en format français', '$.amount')
  const value = input.trim()
  if (!value || value.length > 64 || value.includes('.')) {
    fail('Utilisez une virgule pour les centimes, par exemple 123,45', '$.amount')
  }

  const match = /^(?:(?:0|[1-9]\d*)|(?:[1-9]\d{0,2}(?:[ \u00a0\u202f]\d{3})+))(?:,(\d{1,2}))?$/.exec(value)
  if (!match) fail('Montant EUR invalide (exemple attendu : 1 234,56)', '$.amount')

  const [wholePart, decimalPart = ''] = value.split(',')
  const wholeDigits = wholePart.replace(/[ \u00a0\u202f]/g, '')
  const minor = (BigInt(wholeDigits) * 100n) + BigInt(decimalPart.padEnd(2, '0') || '0')
  if (minor < 1n) fail('Le montant doit être supérieur à zéro', '$.amount')
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) fail('Le montant dépasse la limite sûre', '$.amount')
  return Number(minor)
}

const requiredText = (value, field, { min = 1, max = 120 } = {}) => {
  if (typeof value !== 'string') fail(`${field} est requis`, `$.${field}`)
  const result = value.trim()
  if (result.length < min || result.length > max) fail(`${field} a une longueur invalide`, `$.${field}`)
  return result
}

const nullableText = (value, field, max) => {
  if (value === undefined || value === null || value === '') return null
  return requiredText(value, field, { min: 1, max })
}

const clockIso = (clock) => {
  const value = typeof clock === 'function' ? clock() : clock
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) fail('Horloge Finance invalide')
  return date.toISOString()
}

const safeToken = (randomUUID) => {
  const raw = String(randomUUID()).toLowerCase().replace(/[^a-z0-9]/g, '')
  return (raw.length >= 8 ? raw : createHash('sha256').update(raw).digest('hex')).slice(0, 64)
}

export const createManualTransactionPlan = (draft, {
  contractSchema,
  now = () => new Date(),
  randomUUID,
} = {}) => {
  if (!isPlainObject(draft)) fail('La saisie Finance doit être un objet')
  if (typeof randomUUID !== 'function') fail('Le générateur d\'identifiants Finance est absent')

  const timestamp = clockIso(now)
  const token = safeToken(randomUUID)
  const idempotencyKey = `finop_${token}`
  const flow = draft.flow ?? 'OUTFLOW'
  const kind = draft.kind ?? (flow === 'INFLOW' ? 'REVENUE' : 'OPERATING_EXPENSE')
  const amountMinor = parseEurAmountToMinor(draft.amount)
  const effectiveDate = requiredText(draft.effectiveDate, 'effectiveDate', { min: 10, max: 10 })
  if (!isCalendarDate(effectiveDate)) fail('effectiveDate doit être une date YYYY-MM-DD valide', '$.effectiveDate')

  const normalisedFacts = {
    flow,
    kind,
    amount_minor: amountMinor,
    currency: draft.currency ?? 'EUR',
    effective_date: effectiveDate,
    project_id: nullableText(draft.projectId, 'projectId', 64),
    category_id: requiredText(draft.categoryId ?? 'uncategorized', 'categoryId', { min: 1, max: 64 }),
    label: requiredText(draft.label, 'label', { min: 2, max: 120 }),
    counterparty: nullableText(draft.counterparty, 'counterparty', 120),
    notes: nullableText(draft.notes, 'notes', 1000),
    financial_status: draft.financialStatus ?? 'PAID',
    settlement: draft.settlement ?? 'PAID',
  }

  const transaction = {
    schema_version: FINANCE_SCHEMA_VERSION,
    transaction_id: `txn_${token}`,
    revision: 1,
    flow: normalisedFacts.flow,
    kind: normalisedFacts.kind,
    amount_minor: normalisedFacts.amount_minor,
    currency: normalisedFacts.currency,
    effective_date: normalisedFacts.effective_date,
    project_id: normalisedFacts.project_id,
    category_id: normalisedFacts.category_id,
    label: normalisedFacts.label,
    counterparty: normalisedFacts.counterparty,
    notes: normalisedFacts.notes,
    lifecycle: 'POSTED',
    financial_status: normalisedFacts.financial_status,
    settlement: normalisedFacts.settlement,
    verification: 'DECLARED',
    source: {
      type: 'MANUAL',
      provider_id: 'noblesse-studio-app',
      external_id: idempotencyKey,
      source_reference: `manual-entry:${idempotencyKey}`,
      observed_at: timestamp,
      raw_hash: sha256Prefixed(stableStringify(normalisedFacts)),
    },
    created_at: timestamp,
    updated_at: timestamp,
  }
  assertTreasuryTransaction(transaction, contractSchema)

  const plan = {
    schemaVersion: 1,
    operation: 'ADD_TRANSACTION',
    idempotencyKey,
    plannedAt: timestamp,
    transaction,
  }
  return { plan, planHash: hashFinancePlan(plan), idempotencyKey }
}

export const assertFinancePlan = ({ plan, planHash, idempotencyKey }, contractSchema) => {
  if (!isPlainObject(plan) || plan.schemaVersion !== 1 || plan.operation !== 'ADD_TRANSACTION') {
    fail('Plan Finance incompatible', '$.plan', 'FINANCE_PLAN_UNSUPPORTED')
  }
  if (!/^finop_[a-z0-9][a-z0-9_-]{7,95}$/.test(idempotencyKey || '')) {
    fail('Clé d\'idempotence Finance invalide', '$.idempotencyKey')
  }
  if (plan.idempotencyKey !== idempotencyKey) {
    fail('La clé d\'idempotence ne correspond pas au plan', '$.idempotencyKey', 'FINANCE_PLAN_TAMPERED')
  }
  const expectedHash = hashFinancePlan(plan)
  if (planHash !== expectedHash) {
    fail('Le plan Finance a changé depuis sa confirmation', '$.planHash', 'FINANCE_PLAN_TAMPERED')
  }
  assertTreasuryTransaction(plan.transaction, contractSchema)
  if (plan.transaction.source.type !== 'MANUAL'
    || plan.transaction.verification !== 'DECLARED'
    || plan.transaction.source.external_id !== idempotencyKey) {
    fail('La provenance manuelle du plan ne correspond pas à son reçu', '$.plan.transaction.source', 'FINANCE_PLAN_TAMPERED')
  }
  return { plan, planHash, idempotencyKey }
}

const dateString = (date) => date.toISOString().slice(0, 10)
const startOfUtcMonth = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
const addUtcMonths = (date, count) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1))
const startOfUtcYear = (date) => new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
const addUtcYears = (date, count) => new Date(Date.UTC(date.getUTCFullYear() + count, 0, 1))

const sumTransactions = (transactions) => transactions.reduce((total, transaction) => {
  if (transaction.flow === 'INFLOW') total.revenueMinor += transaction.amount_minor
  if (transaction.flow === 'OUTFLOW') total.expenseMinor += transaction.amount_minor
  total.transactionCount += 1
  total.netMinor = total.revenueMinor - total.expenseMinor
  return total
}, { revenueMinor: 0, expenseMinor: 0, netMinor: 0, transactionCount: 0 })

export const projectFinanceDashboard = (transactions, { range = '12M', asOf = new Date(), currency = 'EUR' } = {}) => {
  if (!DASHBOARD_RANGES.includes(range)) fail('Période Finance invalide', '$.range')
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) fail('Devise de projection invalide', '$.currency')
  const asOfDate = asOf instanceof Date ? new Date(asOf) : new Date(`${asOf}T23:59:59.999Z`)
  if (!Number.isFinite(asOfDate.getTime())) fail('Date de projection invalide', '$.asOf')
  const asOfDay = dateString(asOfDate)
  const active = transactions.filter((transaction) => transaction.lifecycle === 'POSTED'
    && transaction.financial_status !== 'REVERSED'
    && transaction.financial_status !== 'ESTIMATED'
    && transaction.kind !== 'TRANSFER'
    && transaction.currency === currency
    && transaction.effective_date <= asOfDay)

  const fixedMonths = range === 'ALL' ? null : Number.parseInt(range, 10)
  const earliest = active.reduce((minimum, transaction) => (
    !minimum || transaction.effective_date < minimum ? transaction.effective_date : minimum
  ), null)
  const allStart = earliest ? new Date(`${earliest}T00:00:00.000Z`) : startOfUtcMonth(asOfDate)
  const monthsCovered = ((asOfDate.getUTCFullYear() - allStart.getUTCFullYear()) * 12)
    + asOfDate.getUTCMonth() - allStart.getUTCMonth() + 1
  const bucketGranularity = range === 'ALL' && monthsCovered > 36 ? 'YEAR' : 'MONTH'
  const rangeStartDate = fixedMonths
    ? addUtcMonths(startOfUtcMonth(asOfDate), -(fixedMonths - 1))
    : (bucketGranularity === 'YEAR' ? startOfUtcYear(allStart) : startOfUtcMonth(allStart))
  const rangeStart = dateString(rangeStartDate)
  const inRange = active.filter((transaction) => transaction.effective_date >= rangeStart)
  const bars = []
  const formatter = new Intl.DateTimeFormat('fr-FR', bucketGranularity === 'YEAR'
    ? { year: 'numeric', timeZone: 'UTC' }
    : { month: 'short', year: '2-digit', timeZone: 'UTC' })

  for (let cursor = new Date(rangeStartDate); cursor <= asOfDate; cursor = bucketGranularity === 'YEAR'
    ? addUtcYears(cursor, 1)
    : addUtcMonths(cursor, 1)) {
    const next = bucketGranularity === 'YEAR' ? addUtcYears(cursor, 1) : addUtcMonths(cursor, 1)
    const end = new Date(Math.min(next.getTime() - 1, asOfDate.getTime()))
    const startDate = dateString(cursor)
    const endDate = dateString(end)
    const bucketTransactions = inRange.filter((transaction) => (
      transaction.effective_date >= startDate && transaction.effective_date <= endDate
    ))
    bars.push({
      key: bucketGranularity === 'YEAR' ? String(cursor.getUTCFullYear()) : startDate.slice(0, 7),
      label: formatter.format(cursor),
      startDate,
      endDate,
      ...sumTransactions(bucketTransactions),
      status: bucketTransactions.length ? 'ACTUAL' : 'EMPTY',
      completeness: 'REGISTERED_ONLY',
      sourceTypes: [...new Set(bucketTransactions.map((transaction) => transaction.source?.type).filter(Boolean))].sort(),
    })
  }

  const totals = sumTransactions(inRange)
  totals.lifetimeBalanceMinor = sumTransactions(active).netMinor
  totals.sourceTypes = [...new Set(inRange.map((transaction) => transaction.source?.type).filter(Boolean))].sort()
  const recentTransactions = [...inRange]
    .sort((left, right) => right.effective_date.localeCompare(left.effective_date)
      || right.created_at.localeCompare(left.created_at)
      || right.transaction_id.localeCompare(left.transaction_id))
    .slice(0, 12)

  return {
    schemaVersion: 1,
    range,
    currency,
    asOf: asOfDay,
    rangeStart,
    rangeEnd: asOfDay,
    bucketGranularity,
    totals,
    bars,
    recentTransactions,
    dataPolicy: {
      revenue: 'REGISTERED_TRANSACTIONS_ONLY',
      expenses: 'REGISTERED_TRANSACTIONS_ONLY',
      records: 'APPEND_ONLY',
      completeness: 'PARTIAL',
      currencyAggregation: 'SINGLE_NATIVE_CURRENCY',
      excluded: ['ESTIMATED', 'REVERSED', 'TRANSFER'],
    },
  }
}
