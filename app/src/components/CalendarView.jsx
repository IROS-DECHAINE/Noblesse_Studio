import { useCallback, useEffect, useMemo, useState } from 'react'
import { BellOff, BellRing, CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { studioApi } from '../lib/desktopApi.js'
import DayTimeline from './calendar/DayTimeline.jsx'
import EventEditor from './calendar/EventEditor.jsx'
import MonthGrid from './calendar/MonthGrid.jsx'
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

const extractSnapshot = (result) => result?.snapshot || (Array.isArray(result?.items) ? result : null)

export default function CalendarView({ openItemId = null, onOpenItemHandled = () => {} }) {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT)
  const [selectedDate, setSelectedDate] = useState(localDateKey)
  const [viewMode, setViewMode] = useState('month')
  const [editor, setEditor] = useState(null)
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
      setEditor({ mode: 'edit', item, form, key: `notification-${item.id}-${Date.now()}` })
    }
    onOpenItemHandled()
  }, [loading, onOpenItemHandled, openItemId, snapshot.items])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (editor || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) return
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
  }, [editor, selectedDate])

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
    setNotice(message)
  }

  const openCreate = (minutes = 9 * 60) => {
    setError('')
    setEditor({ mode: 'create', form: createDefaultForm(selectedDate, minutes), key: `create-${Date.now()}` })
  }

  const openCreateOnDate = (dateKey) => {
    setSelectedDate(dateKey)
    setError('')
    setEditor({ mode: 'create', form: createDefaultForm(dateKey), key: `create-${Date.now()}` })
  }

  const openEdit = (occurrence) => {
    const item = snapshot.items.find((entry) => entry.id === occurrence.itemId) || occurrence
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

  const deleteEditor = async () => {
    if (!editor?.item?.id) return
    setBusy(true)
    try {
      const result = await studioApi.calendarDelete(editor.item.id)
      await applyResult(result, 'Élément supprimé.')
      setEditor(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Suppression impossible.')
    } finally {
      setBusy(false)
    }
  }

  const toggleComplete = async (occurrence) => {
    const nextStatus = occurrence.status === 'completed' ? 'open' : 'completed'
    try {
      const result = await studioApi.calendarUpdate(occurrence.itemId, { status: nextStatus })
      await applyResult(result, nextStatus === 'completed' ? 'Tâche terminée.' : 'Tâche rouverte.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Mise à jour impossible.')
    }
  }

  const toggleNotifications = async () => {
    setBusy(true)
    try {
      const enabled = !snapshot.settings?.desktopNotificationsEnabled
      const result = await studioApi.calendarUpdateSettings({ desktopNotificationsEnabled: enabled, runInBackground: enabled })
      await applyResult(result, enabled ? 'Rappels ordinateur activés.' : 'Rappels ordinateur désactivés.')
      if (enabled) await studioApi.calendarTestNotification()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Les notifications ne peuvent pas être activées sur cet appareil.')
    } finally {
      setBusy(false)
    }
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
          <button className={`calendar-notification-toggle ${notificationsEnabled ? 'is-enabled' : ''}`} type="button" disabled={busy} onClick={toggleNotifications}>
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
              onEditOccurrence={openEdit}
            />
          ) : (
            <WeekStrip days={weekDays} occurrences={weekOccurrences} selectedDate={selectedDate} onSelectDate={setSelectedDate} onEditOccurrence={openEdit} />
          )}
          <div className="calendar-workspace">
            <DayTimeline dateKey={selectedDate} occurrences={visibleOccurrences} onCreateAt={openCreate} onEditOccurrence={openEdit} />
            <UpcomingAgenda occurrences={agendaOccurrences} onEditOccurrence={openEdit} onToggleComplete={toggleComplete} />
          </div>
        </>
      )}

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
