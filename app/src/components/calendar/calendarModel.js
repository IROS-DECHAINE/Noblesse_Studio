export const CALENDAR_TIME_ZONE = 'Europe/Paris'

export const CALENDAR_PROJECTS = [
  { id: 'noblesse-studio', label: 'NOBLESSE STUDIO', shortLabel: 'STUDIO', color: 'silver' },
  { id: 'primebot-rush', label: 'PRIMEBOT RUSH', shortLabel: 'PRIMEBOT RUSH', color: 'blue' },
  { id: 'prime-industry', label: 'PRIME INDUSTRY', shortLabel: 'PRIME INDUSTRY', color: 'gold' },
  { id: 'how-many-boxes-can-you-carry', label: 'HOW MANY BOXES', shortLabel: 'HOW MANY BOXES', color: 'cyan' },
]

export const KIND_LABELS = {
  event: 'Rendez-vous',
  task: 'Tâche',
  deadline: 'Deadline',
  focus: 'Bloc de travail',
  milestone: 'Jalon',
}

export const REMINDER_PRESETS = [
  { value: 0, label: 'À l’heure' },
  { value: 5, label: '5 minutes avant' },
  { value: 10, label: '10 minutes avant' },
  { value: 15, label: '15 minutes avant' },
  { value: 30, label: '30 minutes avant' },
  { value: 60, label: '1 heure avant' },
  { value: 120, label: '2 heures avant' },
  { value: 1440, label: '1 jour avant' },
  { value: 2880, label: '2 jours avant' },
  { value: 10080, label: '1 semaine avant' },
]

const pad = (value) => String(value).padStart(2, '0')

const wallFormatter = (timeZone) => new Intl.DateTimeFormat('en-CA', {
  timeZone,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
})

const wallPartsFromDate = (date, timeZone) => {
  const values = Object.fromEntries(wallFormatter(timeZone).formatToParts(date).map((part) => [part.type, part.value]))
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
  }
}

// Convertit une heure murale IANA en instant. La validation finale refuse les
// heures inexistantes lors du passage à l’heure d’été au lieu de les décaler.
export const dateFromZonedWallTime = (dateKey, time, timeZone = CALENDAR_TIME_ZONE) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const wantedAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0)
  let candidate = new Date(wantedAsUtc)
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const actual = wallPartsFromDate(candidate, timeZone)
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second)
    const correction = wantedAsUtc - actualAsUtc
    if (!correction) break
    candidate = new Date(candidate.getTime() + correction)
  }
  const projected = wallPartsFromDate(candidate, timeZone)
  if (projected.dateKey !== dateKey || projected.time !== time) {
    throw new RangeError(`L’heure ${dateKey} ${time} n’existe pas dans le fuseau ${timeZone}.`)
  }
  return candidate
}

export const localDateKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export const dateFromKey = (dateKey, time = '12:00') => new Date(`${dateKey}T${time}:00`)

export const addDaysKey = (dateKey, amount) => {
  const date = dateFromKey(dateKey)
  date.setDate(date.getDate() + amount)
  return localDateKey(date)
}

export const startOfWeekKey = (dateKey) => {
  const date = dateFromKey(dateKey)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  return localDateKey(date)
}

export const weekDateKeys = (dateKey) => {
  const start = startOfWeekKey(dateKey)
  return Array.from({ length: 7 }, (_, index) => addDaysKey(start, index))
}

export const startOfMonthKey = (dateKey) => `${dateKey.slice(0, 7)}-01`

export const addMonthsKey = (dateKey, amount) => {
  const source = dateFromKey(dateKey)
  const target = new Date(source.getFullYear(), source.getMonth() + amount, 1, 12, 0, 0)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12, 0, 0).getDate()
  target.setDate(Math.min(source.getDate(), lastDay))
  return localDateKey(target)
}

// Six lignes stables gardent la grille parfaitement alignée d'un mois à l'autre
// et montrent toujours les jours de jonction utiles pour planifier sans rupture.
export const monthGridDateKeys = (dateKey) => {
  const start = startOfWeekKey(startOfMonthKey(dateKey))
  return Array.from({ length: 42 }, (_, index) => addDaysKey(start, index))
}

export const endOfDayExclusive = (dateKey) => dateFromKey(addDaysKey(dateKey, 1), '00:00')

const projectFor = (projectId) => CALENDAR_PROJECTS.find((project) => project.id === projectId) || CALENDAR_PROJECTS[0]

export const projectMeta = projectFor

export const formatWeekRange = (days) => {
  const start = dateFromKey(days[0])
  const end = dateFromKey(days[6])
  const month = new Intl.DateTimeFormat('fr-FR', { month: 'long' })
  const sameMonth = start.getMonth() === end.getMonth()
  return sameMonth
    ? `${start.getDate()} – ${end.getDate()} ${month.format(end)} ${end.getFullYear()}`
    : `${start.getDate()} ${month.format(start)} – ${end.getDate()} ${month.format(end)} ${end.getFullYear()}`
}

export const formatMonthLabel = (dateKey) => {
  const label = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(dateFromKey(dateKey))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export const formatDayHeading = (dateKey) => new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
}).format(dateFromKey(dateKey))

export const formatAgendaDay = (dateKey) => new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long', day: 'numeric', month: 'short',
}).format(dateFromKey(dateKey))

export const formatTime = (value) => new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value))

const shiftDate = (date, frequency, amount) => {
  const next = new Date(date)
  if (frequency === 'daily') next.setDate(next.getDate() + amount)
  if (frequency === 'weekly') next.setDate(next.getDate() + (7 * amount))
  if (frequency === 'monthly') next.setMonth(next.getMonth() + amount)
  if (frequency === 'yearly') next.setFullYear(next.getFullYear() + amount)
  return next
}

const shiftDateKey = (dateKey, frequency, amount) => localDateKey(shiftDate(dateFromKey(dateKey), frequency, amount))

const normalizeItem = (item) => {
  if (item.time?.kind) return item
  if (item.startsAt || item.start) {
    return { ...item, time: { kind: 'timed', start: item.startsAt || item.start, end: item.endsAt || item.end, timeZone: item.timeZone || CALENDAR_TIME_ZONE } }
  }
  if (item.startDate || item.date) {
    const startDate = item.startDate || item.date
    return { ...item, time: { kind: 'allDay', startDate, endDateExclusive: item.endDateExclusive || addDaysKey(item.endDate || startDate, 1), timeZone: item.timeZone || CALENDAR_TIME_ZONE } }
  }
  return item
}

const occurrenceFrom = (item, index, time) => ({
  ...item,
  time,
  itemId: item.id,
  occurrenceId: `${item.id}:${index}:${time.kind === 'timed' ? time.start : time.startDate}`,
  project: projectFor(item.projectId),
})

export const expandItemsForRange = (items, rangeStartKey, rangeEndExclusiveKey) => {
  const rangeStart = dateFromKey(rangeStartKey, '00:00').getTime()
  const rangeEnd = dateFromKey(rangeEndExclusiveKey, '00:00').getTime()
  const occurrences = []

  for (const rawItem of items || []) {
    const item = normalizeItem(rawItem)
    if (!item?.time?.kind || item.deletedAt) continue
    const frequency = item.recurrence?.frequency || 'none'
    const interval = Math.max(1, Number(item.recurrence?.interval) || 1)
    const until = item.recurrence?.until ? dateFromKey(item.recurrence.until, '23:59').getTime() : Number.POSITIVE_INFINITY
    const limit = frequency === 'none' ? 1 : 730

    for (let index = 0; index < limit; index += 1) {
      let time
      let occurrenceStart
      let occurrenceEnd
      if (item.time.kind === 'allDay') {
        const startDate = frequency === 'none' ? item.time.startDate : shiftDateKey(item.time.startDate, frequency, index * interval)
        const length = Math.max(1, Math.round((dateFromKey(item.time.endDateExclusive) - dateFromKey(item.time.startDate)) / 86400000))
        const endDateExclusive = addDaysKey(startDate, length)
        time = { ...item.time, startDate, endDateExclusive }
        occurrenceStart = dateFromKey(startDate, '00:00').getTime()
        occurrenceEnd = dateFromKey(endDateExclusive, '00:00').getTime()
      } else {
        const baseStart = new Date(item.time.start)
        const baseEnd = new Date(item.time.end)
        const timeZone = item.time.timeZone || CALENDAR_TIME_ZONE
        let start = baseStart
        let end = baseEnd
        if (frequency !== 'none') {
          const baseStartWall = wallPartsFromDate(baseStart, timeZone)
          const baseEndWall = wallPartsFromDate(baseEnd, timeZone)
          const amount = index * interval
          try {
            start = dateFromZonedWallTime(shiftDateKey(baseStartWall.dateKey, frequency, amount), baseStartWall.time, timeZone)
          } catch {
            // RFC 5545 écarte les occurrences dont l’heure civile n’existe pas.
            continue
          }
          try {
            end = dateFromZonedWallTime(shiftDateKey(baseEndWall.dateKey, frequency, amount), baseEndWall.time, timeZone)
          } catch {
            end = new Date(start.getTime() + Math.max(900000, baseEnd.getTime() - baseStart.getTime()))
          }
        }
        if (end <= start) end = new Date(start.getTime() + Math.max(900000, baseEnd.getTime() - baseStart.getTime()))
        time = { ...item.time, start: start.toISOString(), end: end.toISOString() }
        occurrenceStart = start.getTime()
        occurrenceEnd = end.getTime()
      }
      if (occurrenceStart > until || occurrenceStart >= rangeEnd) break
      if (occurrenceEnd > rangeStart && occurrenceStart < rangeEnd) occurrences.push(occurrenceFrom(item, index, time))
      if (frequency === 'none') break
    }
  }
  return occurrences.sort((left, right) => occurrenceStartMs(left) - occurrenceStartMs(right))
}

export const occurrenceStartMs = (occurrence) => occurrence.time.kind === 'allDay'
  ? dateFromKey(occurrence.time.startDate, '00:00').getTime()
  : new Date(occurrence.time.start).getTime()

export const occurrenceEndMs = (occurrence) => occurrence.time.kind === 'allDay'
  ? dateFromKey(occurrence.time.endDateExclusive, '00:00').getTime()
  : new Date(occurrence.time.end).getTime()

export const occurrenceOverlapsDay = (occurrence, dateKey) => {
  const start = dateFromKey(dateKey, '00:00').getTime()
  const end = endOfDayExclusive(dateKey).getTime()
  return occurrenceEndMs(occurrence) > start && occurrenceStartMs(occurrence) < end
}

export const isRailOccurrence = (occurrence) => occurrence.time.kind === 'allDay'
  || localDateKey(new Date(occurrence.time.start)) !== localDateKey(new Date(occurrence.time.end))

export const layoutAllDayBars = (occurrences, days) => {
  const bars = occurrences
    .filter(isRailOccurrence)
    .map((occurrence) => {
      const startKey = occurrence.time.kind === 'allDay' ? occurrence.time.startDate : localDateKey(new Date(occurrence.time.start))
      const exclusiveKey = occurrence.time.kind === 'allDay' ? occurrence.time.endDateExclusive : addDaysKey(localDateKey(new Date(occurrence.time.end)), 1)
      const startIndex = Math.max(0, days.findIndex((day) => day >= startKey))
      let endIndex = days.findIndex((day) => day >= exclusiveKey)
      if (endIndex < 0) endIndex = 7
      return { occurrence, startIndex, endIndex: Math.max(startIndex + 1, endIndex), lane: 0 }
    })
    .filter((bar) => bar.startIndex < 7 && bar.endIndex > 0)
    .sort((left, right) => left.startIndex - right.startIndex || right.endIndex - left.endIndex)

  const laneEnds = []
  for (const bar of bars) {
    let lane = laneEnds.findIndex((end) => end <= bar.startIndex)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = bar.endIndex
    bar.lane = lane
  }
  return { bars, laneCount: Math.max(1, laneEnds.length) }
}

export const timedLayoutForDay = (occurrences, dateKey) => {
  const dayStart = dateFromKey(dateKey, '00:00').getTime()
  const dayEnd = endOfDayExclusive(dateKey).getTime()
  const timed = occurrences
    .filter((occurrence) => !isRailOccurrence(occurrence) && occurrenceOverlapsDay(occurrence, dateKey))
    .map((occurrence) => ({
      occurrence,
      start: Math.max(dayStart, occurrenceStartMs(occurrence)),
      end: Math.min(dayEnd, occurrenceEndMs(occurrence)),
      column: 0,
      columns: 1,
    }))
    .sort((left, right) => left.start - right.start || left.end - right.end)

  let group = []
  let groupEnd = 0
  const flush = () => {
    if (!group.length) return
    const activeEnds = []
    let maxColumns = 1
    for (const entry of group) {
      let column = activeEnds.findIndex((end) => end <= entry.start)
      if (column < 0) column = activeEnds.length
      activeEnds[column] = entry.end
      entry.column = column
      maxColumns = Math.max(maxColumns, activeEnds.length)
    }
    for (const entry of group) entry.columns = maxColumns
    group = []
  }

  for (const entry of timed) {
    if (group.length && entry.start >= groupEnd) flush()
    group.push(entry)
    groupEnd = Math.max(groupEnd, entry.end)
  }
  flush()
  return timed.map((entry) => ({
    ...entry,
    startMinute: Math.max(0, (entry.start - dayStart) / 60000),
    durationMinutes: Math.max(15, (entry.end - entry.start) / 60000),
  }))
}

export const createDefaultForm = (dateKey, startMinutes = 9 * 60) => {
  const rounded = Math.min(23 * 60, Math.max(0, Math.round(startMinutes / 15) * 15))
  const end = Math.min(23 * 60 + 45, rounded + 60)
  return {
    kind: 'event',
    title: '',
    projectId: 'noblesse-studio',
    allDay: false,
    startDate: dateKey,
    startTime: `${pad(Math.floor(rounded / 60))}:${pad(rounded % 60)}`,
    endDate: dateKey,
    endTime: `${pad(Math.floor(end / 60))}:${pad(end % 60)}`,
    recurrence: 'none',
    recurrenceUntil: '',
    timeZone: CALENDAR_TIME_ZONE,
    location: '',
    notes: '',
    reminders: [30],
    status: 'open',
  }
}

export const formFromItem = (item) => {
  const normalized = normalizeItem(item)
  const isAllDay = normalized.time.kind === 'allDay'
  const start = isAllDay ? null : new Date(normalized.time.start)
  const end = isAllDay ? null : new Date(normalized.time.end)
  const timeZone = normalized.time.timeZone || CALENDAR_TIME_ZONE
  const startWall = isAllDay ? null : wallPartsFromDate(start, timeZone)
  const endWall = isAllDay ? null : wallPartsFromDate(end, timeZone)
  return {
    kind: normalized.kind || 'event',
    title: normalized.title || '',
    projectId: normalized.projectId || 'noblesse-studio',
    allDay: isAllDay,
    startDate: isAllDay ? normalized.time.startDate : startWall.dateKey,
    startTime: isAllDay ? '09:00' : startWall.time,
    endDate: isAllDay ? addDaysKey(normalized.time.endDateExclusive, -1) : endWall.dateKey,
    endTime: isAllDay ? '10:00' : endWall.time,
    recurrence: normalized.recurrence?.frequency || 'none',
    recurrenceUntil: normalized.recurrence?.until || '',
    timeZone,
    location: normalized.location || '',
    notes: normalized.notes || '',
    reminders: (normalized.reminders || []).map((reminder) => Number(reminder.offsetMinutes)).filter(Number.isFinite),
    status: normalized.status || 'open',
  }
}

export const itemInputFromForm = (form) => {
  const project = projectFor(form.projectId)
  const time = form.allDay
    ? { kind: 'allDay', startDate: form.startDate, endDateExclusive: addDaysKey(form.endDate, 1), timeZone: form.timeZone }
    : {
        kind: 'timed',
        start: dateFromZonedWallTime(form.startDate, form.startTime, form.timeZone).toISOString(),
        end: dateFromZonedWallTime(form.endDate, form.endTime, form.timeZone).toISOString(),
        timeZone: form.timeZone,
      }
  return {
    kind: form.kind,
    title: form.title.trim(),
    projectId: project.id,
    projectLabel: project.label,
    status: form.status || 'open',
    notes: form.notes.trim(),
    location: form.location.trim(),
    time,
    recurrence: { frequency: form.recurrence, interval: 1, ...(form.recurrenceUntil ? { until: form.recurrenceUntil } : {}) },
    reminders: form.reminders.map((offsetMinutes, index) => ({ id: `reminder-${index}-${offsetMinutes}`, channel: 'desktop', offsetMinutes })),
  }
}

export const validateForm = (form) => {
  if (!form.title.trim()) return 'Ajoute un titre.'
  if (!form.startDate || !form.endDate) return 'Choisis des dates valides.'
  if (form.endDate < form.startDate) return 'La fin doit être après le début.'
  if (!form.allDay) {
    let start
    let end
    try {
      start = dateFromZonedWallTime(form.startDate, form.startTime, form.timeZone)
      end = dateFromZonedWallTime(form.endDate, form.endTime, form.timeZone)
    } catch {
      return 'Cette heure n’existe pas dans le fuseau choisi à cause du changement d’heure.'
    }
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return 'La fin doit être après le début.'
  }
  return ''
}
