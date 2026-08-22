export const CALENDAR_SCHEMA_VERSION = 1
export const DEFAULT_CALENDAR_TIME_ZONE = 'Europe/Paris'

export const DEFAULT_CALENDAR_SETTINGS = Object.freeze({
  timeZone: DEFAULT_CALENDAR_TIME_ZONE,
  desktopNotificationsEnabled: false,
  runInBackground: true,
  emailEnabled: false,
})

export const CALENDAR_KINDS = Object.freeze(['event', 'task', 'deadline', 'focus', 'milestone'])
export const CALENDAR_STATUSES = Object.freeze(['open', 'completed', 'cancelled'])
export const CALENDAR_RECURRENCE_FREQUENCIES = Object.freeze(['none', 'daily', 'weekly', 'monthly', 'yearly'])

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const MAX_OCCURRENCES = 100_000

export class CalendarValidationError extends Error {
  constructor(message, code = 'CALENDAR_VALIDATION_ERROR', details = undefined) {
    super(message)
    this.name = 'CalendarValidationError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

export class CalendarNotFoundError extends Error {
  constructor(message, code = 'CALENDAR_NOT_FOUND') {
    super(message)
    this.name = 'CalendarNotFoundError'
    this.code = code
  }
}

export class CalendarConflictError extends Error {
  constructor(message, code = 'CALENDAR_CONFLICT') {
    super(message)
    this.name = 'CalendarConflictError'
    this.code = code
  }
}

export const cloneCalendarJson = (value) => JSON.parse(JSON.stringify(value))

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const requiredText = (value, field, maxLength) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CalendarValidationError(`${field} est requis`, 'CALENDAR_FIELD_REQUIRED', { field })
  }
  const normalized = value.trim()
  if (normalized.length > maxLength) {
    throw new CalendarValidationError(`${field} depasse ${maxLength} caracteres`, 'CALENDAR_FIELD_TOO_LONG', { field, maxLength })
  }
  return normalized
}

const optionalText = (value, field, maxLength) => {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') {
    throw new CalendarValidationError(`${field} doit etre du texte`, 'CALENDAR_FIELD_INVALID', { field })
  }
  const normalized = value.trim()
  if (normalized.length > maxLength) {
    throw new CalendarValidationError(`${field} depasse ${maxLength} caracteres`, 'CALENDAR_FIELD_TOO_LONG', { field, maxLength })
  }
  return normalized
}

export const assertCalendarTimeZone = (timeZone) => {
  const normalized = requiredText(timeZone, 'time.timeZone', 120)
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format(0)
  } catch {
    throw new CalendarValidationError('Fuseau horaire IANA invalide', 'CALENDAR_TIME_ZONE_INVALID', { timeZone: normalized })
  }
  return normalized
}

export const parseCivilDate = (dateKey) => {
  if (typeof dateKey !== 'string') {
    throw new CalendarValidationError('Date civile invalide', 'CALENDAR_DATE_INVALID', { dateKey })
  }
  const match = DATE_KEY_PATTERN.exec(dateKey)
  if (!match) throw new CalendarValidationError('Date civile attendue au format YYYY-MM-DD', 'CALENDAR_DATE_INVALID', { dateKey })
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new CalendarValidationError('Date civile impossible', 'CALENDAR_DATE_INVALID', { dateKey })
  }
  return { year, month, day }
}

const pad2 = (value) => String(value).padStart(2, '0')

export const formatCivilDate = ({ year, month, day }) => `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`

const civilOrdinal = (dateKey) => {
  const { year, month, day } = parseCivilDate(dateKey)
  return Math.trunc(Date.UTC(year, month - 1, day) / 86_400_000)
}

export const addCivilDays = (dateKey, amount) => {
  if (!Number.isSafeInteger(amount)) throw new CalendarValidationError('Decalage de date invalide', 'CALENDAR_DATE_SHIFT_INVALID')
  const { year, month, day } = parseCivilDate(dateKey)
  const shifted = new Date(Date.UTC(year, month - 1, day + amount))
  return formatCivilDate({ year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() })
}

export const civilDaySpan = (startDate, endDateExclusive) => civilOrdinal(endDateExclusive) - civilOrdinal(startDate)

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate()

export const addCivilMonths = (dateKey, amount) => {
  if (!Number.isSafeInteger(amount)) throw new CalendarValidationError('Decalage de mois invalide', 'CALENDAR_DATE_SHIFT_INVALID')
  const { year, month, day } = parseCivilDate(dateKey)
  const monthIndex = (year * 12) + (month - 1) + amount
  const nextYear = Math.floor(monthIndex / 12)
  const nextMonthIndex = ((monthIndex % 12) + 12) % 12
  const nextMonth = nextMonthIndex + 1
  return formatCivilDate({ year: nextYear, month: nextMonth, day: Math.min(day, daysInMonth(nextYear, nextMonth)) })
}

export const addCivilYears = (dateKey, amount) => {
  if (!Number.isSafeInteger(amount)) throw new CalendarValidationError('Decalage d annee invalide', 'CALENDAR_DATE_SHIFT_INVALID')
  const { year, month, day } = parseCivilDate(dateKey)
  const nextYear = year + amount
  return formatCivilDate({ year: nextYear, month, day: Math.min(day, daysInMonth(nextYear, month)) })
}

export const shiftCivilDate = (dateKey, frequency, amount) => {
  if (frequency === 'none') return dateKey
  if (frequency === 'daily') return addCivilDays(dateKey, amount)
  if (frequency === 'weekly') return addCivilDays(dateKey, amount * 7)
  if (frequency === 'monthly') return addCivilMonths(dateKey, amount)
  if (frequency === 'yearly') return addCivilYears(dateKey, amount)
  throw new CalendarValidationError('Frequence de recurrence inconnue', 'CALENDAR_RECURRENCE_INVALID', { frequency })
}

const instantMs = (value, field = 'instant') => {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) {
    throw new CalendarValidationError(`${field} est invalide`, 'CALENDAR_INSTANT_INVALID', { field, value })
  }
  return date.getTime()
}

const dateTimeFormatters = new Map()

const formatterFor = (timeZone) => {
  if (!dateTimeFormatters.has(timeZone)) {
    dateTimeFormatters.set(timeZone, new Intl.DateTimeFormat('en-CA', {
      timeZone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
      hourCycle: 'h23',
    }))
  }
  return dateTimeFormatters.get(timeZone)
}

export const zonedPartsFromInstant = (value, timeZone) => {
  const zone = assertCalendarTimeZone(timeZone)
  const milliseconds = instantMs(value)
  const parts = {}
  for (const part of formatterFor(zone).formatToParts(new Date(milliseconds))) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
    millisecond: parts.fractionalSecond ?? (milliseconds % 1000 + 1000) % 1000,
  }
}

const partsAsUtcMs = (parts) => Date.UTC(
  parts.year,
  parts.month - 1,
  parts.day,
  parts.hour ?? 0,
  parts.minute ?? 0,
  parts.second ?? 0,
  parts.millisecond ?? 0,
)

const compareParts = (left, right) => {
  const a = partsAsUtcMs(left)
  const b = partsAsUtcMs(right)
  return a === b ? 0 : a < b ? -1 : 1
}

const sameParts = (left, right) => compareParts(left, right) === 0

const offsetAt = (milliseconds, timeZone) => partsAsUtcMs(zonedPartsFromInstant(milliseconds, timeZone)) - milliseconds

export const instantFromZonedParts = (input, timeZone) => {
  const zone = assertCalendarTimeZone(timeZone)
  const wanted = {
    year: Number(input?.year), month: Number(input?.month), day: Number(input?.day),
    hour: Number(input?.hour ?? 0), minute: Number(input?.minute ?? 0), second: Number(input?.second ?? 0),
    millisecond: Number(input?.millisecond ?? 0),
  }
  parseCivilDate(formatCivilDate(wanted))
  for (const field of ['hour', 'minute', 'second', 'millisecond']) {
    const limits = field === 'hour' ? [0, 23] : field === 'millisecond' ? [0, 999] : [0, 59]
    if (!Number.isInteger(wanted[field]) || wanted[field] < limits[0] || wanted[field] > limits[1]) {
      throw new CalendarValidationError('Heure civile invalide', 'CALENDAR_LOCAL_TIME_INVALID', { field, value: wanted[field] })
    }
  }

  const naive = partsAsUtcMs(wanted)
  const offsets = new Set()
  for (let hour = -36; hour <= 36; hour += 3) offsets.add(offsetAt(naive + (hour * 3_600_000), zone))

  const exact = []
  const compatible = []
  for (const offset of offsets) {
    const candidate = naive - offset
    const actual = zonedPartsFromInstant(candidate, zone)
    if (sameParts(actual, wanted)) exact.push(candidate)
    else if (compareParts(actual, wanted) > 0) compatible.push({ candidate, distance: partsAsUtcMs(actual) - naive })
  }
  if (exact.length) return new Date(Math.min(...exact))

  // A local time inside a daylight-saving gap does not exist. Match Temporal's
  // compatible policy by moving forward by the size of that gap.
  compatible.sort((left, right) => left.distance - right.distance || left.candidate - right.candidate)
  if (compatible.length) return new Date(compatible[0].candidate)
  throw new CalendarValidationError('Impossible de convertir cette heure civile', 'CALENDAR_LOCAL_TIME_INVALID', { input, timeZone: zone })
}

export const startOfCivilDayInstant = (dateKey, timeZone = DEFAULT_CALENDAR_TIME_ZONE) => {
  const parts = parseCivilDate(dateKey)
  return instantFromZonedParts({ ...parts, hour: 0, minute: 0, second: 0, millisecond: 0 }, timeZone)
}

const normalizeTime = (time) => {
  if (!isPlainObject(time)) throw new CalendarValidationError('time est requis', 'CALENDAR_TIME_INVALID')
  const timeZone = assertCalendarTimeZone(time.timeZone ?? DEFAULT_CALENDAR_TIME_ZONE)
  if (time.kind === 'timed') {
    const start = instantMs(time.start, 'time.start')
    const end = instantMs(time.end, 'time.end')
    if (end <= start) throw new CalendarValidationError('time.end doit etre apres time.start', 'CALENDAR_TIME_RANGE_INVALID')
    return { kind: 'timed', start: new Date(start).toISOString(), end: new Date(end).toISOString(), timeZone }
  }
  if (time.kind === 'allDay') {
    parseCivilDate(time.startDate)
    parseCivilDate(time.endDateExclusive)
    if (civilDaySpan(time.startDate, time.endDateExclusive) < 1) {
      throw new CalendarValidationError('endDateExclusive doit etre apres startDate', 'CALENDAR_TIME_RANGE_INVALID')
    }
    return { kind: 'allDay', startDate: time.startDate, endDateExclusive: time.endDateExclusive, timeZone }
  }
  throw new CalendarValidationError('time.kind doit etre timed ou allDay', 'CALENDAR_TIME_INVALID')
}

const normalizeRecurrence = (recurrence = { frequency: 'none', interval: 1 }) => {
  if (!isPlainObject(recurrence)) throw new CalendarValidationError('recurrence invalide', 'CALENDAR_RECURRENCE_INVALID')
  const frequency = recurrence.frequency ?? 'none'
  if (!CALENDAR_RECURRENCE_FREQUENCIES.includes(frequency)) {
    throw new CalendarValidationError('Frequence de recurrence invalide', 'CALENDAR_RECURRENCE_INVALID', { frequency })
  }
  const interval = recurrence.interval ?? 1
  if (!Number.isSafeInteger(interval) || interval < 1 || interval > 1000) {
    throw new CalendarValidationError('Intervalle de recurrence invalide', 'CALENDAR_RECURRENCE_INVALID', { interval })
  }
  const normalized = { frequency, interval }
  if (recurrence.until !== undefined && recurrence.until !== null && recurrence.until !== '') {
    if (typeof recurrence.until !== 'string') throw new CalendarValidationError('Fin de recurrence invalide', 'CALENDAR_RECURRENCE_INVALID')
    if (DATE_KEY_PATTERN.test(recurrence.until)) parseCivilDate(recurrence.until)
    else instantMs(recurrence.until, 'recurrence.until')
    normalized.until = recurrence.until
  }
  return normalized
}

const normalizeReminders = (reminders = []) => {
  if (!Array.isArray(reminders) || reminders.length > 32) {
    throw new CalendarValidationError('Liste de rappels invalide', 'CALENDAR_REMINDERS_INVALID')
  }
  const ids = new Set()
  return reminders.map((reminder, index) => {
    if (!isPlainObject(reminder)) throw new CalendarValidationError('Rappel invalide', 'CALENDAR_REMINDER_INVALID', { index })
    const id = requiredText(reminder.id, `reminders[${index}].id`, 160)
    if (ids.has(id)) throw new CalendarValidationError('Identifiant de rappel duplique', 'CALENDAR_REMINDER_DUPLICATE', { id })
    ids.add(id)
    if (reminder.channel !== 'desktop') throw new CalendarValidationError('Seul le canal desktop est disponible', 'CALENDAR_REMINDER_CHANNEL_INVALID')
    if (!Number.isSafeInteger(reminder.offsetMinutes) || reminder.offsetMinutes < 0 || reminder.offsetMinutes > 525_600) {
      throw new CalendarValidationError('Delai de rappel invalide', 'CALENDAR_REMINDER_OFFSET_INVALID')
    }
    return { id, channel: 'desktop', offsetMinutes: reminder.offsetMinutes }
  })
}

const normalizeTimestamp = (value, field) => new Date(instantMs(value, field)).toISOString()

export const normalizeCalendarItem = (item) => {
  if (!isPlainObject(item)) throw new CalendarValidationError('Element calendrier invalide', 'CALENDAR_ITEM_INVALID')
  const kind = item.kind
  if (!CALENDAR_KINDS.includes(kind)) throw new CalendarValidationError('Type d element calendrier invalide', 'CALENDAR_KIND_INVALID', { kind })
  const status = item.status ?? 'open'
  if (!CALENDAR_STATUSES.includes(status)) throw new CalendarValidationError('Statut calendrier invalide', 'CALENDAR_STATUS_INVALID', { status })
  const createdAt = normalizeTimestamp(item.createdAt, 'createdAt')
  const updatedAt = normalizeTimestamp(item.updatedAt, 'updatedAt')
  if (instantMs(updatedAt) < instantMs(createdAt)) {
    throw new CalendarValidationError('updatedAt precede createdAt', 'CALENDAR_TIMESTAMP_INVALID')
  }
  return {
    id: requiredText(item.id, 'id', 200),
    kind,
    title: requiredText(item.title, 'title', 160),
    projectId: requiredText(item.projectId, 'projectId', 160),
    projectLabel: requiredText(item.projectLabel, 'projectLabel', 200),
    status,
    notes: optionalText(item.notes, 'notes', 4000),
    location: optionalText(item.location, 'location', 500),
    time: normalizeTime(item.time),
    recurrence: normalizeRecurrence(item.recurrence),
    reminders: normalizeReminders(item.reminders),
    createdAt,
    updatedAt,
  }
}

export const assertCalendarItem = (item) => normalizeCalendarItem(item)
export const validateCalendarItem = (item) => normalizeCalendarItem(item)

export const createCalendarItem = (input, { id, now = new Date() } = {}) => {
  if (!isPlainObject(input)) throw new CalendarValidationError('Donnees de creation invalides', 'CALENDAR_ITEM_INVALID')
  const timestamp = normalizeTimestamp(now, 'now')
  return normalizeCalendarItem({
    ...input,
    id,
    status: input.status ?? 'open',
    notes: input.notes ?? '',
    location: input.location ?? '',
    recurrence: input.recurrence ?? { frequency: 'none', interval: 1 },
    reminders: input.reminders ?? [],
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

export const updateCalendarItem = (existing, patch, { now = new Date() } = {}) => {
  const current = normalizeCalendarItem(existing)
  if (!isPlainObject(patch)) throw new CalendarValidationError('Patch calendrier invalide', 'CALENDAR_PATCH_INVALID')
  if (patch.id !== undefined && patch.id !== current.id) throw new CalendarConflictError('id est immuable', 'CALENDAR_IMMUTABLE_FIELD')
  if (patch.createdAt !== undefined && normalizeTimestamp(patch.createdAt, 'createdAt') !== current.createdAt) {
    throw new CalendarConflictError('createdAt est immuable', 'CALENDAR_IMMUTABLE_FIELD')
  }
  return normalizeCalendarItem({
    ...current,
    ...patch,
    ...(patch.time === undefined ? {} : { time: { ...current.time, ...patch.time } }),
    ...(patch.recurrence === undefined ? {} : { recurrence: { ...current.recurrence, ...patch.recurrence } }),
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: normalizeTimestamp(now, 'now'),
  })
}

const shiftedTimedParts = (baseParts, shiftedDate) => ({ ...parseCivilDate(shiftedDate), hour: baseParts.hour, minute: baseParts.minute, second: baseParts.second, millisecond: baseParts.millisecond })

const occurrenceAt = (item, index) => {
  const { frequency, interval } = item.recurrence
  if (index === 0 || frequency === 'none') {
    if (item.time.kind === 'timed') {
      return { time: cloneCalendarJson(item.time), startMs: instantMs(item.time.start), endMs: instantMs(item.time.end) }
    }
    return {
      time: cloneCalendarJson(item.time),
      startMs: startOfCivilDayInstant(item.time.startDate, item.time.timeZone).getTime(),
      endMs: startOfCivilDayInstant(item.time.endDateExclusive, item.time.timeZone).getTime(),
    }
  }

  const amount = index * interval
  if (item.time.kind === 'allDay') {
    const span = civilDaySpan(item.time.startDate, item.time.endDateExclusive)
    const startDate = shiftCivilDate(item.time.startDate, frequency, amount)
    const endDateExclusive = addCivilDays(startDate, span)
    return {
      time: { ...item.time, startDate, endDateExclusive },
      startMs: startOfCivilDayInstant(startDate, item.time.timeZone).getTime(),
      endMs: startOfCivilDayInstant(endDateExclusive, item.time.timeZone).getTime(),
    }
  }

  const zone = item.time.timeZone
  const baseStart = zonedPartsFromInstant(item.time.start, zone)
  const baseEnd = zonedPartsFromInstant(item.time.end, zone)
  const baseStartDate = formatCivilDate(baseStart)
  const baseEndDate = formatCivilDate(baseEnd)
  const daySpan = civilDaySpan(baseStartDate, baseEndDate)
  const startDate = shiftCivilDate(baseStartDate, frequency, amount)
  const endDate = addCivilDays(startDate, daySpan)
  const start = instantFromZonedParts(shiftedTimedParts(baseStart, startDate), zone)
  let end = instantFromZonedParts(shiftedTimedParts(baseEnd, endDate), zone)
  if (end.getTime() <= start.getTime()) end = new Date(start.getTime() + (instantMs(item.time.end) - instantMs(item.time.start)))
  return {
    time: { ...item.time, start: start.toISOString(), end: end.toISOString() },
    startMs: start.getTime(),
    endMs: end.getTime(),
  }
}

const occurrenceAllowedByUntil = (item, occurrence) => {
  const until = item.recurrence.until
  if (!until) return true
  if (DATE_KEY_PATTERN.test(until)) {
    const occurrenceDate = occurrence.time.kind === 'allDay'
      ? occurrence.time.startDate
      : formatCivilDate(zonedPartsFromInstant(occurrence.startMs, occurrence.time.timeZone))
    return occurrenceDate <= until
  }
  return occurrence.startMs <= instantMs(until, 'recurrence.until')
}

const occurrenceRecord = (item, index, occurrence) => ({
  ...cloneCalendarJson(item),
  time: occurrence.time,
  itemId: item.id,
  occurrenceIndex: index,
  occurrenceId: `${item.id}:${index}:${occurrence.time.kind === 'timed' ? occurrence.time.start : occurrence.time.startDate}`,
  startMs: occurrence.startMs,
  endMs: occurrence.endMs,
})

export const expandCalendarOccurrences = (itemOrItems, rangeStart, rangeEnd, { maxOccurrences = MAX_OCCURRENCES } = {}) => {
  const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems]
  const fromMs = instantMs(rangeStart, 'rangeStart')
  const toMs = instantMs(rangeEnd, 'rangeEnd')
  if (toMs <= fromMs) throw new CalendarValidationError('Plage d expansion invalide', 'CALENDAR_RANGE_INVALID')
  if (!Number.isSafeInteger(maxOccurrences) || maxOccurrences < 1 || maxOccurrences > MAX_OCCURRENCES) {
    throw new CalendarValidationError('Limite d occurrences invalide', 'CALENDAR_RANGE_INVALID')
  }

  const result = []
  for (const raw of items) {
    const item = normalizeCalendarItem(raw)
    const recurring = item.recurrence.frequency !== 'none'
    for (let index = 0; index < (recurring ? maxOccurrences : 1); index += 1) {
      const occurrence = occurrenceAt(item, index)
      if (!occurrenceAllowedByUntil(item, occurrence)) break
      if (occurrence.endMs > fromMs && occurrence.startMs < toMs) result.push(occurrenceRecord(item, index, occurrence))
      if (!recurring || occurrence.startMs >= toMs) break
      if (index === maxOccurrences - 1) {
        throw new CalendarValidationError('Recurrence trop longue pour la plage demandee', 'CALENDAR_RECURRENCE_LIMIT')
      }
    }
  }
  return result.sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs || left.itemId.localeCompare(right.itemId))
}

export const expandOccurrences = expandCalendarOccurrences

export const reminderDeliveryId = ({ itemId, occurrenceId, reminderId, scheduledAt }) => (
  `calendar:${itemId}:${occurrenceId}:${reminderId}:${new Date(instantMs(scheduledAt, 'scheduledAt')).toISOString()}`
)

export const collectDueReminderDeliveries = (items, { from, to, deliveredIds = [] } = {}) => {
  const fromMs = instantMs(from, 'from')
  const toMs = instantMs(to, 'to')
  if (toMs < fromMs) throw new CalendarValidationError('Fenetre de rappels invalide', 'CALENDAR_RANGE_INVALID')
  const normalizedItems = (items ?? []).map(normalizeCalendarItem)
  const activeItems = normalizedItems.filter((item) => !['completed', 'cancelled'].includes(item.status) && item.reminders.length)
  if (!activeItems.length) return []
  const maxOffsetMs = Math.max(0, ...activeItems.flatMap((item) => item.reminders.map((reminder) => reminder.offsetMinutes * 60_000)))
  const occurrenceEnd = new Date(toMs + maxOffsetMs + 1)
  const occurrences = expandCalendarOccurrences(activeItems, new Date(fromMs), occurrenceEnd)
  const delivered = deliveredIds instanceof Set ? deliveredIds : new Set(deliveredIds)
  const due = []
  for (const occurrence of occurrences) {
    for (const reminder of occurrence.reminders) {
      const scheduledMs = occurrence.startMs - (reminder.offsetMinutes * 60_000)
      if (scheduledMs < fromMs || scheduledMs > toMs) continue
      const scheduledAt = new Date(scheduledMs).toISOString()
      const deliveryId = reminderDeliveryId({
        itemId: occurrence.itemId,
        occurrenceId: occurrence.occurrenceId,
        reminderId: reminder.id,
        scheduledAt,
      })
      if (delivered.has(deliveryId)) continue
      due.push({
        deliveryId,
        itemId: occurrence.itemId,
        occurrenceId: occurrence.occurrenceId,
        occurrenceIndex: occurrence.occurrenceIndex,
        reminderId: reminder.id,
        channel: reminder.channel,
        offsetMinutes: reminder.offsetMinutes,
        scheduledAt,
        occurrenceStart: new Date(occurrence.startMs).toISOString(),
        occurrenceEnd: new Date(occurrence.endMs).toISOString(),
        timeZone: occurrence.time.timeZone,
        title: occurrence.title,
        projectId: occurrence.projectId,
        projectLabel: occurrence.projectLabel,
        location: occurrence.location,
      })
    }
  }
  return due.sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt) || left.deliveryId.localeCompare(right.deliveryId))
}

export const collectDueReminders = collectDueReminderDeliveries
