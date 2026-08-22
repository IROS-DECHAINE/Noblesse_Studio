import { useEffect, useId, useRef, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  BellOff,
  CalendarClock,
  Check,
  CircleDot,
  Clock3,
  Focus,
  Flag,
  MapPin,
  Pencil,
  Repeat2,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import {
  formatOccurrencePeriod,
  KIND_LABELS,
  projectMeta,
  RECURRENCE_LABELS,
  reminderScheduleForOccurrence,
} from './calendarModel.js'

const KIND_ICONS = {
  event: Users,
  task: Check,
  deadline: Flag,
  focus: Focus,
  milestone: CircleDot,
}

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

export default function EventDetails({
  occurrence,
  notificationsEnabled,
  googleCalendarConnected = false,
  busy = false,
  deleteError = '',
  onClose,
  onDelete,
  onEdit,
  onOpenReminderSettings,
  onToggleComplete,
}) {
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const cancelDeleteRef = useRef(null)
  const deleteConfirmationOpenRef = useRef(false)
  const titleId = useId()
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false)
  const project = projectMeta(occurrence.projectId)
  const reminders = reminderScheduleForOccurrence(occurrence)
  const KindIcon = KIND_ICONS[occurrence.kind] || CalendarClock
  const recurrence = occurrence.recurrence?.frequency || 'none'
  const canComplete = occurrence.kind === 'task'
  const deletesSeries = recurrence !== 'none'

  useEffect(() => {
    deleteConfirmationOpenRef.current = deleteConfirmationOpen
    if (deleteConfirmationOpen) requestAnimationFrame(() => cancelDeleteRef.current?.focus())
  }, [deleteConfirmationOpen])

  useEffect(() => {
    const previousFocus = document.activeElement
    requestAnimationFrame(() => closeRef.current?.focus())
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (deleteConfirmationOpenRef.current) {
          setDeleteConfirmationOpen(false)
          return
        }
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...(dialogRef.current?.querySelectorAll(FOCUSABLE) || [])]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus?.()
    }
  }, [onClose])

  return (
    <div className="calendar-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="calendar-event-detail" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="calendar-event-detail-header">
          <span className={`calendar-event-detail-kind calendar-project-${project.color}`}><KindIcon size={18} /></span>
          <div>
            <span>{KIND_LABELS[occurrence.kind] || 'Événement'} · {project.label}</span>
            <h2 id={titleId}>{occurrence.title}</h2>
          </div>
          <button ref={closeRef} type="button" aria-label="Fermer le détail" onClick={onClose}><X size={19} /></button>
        </header>

        <div className="calendar-event-detail-body">
          <div className="calendar-event-detail-period"><Clock3 size={16} /><strong>{formatOccurrencePeriod(occurrence)}</strong></div>

          {recurrence !== 'none' ? (
            <div className="calendar-event-detail-row"><Repeat2 size={15} /><span>{RECURRENCE_LABELS[recurrence] || 'Récurrent'}{occurrence.recurrence?.until ? ` · jusqu’au ${occurrence.recurrence.until}` : ''}</span></div>
          ) : null}
          {occurrence.location ? <div className="calendar-event-detail-row"><MapPin size={15} /><span>{occurrence.location}</span></div> : null}
          {occurrence.notes ? <p className="calendar-event-detail-notes">{occurrence.notes}</p> : null}

          <section className="calendar-event-detail-reminders" aria-labelledby={`${titleId}-reminders`}>
            <header>
              <div><Bell size={15} /><h3 id={`${titleId}-reminders`}>Rappels prévus</h3></div>
              <button type="button" onClick={onOpenReminderSettings}>{notificationsEnabled ? 'Tester' : 'Activer'}</button>
            </header>
            {reminders.length ? (
              <ul>
                {reminders.map((reminder) => (
                  <li className={reminder.isPast ? 'is-past' : ''} key={reminder.id}>
                    <span>{reminder.when}</span>
                    <small>{reminder.label}{reminder.isPast ? ' · passé' : ''}</small>
                  </li>
                ))}
              </ul>
            ) : <p>Aucun rappel n’est associé à cet élément.</p>}
            <div className={`calendar-event-detail-notification-state ${notificationsEnabled ? 'is-enabled' : 'is-disabled'}`}>
              {notificationsEnabled ? <Bell size={14} /> : <BellOff size={14} />}
              <span>{notificationsEnabled ? 'Notifications ordinateur actives' : 'Notifications ordinateur désactivées'}</span>
            </div>
          </section>

          {deleteConfirmationOpen ? (
            <section className="calendar-event-delete-confirmation" role="alert" aria-live="assertive">
              <span><AlertTriangle size={19} /></span>
              <div>
                <strong>{deletesSeries ? 'Supprimer toute cette série ?' : 'Supprimer cet événement ?'}</strong>
                <p>
                  {googleCalendarConnected
                    ? `Noblesse Studio supprimera ${deletesSeries ? 'la série et tous ses rappels' : 'cet événement et ses rappels'} ici et dans Google Calendar. Si Google est temporairement indisponible, sa suppression sera mise en attente.`
                    : `Noblesse Studio supprimera ${deletesSeries ? 'la série et tous ses rappels' : 'cet événement et ses rappels'} ici. Le compte Google étant déconnecté, une éventuelle ancienne copie Google restera dans Google Calendar.`}
                </p>
                {deleteError ? <p className="calendar-event-delete-error" role="alert">{deleteError}</p> : null}
                <div>
                  <button ref={cancelDeleteRef} className="secondary-action" type="button" disabled={busy} onClick={() => setDeleteConfirmationOpen(false)}>Conserver</button>
                  <button className="calendar-delete-confirm-action" type="button" disabled={busy} onClick={() => onDelete(occurrence)}>
                    <Trash2 size={15} /> {busy ? 'Suppression…' : (deletesSeries ? 'Supprimer la série' : 'Supprimer l’événement')}
                  </button>
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <footer className="calendar-event-detail-actions">
          <div className="calendar-event-detail-left-actions">
            {canComplete ? (
              <button className="secondary-action" type="button" disabled={busy} onClick={() => onToggleComplete(occurrence)}>
                <Check size={16} /> {occurrence.status === 'completed' ? 'Rouvrir' : 'Marquer terminée'}
              </button>
            ) : null}
            {!deleteConfirmationOpen ? (
              <button
                className="calendar-delete-action"
                type="button"
                disabled={busy}
                aria-label={deletesSeries ? `Supprimer toute la série ${occurrence.title}` : `Supprimer l’événement ${occurrence.title}`}
                onClick={() => setDeleteConfirmationOpen(true)}
              >
                <Trash2 size={16} /> Supprimer
              </button>
            ) : null}
          </div>
          <div>
            <button className="secondary-action" type="button" disabled={busy} onClick={onClose}>Fermer</button>
            <button className="primary-action" type="button" disabled={busy} onClick={() => onEdit(occurrence)}><Pencil size={15} /> Modifier</button>
          </div>
        </footer>
      </section>
    </div>
  )
}
