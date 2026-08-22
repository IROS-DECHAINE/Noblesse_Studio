const asBoolean = (value) => value === true

export const reconcileCalendarRuntime = ({ settings = {}, scheduler, tray = null, createTray } = {}) => {
  if (!scheduler || typeof scheduler.start !== 'function' || typeof scheduler.stop !== 'function') {
    throw new TypeError('Scheduler calendrier invalide.')
  }
  if (typeof createTray !== 'function') throw new TypeError('Créateur d’icône système invalide.')

  const notificationsEnabled = asBoolean(settings.desktopNotificationsEnabled)
  let runsInBackground = notificationsEnabled && asBoolean(settings.runInBackground)
  let nextTray = tray

  if (notificationsEnabled) scheduler.start()
  else scheduler.stop()

  if (runsInBackground) {
    nextTray ||= createTray()
    if (!nextTray) runsInBackground = false
  } else if (nextTray) {
    nextTray.destroy()
    nextTray = null
  }

  return Object.freeze({ notificationsEnabled, runsInBackground, tray: nextTray })
}

export const formatCalendarNotificationBody = (reminder = {}, locale = 'fr-FR') => {
  const parts = []
  const start = new Date(reminder.occurrenceStart)
  if (Number.isFinite(start.getTime())) {
    const timeZone = reminder.timeZone || 'Europe/Paris'
    const when = new Intl.DateTimeFormat(locale, {
      timeZone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(start)
    parts.push(`Commence ${when}`)
  }
  if (reminder.projectLabel) parts.push(String(reminder.projectLabel))
  if (reminder.location) parts.push(String(reminder.location))
  return parts.join(' • ') || 'Un élément du calendrier commence bientôt.'
}
