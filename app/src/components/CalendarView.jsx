import { useCallback, useEffect, useMemo, useState } from 'react'
import { BellOff, BellRing, CalendarDays, CalendarSync, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { studioApi } from '../lib/desktopApi.js'
import DayTimeline from './calendar/DayTimeline.jsx'
import EventDetails from './calendar/EventDetails.jsx'
import EventEditor from './calendar/EventEditor.jsx'
import GoogleCalendarSettings from './calendar/GoogleCalendarSettings.jsx'
import MonthGrid from './calendar/MonthGrid.jsx'
import ReminderSettings from './calendar/ReminderSettings.jsx'
import UpcomingAgenda from './calendar/UpcomingAgenda.jsx'
import WeekStrip from './calendar/WeekStrip.jsx'
import {
  addDaysKey,
  addMonthsKey,
  createDefaultForm,
  expandItemsForRange,
  formFromItem,
  formatMonthLabel,
  formatWeekRange,
  itemInputFromForm,
  localDateKey,
  monthGridDateKeys,
  startOfWeekKey,
  weekDateKeys,
} from './calendar/calendarModel.js'
import './calendar/calendar.css'

const LEGACY_STORAGE_KEY = 'noblesse:planning:v1'
const LEGACY_MIGRATION_KEY = 'noblesse:planning:v1:migrated-to-calendar-v1'
const EMPTY_SNAPSHOT = {
  schemaVersion: 1,
  revision: 0,
  items: [],
  settings: { timeZone: 'Europe/Paris', desktopNotificationsEnabled: false, runInBackground: true },
}
const EMPTY_GOOGLE_STATUS = {
  schemaVersion: 1,
  available: false,
  configured: false,
  connected: false,
  accountEmail: '',
  calendarName: 'Agenda principal',
  direction: 'NOBLESSE_TO_GOOGLE',
  lastSyncAt: null,
  lastError: '',
  pendingCount: 0,
}

const extractSnapshot = (result) => result?.snapshot || (Array.isArray(result?.items) ? result : null)

export default function CalendarView({ openItemId = null, onOpenItemHandled = () => {} }) {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT)
  const [selectedDate, setSelectedDate] = useState(localDateKey)
  const [viewMode, setViewMode] = useState('month')
  const [details, setDetails] = useState(null)
  const [editor, setEditor] = useState(null)
  const [reminderSettingsOpen, setReminderSettingsOpen] = useState(false)
  const [lastNotificationTestAt, setLastNotificationTestAt] = useState(null)
  const [googleSettingsOpen, setGoogleSettingsOpen] = useState(false)
  const [googleStatus, setGoogleStatus] = useState(EMPTY_GOOGLE_STATUS)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [googleError, setGoogleError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const next = await studioApi.calendarSnapshot()
      if (next) setSnapshot((current) => ({ ...current, ...next, items: Array.isArray(next.items) ? next.items : [] }))
      setError('')
      return next
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Le calendrier est momentanément indisponible.')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshGoogleStatus = useCallback(async () => {
    try {
      const next = await studioApi.googleCalendarStatus()
      if (next) setGoogleStatus((current) => ({ ...current, ...next }))
      return next
    } catch (requestError) {
      setGoogleError(requestError instanceof Error ? requestError.message : 'État Google Calendar indisponible.')
      return null
    }
  }, [])

  useEffect(() => {
    let active = true
    const initialize = async () => {
      const next = await refresh()
      if (!active || localStorage.getItem(LEGACY_MIGRATION_KEY)) return
      try {
        const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '[]')
        if (Array.isArray(legacy) && legacy.length) {
          const result = await studioApi.calendarImportLegacy(legacy)
          if (active) {
            const imported = extractSnapshot(result)
            if (imported) setSnapshot(imported)
            else await refresh()
            setNotice(`${legacy.length} ancienne${legacy.length > 1 ? 's' : ''} tâche${legacy.length > 1 ? 's' : ''} récupérée${legacy.length > 1 ? 's' : ''}.`)
          }
        }
        localStorage.setItem(LEGACY_MIGRATION_KEY, new Date().toISOString())
      } catch {
        if (!next) setError('Les anciennes tâches n’ont pas pu être relues. Elles restent intactes dans le stockage précédent.')
      }
    }
    initialize()
    const unsubscribe = studioApi.onCalendarUpdated?.(() => refresh()) || (() => {})
    return () => { active = false; unsubscribe() }
  }, [refresh])

  useEffect(() => {
    refreshGoogleStatus()
    return studioApi.onGoogleCalendarChanged?.((next) => {
      if (next) setGoogleStatus((current) => ({ ...current, ...next }))
    }) || (() => {})
  }, [refreshGoogleStatus])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!openItemId || loading) return
    const item = snapshot.items.find((entry) => entry.id === openItemId)
    if (item) {
      const form = formFromItem(item)
      setSelectedDate(form.startDate)
      setDetails({ ...item, itemId: item.id, occurrenceId: `notification-${item.id}` })
    }
    onOpenItemHandled()
  }, [loading, onOpenItemHandled, openItemId, snapshot.items])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (editor || details || reminderSettingsOpen || googleSettingsOpen || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        setEditor({ mode: 'create', form: createDefaultForm(selectedDate), key: `create-${Date.now()}` })
      }
      if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 't') {
        event.preventDefault()
        setSelectedDate(localDateKey())
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [details, editor, googleSettingsOpen, reminderSettingsOpen, selectedDate])

  const weekDays = useMemo(() => weekDateKeys(selectedDate), [selectedDate])
  const monthDays = useMemo(() => monthGridDateKeys(selectedDate), [selectedDate])
  const weekStart = weekDays[0]
  const weekOccurrences = useMemo(
    () => expandItemsForRange(snapshot.items, weekStart, addDaysKey(weekStart, 7)),
    [snapshot.items, weekStart],
  )
  const monthStart = monthDays[0]
  const monthOccurrences = useMemo(
    () => expandItemsForRange(snapshot.items, monthStart, addDaysKey(monthStart, 42)),
    [monthStart, snapshot.items],
  )
  const agendaOccurrences = useMemo(
    () => expandItemsForRange(snapshot.items, selectedDate, addDaysKey(selectedDate, 21)),
    [snapshot.items, selectedDate],
  )

  const applyResult = async (result, message) => {
    const next = extractSnapshot(result)
    if (next) setSnapshot(next)
    else await refresh()
    const googleCalendar = result?.googleCalendar
    if (googleCalendar?.publicStatus) setGoogleStatus((current) => ({ ...current, ...googleCalendar.publicStatus }))
    const syncSuffix = ['PENDING', 'PENDING_DELETE'].includes(googleCalendar?.status)
      ? ' Enregistré localement · synchronisation Google en attente.'
      : (googleCalendar?.status === 'SYNCED'
          ? ' Synchronisé avec Google Calendar.'
          : (googleCalendar?.status === 'DELETED' ? ' Copie Google Calendar supprimée.' : ''))
    setNotice(`${message}${syncSuffix}`)
  }

  const openCreate = (minutes = 9 * 60) => {
    setError('')
    setDetails(null)
    setEditor({ mode: 'create', form: createDefaultForm(selectedDate, minutes), key: `create-${Date.now()}` })
  }

  const openCreateOnDate = (dateKey) => {
    setSelectedDate(dateKey)
    setError('')
    setDetails(null)
    setEditor({ mode: 'create', form: createDefaultForm(dateKey), key: `create-${Date.now()}` })
  }

  const openDetails = (occurrence) => {
    const item = snapshot.items.find((entry) => entry.id === occurrence.itemId) || occurrence
    setError('')
    setDetails({ ...item, ...occurrence, itemId: item.id })
  }

  const openEdit = (occurrence) => {
    const item = snapshot.items.find((entry) => entry.id === occurrence.itemId) || occurrence
    setDetails(null)
    setError('')
    setEditor({ mode: 'edit', item, form: formFromItem(item), key: `edit-${item.id}-${Date.now()}` })
  }

  const saveEditor = async (form) => {
    setBusy(true)
    setError('')
    try {
      const input = itemInputFromForm(form)
      const result = editor.mode === 'edit'
        ? await studioApi.calendarUpdate(editor.item.id, input)
        : await studioApi.calendarCreate(input)
      await applyResult(result, editor.mode === 'edit' ? 'Élément mis à jour.' : 'Élément ajouté au calendrier.')
      setEditor(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Enregistrement impossible.')
    } finally {
      setBusy(false)
    }
  }

  const deleteItem = async (itemId, onDeleted) => {
    if (!itemId) return
    setBusy(true)
    setError('')
    try {
      const result = await studioApi.calendarDelete(itemId)
      await applyResult(result, 'Élément supprimé.')
      onDeleted()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Suppression impossible.')
    } finally {
      setBusy(false)
    }
  }

  const deleteEditor = () => deleteItem(editor?.item?.id, () => setEditor(null))
  const deleteDetails = (occurrence) => deleteItem(occurrence?.itemId || occurrence?.id, () => setDetails(null))

  const toggleComplete = async (occurrence) => {
    const nextStatus = occurrence.status === 'completed' ? 'open' : 'completed'
    try {
      const result = await studioApi.calendarUpdate(occurrence.itemId, { status: nextStatus })
      await applyResult(result, nextStatus === 'completed' ? 'Tâche terminée.' : 'Tâche rouverte.')
      setDetails(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Mise à jour impossible.')
    }
  }

  const enableNotifications = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    let settingsEnabled = false
    try {
      const result = await studioApi.calendarUpdateSettings({ desktopNotificationsEnabled: true, runInBackground: true })
      settingsEnabled = true
      await applyResult(result, 'Rappels ordinateur activés.')
      await studioApi.calendarTestNotification()
      setLastNotificationTestAt(new Date().toISOString())
      setNotice('Rappels activés et notification test affichée.')
    } catch (requestError) {
      if (settingsEnabled) {
        try {
          const rollback = await studioApi.calendarUpdateSettings({ desktopNotificationsEnabled: false, runInBackground: false })
          const next = extractSnapshot(rollback)
          if (next) setSnapshot(next)
        } catch {
          // Le prochain rafraîchissement relira l'état réel si le rollback échoue.
        }
      }
      setError(requestError instanceof Error ? requestError.message : 'Les notifications ne peuvent pas être activées sur cet appareil.')
    } finally {
      setBusy(false)
    }
  }

  const disableNotifications = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await studioApi.calendarUpdateSettings({ desktopNotificationsEnabled: false, runInBackground: false })
      await applyResult(result, 'Rappels ordinateur désactivés.')
      setLastNotificationTestAt(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Les notifications ne peuvent pas être désactivées sur cet appareil.')
    } finally {
      setBusy(false)
    }
  }

  const testNotifications = async () => {
    setBusy(true)
    setError('')
    try {
      await studioApi.calendarTestNotification()
      setLastNotificationTestAt(new Date().toISOString())
      setNotice('Notification test affichée.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'La notification test n’a pas pu être affichée.')
    } finally {
      setBusy(false)
    }
  }

  const openReminderSettings = () => {
    setDetails(null)
    setGoogleSettingsOpen(false)
    setReminderSettingsOpen(true)
  }

  const runGoogleAction = async (action, successMessage) => {
    setGoogleBusy(true)
    setGoogleError('')
    try {
      const result = await action()
      const next = result?.publicStatus || result
      if (next && !next.cancelled) {
        setGoogleStatus((current) => ({ ...current, ...next }))
        if (successMessage) setNotice(successMessage)
      }
      return next
    } catch (requestError) {
      setGoogleError(requestError instanceof Error ? requestError.message : 'Opération Google Calendar impossible.')
      return null
    } finally {
      setGoogleBusy(false)
    }
  }

  const openGoogleSettings = () => {
    setDetails(null)
    setReminderSettingsOpen(false)
    setGoogleError('')
    setGoogleSettingsOpen(true)
    refreshGoogleStatus()
  }

  const shiftPeriod = (amount) => {
    setSelectedDate((current) => viewMode === 'month'
      ? addMonthsKey(current, amount)
      : addDaysKey(startOfWeekKey(current), amount * 7))
  }
  const visibleOccurrences = viewMode === 'month' ? monthOccurrences : weekOccurrences
  const periodLabel = viewMode === 'month' ? formatMonthLabel(selectedDate) : formatWeekRange(weekDays)
  const previousPeriodLabel = viewMode === 'month' ? 'Mois précédent' : 'Semaine précédente'
  const nextPeriodLabel = viewMode === 'month' ? 'Mois suivant' : 'Semaine suivante'
  const notificationsEnabled = Boolean(snapshot.settings?.desktopNotificationsEnabled)

  return (
    <section className="workspace-page calendar-page">
      <header className="calendar-toolbar">
        <div className="calendar-title-block">
          <span className="workspace-kicker"><CalendarDays size={15} /> Organisation du studio</span>
          <h1>Calendrier</h1>
        </div>
        <div className="calendar-period-controls" aria-label="Navigation temporelle">
          <button type="button" aria-label={previousPeriodLabel} onClick={() => shiftPeriod(-1)}><ChevronLeft size={18} /></button>
          <button className="calendar-today-button" type="button" onClick={() => setSelectedDate(localDateKey())}>Aujourd’hui</button>
          <button type="button" aria-label={nextPeriodLabel} onClick={() => shiftPeriod(1)}><ChevronRight size={18} /></button>
          <div className="calendar-period-label" aria-live="polite">{periodLabel}</div>
        </div>
        <div className="calendar-toolbar-actions">
          <div className="calendar-view-switch" role="group" aria-label="Vue du calendrier">
            <button className={viewMode === 'month' ? 'is-active' : ''} type="button" aria-pressed={viewMode === 'month'} onClick={() => setViewMode('month')}>Mois</button>
            <button className={viewMode === 'week' ? 'is-active' : ''} type="button" aria-pressed={viewMode === 'week'} onClick={() => setViewMode('week')}>Semaine</button>
          </div>
          <button
            className={`calendar-google-toggle ${googleStatus.connected ? 'is-connected' : ''}`}
            type="button"
            disabled={googleBusy}
            onClick={openGoogleSettings}
            aria-label={googleStatus.connected ? 'Google Calendar connecté' : 'Configurer Google Calendar'}
          >
            <CalendarSync size={16} />
            <span>{googleStatus.connected ? 'Google connecté' : 'Google Calendar'}</span>
          </button>
          <button className={`calendar-notification-toggle ${notificationsEnabled ? 'is-enabled' : ''}`} type="button" disabled={busy} onClick={openReminderSettings}>
            {notificationsEnabled ? <BellRing size={16} /> : <BellOff size={16} />}
            <span>{notificationsEnabled ? 'Rappels actifs' : 'Activer les rappels'}</span>
          </button>
          <button className="primary-action" type="button" onClick={() => openCreate()}><Plus size={17} /> Nouvel événement</button>
        </div>
      </header>

      {error ? <div className="calendar-status is-error" role="alert">{error}<button type="button" onClick={() => { setError(''); refresh() }}>Réessayer</button></div> : null}
      {notice ? <div className="calendar-status is-success" role="status">{notice}</div> : null}

      {loading ? (
        <div className="calendar-loading" aria-label="Chargement du calendrier"><i /><span>Chargement du calendrier…</span></div>
      ) : (
        <>
          {viewMode === 'month' ? (
            <MonthGrid
              days={monthDays}
              monthKey={selectedDate}
              occurrences={monthOccurrences}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onCreateOnDate={openCreateOnDate}
              onEditOccurrence={openDetails}
            />
          ) : (
            <WeekStrip days={weekDays} occurrences={weekOccurrences} selectedDate={selectedDate} onSelectDate={setSelectedDate} onEditOccurrence={openDetails} />
          )}
          <div className="calendar-workspace">
            <DayTimeline dateKey={selectedDate} occurrences={visibleOccurrences} onCreateAt={openCreate} onEditOccurrence={openDetails} />
            <UpcomingAgenda occurrences={agendaOccurrences} onEditOccurrence={openDetails} onToggleComplete={toggleComplete} />
          </div>
        </>
      )}

      {details ? (
        <EventDetails
          occurrence={details}
          notificationsEnabled={notificationsEnabled}
          googleCalendarConnected={googleStatus.connected}
          busy={busy}
          deleteError={error}
          onClose={() => setDetails(null)}
          onDelete={deleteDetails}
          onEdit={openEdit}
          onOpenReminderSettings={openReminderSettings}
          onToggleComplete={toggleComplete}
        />
      ) : null}

      {reminderSettingsOpen ? (
        <ReminderSettings
          enabled={notificationsEnabled}
          busy={busy}
          lastTestAt={lastNotificationTestAt}
          onClose={() => setReminderSettingsOpen(false)}
          onEnable={enableNotifications}
          onDisable={disableNotifications}
          onTest={testNotifications}
        />
      ) : null}

      {googleSettingsOpen ? (
        <GoogleCalendarSettings
          status={googleStatus}
          busy={googleBusy}
          error={googleError}
          onClose={() => setGoogleSettingsOpen(false)}
          onChooseCredentials={() => runGoogleAction(studioApi.googleCalendarChooseCredentials, 'Client Google Calendar configuré.')}
          onConnect={() => runGoogleAction(studioApi.googleCalendarConnect, 'Google Calendar connecté et calendrier synchronisé.')}
          onDisconnect={() => runGoogleAction(studioApi.googleCalendarDisconnect, 'Google Calendar déconnecté. Les événements déjà copiés restent dans Google.')}
          onSync={() => runGoogleAction(studioApi.googleCalendarSync, 'Google Calendar synchronisé.')}
        />
      ) : null}

      {editor ? (
        <EventEditor
          key={editor.key}
          mode={editor.mode}
          initialForm={editor.form}
          itemTitle={editor.item?.title || ''}
          busy={busy}
          externalError={error}
          onCancel={() => setEditor(null)}
          onDelete={deleteEditor}
          onSave={saveEditor}
        />
      ) : null}
    </section>
  )
}
