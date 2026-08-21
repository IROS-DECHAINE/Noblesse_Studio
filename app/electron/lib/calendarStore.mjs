import { randomUUID as nodeRandomUUID } from 'node:crypto'
import { copyFile, mkdir, open, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  CALENDAR_SCHEMA_VERSION,
  CalendarConflictError,
  CalendarNotFoundError,
  CalendarValidationError,
  DEFAULT_CALENDAR_SETTINGS,
  addCivilDays,
  assertCalendarTimeZone,
  cloneCalendarJson,
  collectDueReminderDeliveries,
  createCalendarItem,
  normalizeCalendarItem,
  parseCivilDate,
  updateCalendarItem,
} from '../../shared/calendarDomain.mjs'

export const CALENDAR_FILE_NAME = 'calendar.v1.json'
export const CALENDAR_INBOX_DIRECTORY = 'calendar-inbox'

const MAX_OPERATION_RECEIPTS = 10_000
const MAX_LEGACY_ITEMS = 50_000

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isoFromClock = (clock) => {
  const value = typeof clock === 'function' ? clock() : clock
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) throw new CalendarValidationError('Horloge calendrier invalide', 'CALENDAR_CLOCK_INVALID')
  return date.toISOString()
}

const createEmptyDocument = (timestamp) => ({
  schemaVersion: CALENDAR_SCHEMA_VERSION,
  revision: 0,
  createdAt: timestamp,
  updatedAt: timestamp,
  items: [],
  settings: cloneCalendarJson(DEFAULT_CALENDAR_SETTINGS),
  deliveries: [],
  migrations: {},
  appliedInboxOperations: [],
})

const normalizeSettings = (settings) => {
  if (!isPlainObject(settings)) throw new CalendarValidationError('Reglages calendrier invalides', 'CALENDAR_SETTINGS_INVALID')
  const allowed = new Set(['timeZone', 'desktopNotificationsEnabled', 'runInBackground', 'emailEnabled'])
  for (const key of Object.keys(settings)) {
    if (!allowed.has(key)) throw new CalendarValidationError(`Reglage calendrier inconnu: ${key}`, 'CALENDAR_SETTINGS_INVALID', { key })
  }
  for (const field of ['desktopNotificationsEnabled', 'runInBackground', 'emailEnabled']) {
    if (settings[field] !== undefined && typeof settings[field] !== 'boolean') {
      throw new CalendarValidationError(`${field} doit etre booleen`, 'CALENDAR_SETTINGS_INVALID', { field })
    }
  }
  return {
    timeZone: assertCalendarTimeZone(settings.timeZone ?? DEFAULT_CALENDAR_SETTINGS.timeZone),
    desktopNotificationsEnabled: settings.desktopNotificationsEnabled ?? DEFAULT_CALENDAR_SETTINGS.desktopNotificationsEnabled,
    runInBackground: settings.runInBackground ?? DEFAULT_CALENDAR_SETTINGS.runInBackground,
    emailEnabled: false,
  }
}

const assertIso = (value, field) => {
  const timestamp = new Date(value)
  if (typeof value !== 'string' || !Number.isFinite(timestamp.getTime())) {
    throw new CalendarValidationError(`${field} invalide`, 'CALENDAR_DOCUMENT_INVALID', { field })
  }
  return timestamp.toISOString()
}

const assertDocument = (document) => {
  if (!isPlainObject(document)
    || document.schemaVersion !== CALENDAR_SCHEMA_VERSION
    || !Number.isSafeInteger(document.revision)
    || document.revision < 0
    || !Array.isArray(document.items)
    || !Array.isArray(document.deliveries)
    || !isPlainObject(document.migrations)
    || !Array.isArray(document.appliedInboxOperations)) {
    throw new CalendarValidationError('Document calendrier incompatible', 'CALENDAR_DOCUMENT_INVALID')
  }
  const createdAt = assertIso(document.createdAt, 'createdAt')
  const updatedAt = assertIso(document.updatedAt, 'updatedAt')
  const items = document.items.map(normalizeCalendarItem)
  const ids = new Set()
  for (const item of items) {
    if (ids.has(item.id)) throw new CalendarValidationError('Identifiant calendrier duplique', 'CALENDAR_DOCUMENT_INVALID', { id: item.id })
    ids.add(item.id)
  }

  const deliveryIds = new Set()
  const deliveries = document.deliveries.map((delivery) => {
    if (!isPlainObject(delivery) || typeof delivery.deliveryId !== 'string' || !delivery.deliveryId) {
      throw new CalendarValidationError('Recu de rappel invalide', 'CALENDAR_DOCUMENT_INVALID')
    }
    if (deliveryIds.has(delivery.deliveryId)) throw new CalendarValidationError('Recu de rappel duplique', 'CALENDAR_DOCUMENT_INVALID')
    deliveryIds.add(delivery.deliveryId)
    return {
      deliveryId: delivery.deliveryId,
      itemId: delivery.itemId ?? null,
      occurrenceId: delivery.occurrenceId ?? null,
      reminderId: delivery.reminderId ?? null,
      scheduledAt: delivery.scheduledAt ? assertIso(delivery.scheduledAt, 'delivery.scheduledAt') : null,
      deliveredAt: assertIso(delivery.deliveredAt, 'delivery.deliveredAt'),
    }
  })

  const operationIds = new Set()
  const appliedInboxOperations = document.appliedInboxOperations.map((receipt) => {
    if (!isPlainObject(receipt) || typeof receipt.operationId !== 'string' || !receipt.operationId || typeof receipt.type !== 'string') {
      throw new CalendarValidationError('Recu inbox invalide', 'CALENDAR_DOCUMENT_INVALID')
    }
    if (operationIds.has(receipt.operationId)) throw new CalendarValidationError('Recu inbox duplique', 'CALENDAR_DOCUMENT_INVALID')
    operationIds.add(receipt.operationId)
    return { operationId: receipt.operationId, type: receipt.type, appliedAt: assertIso(receipt.appliedAt, 'receipt.appliedAt') }
  })

  return {
    schemaVersion: CALENDAR_SCHEMA_VERSION,
    revision: document.revision,
    createdAt,
    updatedAt,
    items,
    settings: normalizeSettings(document.settings),
    deliveries,
    migrations: cloneCalendarJson(document.migrations),
    appliedInboxOperations,
  }
}

const projectForLegacy = (value = '') => {
  const label = String(value || '').trim()
  const normalized = label.toLowerCase()
  if (normalized.includes('primebot')) return { id: 'primebot-rush', label: 'PRIMEBOT RUSH' }
  if (normalized.includes('industry')) return { id: 'prime-industry', label: 'PRIME INDUSTRY' }
  if (normalized.includes('many') || normalized.includes('box')) return { id: 'how-many-boxes-can-you-carry', label: 'HOW MANY BOXES' }
  return { id: 'noblesse-studio', label: label || 'NOBLESSE STUDIO' }
}

const legacyInput = (legacy, timestamp) => {
  if (!isPlainObject(legacy)) throw new CalendarValidationError('Ancien element invalide', 'CALENDAR_LEGACY_INVALID')
  const project = projectForLegacy(legacy.projectLabel ?? legacy.project ?? legacy.projectId)
  let time
  if (isPlainObject(legacy.time)) time = cloneCalendarJson(legacy.time)
  else if (legacy.startsAt ?? legacy.start) {
    time = {
      kind: 'timed',
      start: legacy.startsAt ?? legacy.start,
      end: legacy.endsAt ?? legacy.end,
      timeZone: legacy.timeZone ?? DEFAULT_CALENDAR_SETTINGS.timeZone,
    }
  } else {
    const startDate = legacy.startDate ?? legacy.date
    parseCivilDate(startDate)
    const endDateExclusive = legacy.endDateExclusive
      ?? (legacy.endDate ? addCivilDays(legacy.endDate, 1) : addCivilDays(startDate, 1))
    time = { kind: 'allDay', startDate, endDateExclusive, timeZone: legacy.timeZone ?? DEFAULT_CALENDAR_SETTINGS.timeZone }
  }
  return {
    kind: legacy.kind ?? 'task',
    title: legacy.title,
    projectId: legacy.projectId ?? project.id,
    projectLabel: legacy.projectLabel ?? project.label,
    status: legacy.status ?? (legacy.done ? 'completed' : 'open'),
    notes: legacy.notes ?? '',
    location: legacy.location ?? '',
    time,
    recurrence: legacy.recurrence ?? { frequency: 'none', interval: 1 },
    reminders: legacy.reminders ?? [],
    createdAt: legacy.createdAt ?? timestamp,
  }
}

const mutationResult = (document, extra = {}) => ({ ...extra, snapshot: cloneCalendarJson(document) })

const nextUniqueId = (existingIds, randomUUID) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = String(randomUUID())
    if (id && !existingIds.has(id)) return id
  }
  throw new CalendarConflictError('Le generateur UUID ne produit pas d identifiant unique', 'CALENDAR_ID_GENERATOR_CONFLICT')
}

const applyCreate = (document, input, context) => {
  const id = input?.id ?? nextUniqueId(new Set(document.items.map((item) => item.id)), context.randomUUID)
  if (document.items.some((item) => item.id === id)) throw new CalendarConflictError('Cet identifiant calendrier existe deja', 'CALENDAR_ITEM_CONFLICT')
  const item = createCalendarItem(input, { id, now: context.timestamp })
  document.items.push(item)
  return { item }
}

const applyUpdate = (document, id, patch, context) => {
  if (typeof id !== 'string' || !id) throw new CalendarValidationError('id calendrier requis', 'CALENDAR_FIELD_REQUIRED')
  const index = document.items.findIndex((item) => item.id === id)
  if (index < 0) throw new CalendarNotFoundError(`Element calendrier introuvable: ${id}`)
  const item = updateCalendarItem(document.items[index], patch, { now: context.timestamp })
  document.items[index] = item
  return { item }
}

const applyDelete = (document, id) => {
  if (typeof id !== 'string' || !id) throw new CalendarValidationError('id calendrier requis', 'CALENDAR_FIELD_REQUIRED')
  const index = document.items.findIndex((item) => item.id === id)
  if (index < 0) throw new CalendarNotFoundError(`Element calendrier introuvable: ${id}`)
  const [item] = document.items.splice(index, 1)
  return { item }
}

const applyLegacyImport = (document, legacyItems, context) => {
  if (!Array.isArray(legacyItems)) throw new CalendarValidationError('Import legacy attendu sous forme de liste', 'CALENDAR_LEGACY_INVALID')
  if (legacyItems.length > MAX_LEGACY_ITEMS) throw new CalendarValidationError('Import legacy trop volumineux', 'CALENDAR_LEGACY_INVALID')
  if (document.migrations.planningV1) {
    return { status: 'ALREADY_IMPORTED', importedCount: 0, skippedCount: legacyItems.length }
  }
  const existingIds = new Set(document.items.map((item) => item.id))
  const sourceIds = new Set()
  let importedCount = 0
  let skippedCount = 0
  for (let index = 0; index < legacyItems.length; index += 1) {
    const legacy = legacyItems[index]
    const sourceId = String(legacy?.id ?? `legacy-index-${index}`)
    if (sourceIds.has(sourceId)) { skippedCount += 1; continue }
    sourceIds.add(sourceId)
    try {
      const id = nextUniqueId(existingIds, context.randomUUID)
      const input = legacyInput(legacy, context.timestamp)
      const item = createCalendarItem(input, { id, now: input.createdAt })
      item.updatedAt = context.timestamp
      document.items.push(normalizeCalendarItem(item))
      existingIds.add(id)
      importedCount += 1
    } catch (error) {
      if (!(error instanceof CalendarValidationError)) throw error
      skippedCount += 1
    }
  }
  document.migrations.planningV1 = {
    importedAt: context.timestamp,
    importedCount,
    skippedCount,
    sourceIds: [...sourceIds],
  }
  return { status: 'IMPORTED', importedCount, skippedCount }
}

const applySettings = (document, patch) => {
  if (!isPlainObject(patch)) throw new CalendarValidationError('Patch de reglages invalide', 'CALENDAR_SETTINGS_INVALID')
  document.settings = normalizeSettings({ ...document.settings, ...patch })
  return { settings: cloneCalendarJson(document.settings) }
}

const applyInboxOperation = (document, operation, context) => {
  if (!isPlainObject(operation) || typeof operation.operationId !== 'string' || !operation.operationId.trim()) {
    throw new CalendarValidationError('Operation inbox invalide', 'CALENDAR_INBOX_INVALID')
  }
  const payload = isPlainObject(operation.payload) ? operation.payload : {}
  switch (operation.type) {
    case 'create':
    case 'calendar.create':
      return applyCreate(document, payload.input ?? payload.item ?? payload, context)
    case 'update':
    case 'calendar.update':
      return applyUpdate(document, payload.id ?? operation.id, payload.patch ?? payload.input ?? {}, context)
    case 'delete':
    case 'calendar.delete':
      return applyDelete(document, payload.id ?? operation.id)
    case 'importLegacy':
    case 'import-legacy':
    case 'calendar.importLegacy':
      return applyLegacyImport(document, payload.items ?? payload.legacyItems ?? [], context)
    case 'updateSettings':
    case 'settings':
    case 'calendar.updateSettings':
      return applySettings(document, payload.patch ?? payload.settings ?? payload)
    default:
      throw new CalendarValidationError(`Type d operation inbox inconnu: ${operation.type}`, 'CALENDAR_INBOX_INVALID')
  }
}

export const enqueueCalendarInboxOperation = async ({
  rootDir,
  type,
  payload = {},
  operationId = nodeRandomUUID(),
  now = () => new Date(),
} = {}) => {
  if (typeof rootDir !== 'string' || !rootDir.trim()) throw new CalendarValidationError('rootDir calendrier requis', 'CALENDAR_ROOT_INVALID')
  if (typeof type !== 'string' || !type.trim()) throw new CalendarValidationError('type inbox requis', 'CALENDAR_INBOX_INVALID')
  if (typeof operationId !== 'string' || !operationId.trim()) throw new CalendarValidationError('operationId inbox requis', 'CALENDAR_INBOX_INVALID')
  const timestamp = isoFromClock(now)
  const operation = { schemaVersion: 1, operationId: operationId.trim(), type: type.trim(), payload: cloneCalendarJson(payload), createdAt: timestamp }
  const inboxDirectory = path.join(path.resolve(rootDir), CALENDAR_INBOX_DIRECTORY)
  await mkdir(inboxDirectory, { recursive: true })
  const safeId = operation.operationId.replace(/[^a-zA-Z0-9_.-]/g, '_')
  const baseName = `${timestamp.replace(/[:.]/g, '-')}-${safeId}`
  const temporaryPath = path.join(inboxDirectory, `.${baseName}.${process.pid}.tmp`)
  const filePath = path.join(inboxDirectory, `${baseName}.json`)
  try {
    await writeFile(temporaryPath, `${JSON.stringify(operation, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    await rename(temporaryPath, filePath)
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
  return { status: 'QUEUED', operation: cloneCalendarJson(operation), filePath }
}

export const createCalendarStore = ({
  rootDir,
  now = () => new Date(),
  randomUUID = nodeRandomUUID,
} = {}) => {
  if (typeof rootDir !== 'string' || !rootDir.trim()) throw new CalendarValidationError('rootDir calendrier requis', 'CALENDAR_ROOT_INVALID')
  if (typeof now !== 'function') throw new CalendarValidationError('now doit etre une fonction', 'CALENDAR_CLOCK_INVALID')
  if (typeof randomUUID !== 'function') throw new CalendarValidationError('randomUUID doit etre une fonction', 'CALENDAR_ID_GENERATOR_INVALID')

  const root = path.resolve(rootDir)
  const documentPath = path.join(root, CALENDAR_FILE_NAME)
  const backupPath = path.join(root, `${CALENDAR_FILE_NAME}.backup`)
  const inboxDirectory = path.join(root, CALENDAR_INBOX_DIRECTORY)
  let writer = Promise.resolve()
  let temporaryIndex = 0

  const enqueueWrite = (operation) => {
    const result = writer.then(operation, operation)
    writer = result.catch(() => undefined)
    return result
  }

  const readDocument = async ({ missingAllowed = false } = {}) => {
    try {
      const raw = (await readFile(documentPath, 'utf8')).replace(/^\uFEFF/, '')
      return assertDocument(JSON.parse(raw))
    } catch (error) {
      if (error?.code === 'ENOENT' && missingAllowed) return null
      if (error instanceof SyntaxError) throw new CalendarValidationError('JSON calendrier corrompu', 'CALENDAR_DOCUMENT_CORRUPTED')
      throw error
    }
  }

  const atomicWrite = async (document) => {
    const normalized = assertDocument(document)
    await mkdir(root, { recursive: true })
    const suffix = `${process.pid}.${++temporaryIndex}.${nodeRandomUUID()}`
    const temporaryPath = path.join(root, `.${CALENDAR_FILE_NAME}.${suffix}.tmp`)
    const backupTemporaryPath = path.join(root, `.${CALENDAR_FILE_NAME}.${suffix}.backup.tmp`)
    try {
      await writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
      const handle = await open(temporaryPath, 'r')
      try {
        try { await handle.sync() } catch (error) {
          if (!['EPERM', 'EINVAL', 'ENOTSUP'].includes(error?.code)) throw error
        }
      } finally {
        await handle.close()
      }
      try {
        await copyFile(documentPath, backupTemporaryPath)
        await rename(backupTemporaryPath, backupPath)
      } catch (error) {
        await unlink(backupTemporaryPath).catch(() => undefined)
        if (error?.code !== 'ENOENT') throw error
      }
      await rename(temporaryPath, documentPath)
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined)
      await unlink(backupTemporaryPath).catch(() => undefined)
      throw error
    }
    return normalized
  }

  const ensureDocument = async () => {
    let document = await readDocument({ missingAllowed: true })
    if (!document) {
      document = createEmptyDocument(isoFromClock(now))
      await atomicWrite(document)
    }
    return document
  }

  const commit = async (document, timestamp) => {
    document.revision += 1
    document.updatedAt = timestamp
    return atomicWrite(document)
  }

  const init = () => enqueueWrite(async () => {
    const existed = Boolean(await readDocument({ missingAllowed: true }))
    const document = await ensureDocument()
    await mkdir(inboxDirectory, { recursive: true })
    return { status: existed ? 'READY' : 'CREATED', revision: document.revision, snapshot: cloneCalendarJson(document) }
  })

  const getSnapshot = () => enqueueWrite(async () => cloneCalendarJson(await ensureDocument()))

  const mutate = (operation) => enqueueWrite(async () => {
    const document = await ensureDocument()
    const timestamp = isoFromClock(now)
    const extra = operation(document, { timestamp, randomUUID })
    const committed = await commit(document, timestamp)
    return mutationResult(committed, extra)
  })

  const createItem = (input) => mutate((document, context) => applyCreate(document, input, context))
  const updateItem = (id, patch) => mutate((document, context) => applyUpdate(document, id, patch, context))
  const deleteItem = (id) => mutate((document) => applyDelete(document, id))
  const importLegacy = (legacyItems) => enqueueWrite(async () => {
    const document = await ensureDocument()
    const timestamp = isoFromClock(now)
    const extra = applyLegacyImport(document, legacyItems, { timestamp, randomUUID })
    if (extra.status === 'ALREADY_IMPORTED') return mutationResult(document, extra)
    const committed = await commit(document, timestamp)
    return mutationResult(committed, extra)
  })
  const updateSettings = (patch) => mutate((document) => applySettings(document, patch))

  const collectDueReminders = (options = {}) => enqueueWrite(async () => {
    const document = await ensureDocument()
    const normalized = isPlainObject(options) ? options : { now: options }
    const toMs = new Date(normalized.to ?? normalized.now ?? isoFromClock(now)).getTime()
    if (!Number.isFinite(toMs)) throw new CalendarValidationError('Fin de fenetre de rappel invalide', 'CALENDAR_RANGE_INVALID')
    const lookbackMinutes = normalized.lookbackMinutes ?? 5
    if (!Number.isFinite(lookbackMinutes) || lookbackMinutes < 0) throw new CalendarValidationError('Lookback de rappel invalide', 'CALENDAR_RANGE_INVALID')
    const fromValue = normalized.from ?? new Date(toMs - (lookbackMinutes * 60_000))
    return collectDueReminderDeliveries(document.items, {
      from: fromValue,
      to: new Date(toMs),
      deliveredIds: document.deliveries.map((delivery) => delivery.deliveryId),
    })
  })

  const markDelivery = (deliveryOrId) => enqueueWrite(async () => {
    const document = await ensureDocument()
    const delivery = typeof deliveryOrId === 'string' ? { deliveryId: deliveryOrId } : deliveryOrId
    if (!isPlainObject(delivery) || typeof delivery.deliveryId !== 'string' || !delivery.deliveryId) {
      throw new CalendarValidationError('Livraison de rappel invalide', 'CALENDAR_DELIVERY_INVALID')
    }
    const existing = document.deliveries.find((entry) => entry.deliveryId === delivery.deliveryId)
    if (existing) return mutationResult(document, { status: 'ALREADY_DELIVERED', delivery: cloneCalendarJson(existing) })
    const timestamp = isoFromClock(now)
    const receipt = {
      deliveryId: delivery.deliveryId,
      itemId: delivery.itemId ?? null,
      occurrenceId: delivery.occurrenceId ?? null,
      reminderId: delivery.reminderId ?? null,
      scheduledAt: delivery.scheduledAt ? new Date(delivery.scheduledAt).toISOString() : null,
      deliveredAt: timestamp,
    }
    document.deliveries.push(receipt)
    const committed = await commit(document, timestamp)
    return mutationResult(committed, { status: 'DELIVERED', delivery: cloneCalendarJson(receipt) })
  })

  const drainInbox = () => enqueueWrite(async () => {
    let document = await ensureDocument()
    await mkdir(inboxDirectory, { recursive: true })
    const fileNames = (await readdir(inboxDirectory)).filter((name) => name.endsWith('.json')).sort()
    const processed = []
    const skipped = []
    const failed = []

    for (const fileName of fileNames) {
      const filePath = path.join(inboxDirectory, fileName)
      let operation
      try {
        operation = JSON.parse((await readFile(filePath, 'utf8')).replace(/^\uFEFF/, ''))
        if (!isPlainObject(operation) || operation.schemaVersion !== 1 || typeof operation.operationId !== 'string') {
          throw new CalendarValidationError('Operation inbox incompatible', 'CALENDAR_INBOX_INVALID')
        }
        if (document.appliedInboxOperations.some((receipt) => receipt.operationId === operation.operationId)) {
          skipped.push(operation.operationId)
          await unlink(filePath)
          continue
        }
        const timestamp = isoFromClock(now)
        const candidate = cloneCalendarJson(document)
        const result = applyInboxOperation(candidate, operation, { timestamp, randomUUID })
        candidate.appliedInboxOperations.push({ operationId: operation.operationId, type: operation.type, appliedAt: timestamp })
        if (candidate.appliedInboxOperations.length > MAX_OPERATION_RECEIPTS) {
          candidate.appliedInboxOperations.splice(0, candidate.appliedInboxOperations.length - MAX_OPERATION_RECEIPTS)
        }
        document = await commit(candidate, timestamp)
        processed.push({ operationId: operation.operationId, type: operation.type, result: cloneCalendarJson(result) })
        await unlink(filePath)
      } catch (error) {
        failed.push({
          fileName,
          operationId: operation?.operationId ?? null,
          code: error?.code ?? 'CALENDAR_INBOX_ERROR',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return { processed, skipped, failed, snapshot: cloneCalendarJson(document) }
  })

  return Object.freeze({
    init,
    getSnapshot,
    createItem,
    updateItem,
    deleteItem,
    importLegacy,
    updateSettings,
    collectDueReminders,
    markDelivery,
    drainInbox,
    paths: Object.freeze({ rootDir: root, documentPath, backupPath, inboxDirectory }),
  })
}
