import { useEffect, useId, useRef } from 'react'
import {
  Bell,
  CalendarDays,
  CalendarSync,
  ChevronRight,
  MapPin,
  Plus,
  Repeat2,
  X,
} from 'lucide-react'
import {
  formatDayHeading,
  formatOccurrencePeriod,
  KIND_LABELS,
  projectMeta,
  RECURRENCE_LABELS,
} from './calendarModel.js'

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

const capitalize = (value) => value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : ''

const reminderCountLabel = (count) => `${count} rappel${count > 1 ? 's' : ''}`

export default function DayAgendaDialog({
  dateKey,
  occurrences,
  googleCalendarConnected = false,
  onClose,
  onCreate,
  onOpenOccurrence,
}) {
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const titleId = useId()
  const count = occurrences.length

  useEffect(() => {
    const previousFocus = document.activeElement
    requestAnimationFrame(() => closeRef.current?.focus())
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
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
      <section className="calendar-day-agenda-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="calendar-day-agenda-header">
          <span className="calendar-day-agenda-icon"><CalendarDays size={19} /></span>
          <div>
            <span>Planning de la journée</span>
            <h2 id={titleId}>{capitalize(formatDayHeading(dateKey))}</h2>
            <p>
              {count ? `${count} rendez-vous enregistré${count > 1 ? 's' : ''}` : 'Aucun rendez-vous enregistré'}
              {googleCalendarConnected ? <small><CalendarSync size={12} /> Google Calendar connecté</small> : null}
            </p>
          </div>
          <button ref={closeRef} type="button" aria-label="Fermer le planning de la journée" onClick={onClose}><X size={19} /></button>
        </header>

        <div className="calendar-day-agenda-body">
          {count ? (
            <ul className="calendar-day-agenda-list">
              {occurrences.map((occurrence) => {
                const project = projectMeta(occurrence.projectId)
                const recurrence = occurrence.recurrence?.frequency || 'none'
                const reminderCount = occurrence.reminders?.length || 0
                return (
                  <li className={`calendar-project-${project.color} ${occurrence.status === 'completed' ? 'is-completed' : ''}`} key={occurrence.occurrenceId}>
                    <button type="button" aria-label={`Voir le détail de ${occurrence.title}`} onClick={() => onOpenOccurrence(occurrence)}>
                      <span className="calendar-day-agenda-item-period">{formatOccurrencePeriod(occurrence)}</span>
                      <span className="calendar-day-agenda-item-main">
                        <strong>{occurrence.title}</strong>
                        <span className={`calendar-day-agenda-item-description ${occurrence.notes ? '' : 'is-empty'}`}>
                          {occurrence.notes || 'Aucune description ajoutée.'}
                        </span>
                        <span className="calendar-day-agenda-item-meta">
                          <span>{KIND_LABELS[occurrence.kind] || 'Événement'}</span>
                          <span className="calendar-day-agenda-project">{project.label}</span>
                          {occurrence.location ? <span><MapPin size={12} /> {occurrence.location}</span> : null}
                          {reminderCount ? <span><Bell size={12} /> {reminderCountLabel(reminderCount)}</span> : null}
                          {recurrence !== 'none' ? <span><Repeat2 size={12} /> {RECURRENCE_LABELS[recurrence]}</span> : null}
                        </span>
                      </span>
                      <ChevronRight size={18} aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="calendar-day-agenda-empty">
              <CalendarDays size={32} />
              <strong>La journée est libre</strong>
              <span>Ajoute un rendez-vous, une tâche ou un bloc de travail.</span>
            </div>
          )}
        </div>

        <footer className="calendar-day-agenda-actions">
          <button className="secondary-action" type="button" onClick={onClose}>Fermer</button>
          <button className="primary-action" type="button" onClick={onCreate}><Plus size={16} /> Ajouter un rendez-vous</button>
        </footer>
      </section>
    </div>
  )
}
