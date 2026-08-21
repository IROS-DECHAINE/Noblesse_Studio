import { CalendarValidationError } from '../../shared/calendarDomain.mjs'

const toDate = (value, field) => {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) throw new CalendarValidationError(`${field} invalide`, 'CALENDAR_CLOCK_INVALID')
  return date
}

export const deliverDueCalendarReminders = async ({ store, notify, from, to } = {}) => {
  if (!store || typeof store.collectDueReminders !== 'function' || typeof store.markDelivery !== 'function') {
    throw new CalendarValidationError('Store calendrier invalide pour le scheduler', 'CALENDAR_SCHEDULER_INVALID')
  }
  if (typeof notify !== 'function') throw new CalendarValidationError('Callback notify requis', 'CALENDAR_SCHEDULER_INVALID')
  const due = await store.collectDueReminders({ from, to })
  const delivered = []
  const failed = []
  for (const reminder of due) {
    try {
      await notify(reminder)
      const receipt = await store.markDelivery(reminder)
      delivered.push({ reminder, receipt })
    } catch (error) {
      failed.push({ reminder, error })
    }
  }
  return { due, delivered, failed }
}

export const createCalendarReminderScheduler = ({
  store,
  notify,
  now = () => new Date(),
  intervalMs = 30_000,
  initialLookbackMs = 5 * 60_000,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
  onError = () => undefined,
} = {}) => {
  if (!store || typeof store.collectDueReminders !== 'function' || typeof store.markDelivery !== 'function') {
    throw new CalendarValidationError('Store calendrier invalide pour le scheduler', 'CALENDAR_SCHEDULER_INVALID')
  }
  if (typeof notify !== 'function') throw new CalendarValidationError('Callback notify requis', 'CALENDAR_SCHEDULER_INVALID')
  if (typeof now !== 'function' || typeof setIntervalFn !== 'function' || typeof clearIntervalFn !== 'function' || typeof onError !== 'function') {
    throw new CalendarValidationError('Dependance scheduler invalide', 'CALENDAR_SCHEDULER_INVALID')
  }
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 250 || !Number.isSafeInteger(initialLookbackMs) || initialLookbackMs < 0) {
    throw new CalendarValidationError('Cadence scheduler invalide', 'CALENDAR_SCHEDULER_INVALID')
  }

  let timer = null
  let lastCheckedAt = null
  let inFlight = null

  const tick = () => {
    if (inFlight) return inFlight
    inFlight = (async () => {
      const current = toDate(now(), 'now')
      const from = lastCheckedAt ?? new Date(current.getTime() - initialLookbackMs)
      const result = await deliverDueCalendarReminders({ store, notify, from, to: current })
      // Keep the failed window open. Already marked deliveries are filtered by
      // the store, while failed callbacks can safely be retried on the next tick.
      lastCheckedAt = result.failed.length ? from : current
      return result
    })().catch((error) => {
      onError(error)
      throw error
    }).finally(() => { inFlight = null })
    return inFlight
  }

  const start = ({ immediate = true } = {}) => {
    if (timer !== null) return { status: 'ALREADY_RUNNING' }
    timer = setIntervalFn(() => { tick().catch(() => undefined) }, intervalMs)
    if (typeof timer?.unref === 'function') timer.unref()
    if (immediate) tick().catch(() => undefined)
    return { status: 'STARTED' }
  }

  const stop = () => {
    if (timer === null) return { status: 'ALREADY_STOPPED' }
    clearIntervalFn(timer)
    timer = null
    return { status: 'STOPPED' }
  }

  return Object.freeze({
    start,
    stop,
    tick,
    isRunning: () => timer !== null,
    getLastCheckedAt: () => lastCheckedAt ? new Date(lastCheckedAt) : null,
  })
}

export const createReminderScheduler = createCalendarReminderScheduler
export const runCalendarReminderSweep = deliverDueCalendarReminders
