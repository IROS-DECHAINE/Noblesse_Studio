import { CalendarClock, Check, ChevronRight, Clock3, Flag } from 'lucide-react'
import { formatAgendaDay, formatTime, isRailOccurrence, occurrenceStartMs, projectMeta } from './calendarModel.js'

const occurrenceDay = (occurrence) => occurrence.time.kind === 'allDay'
  ? occurrence.time.startDate
  : (() => {
      const value = new Date(occurrence.time.start)
      const pad = (number) => String(number).padStart(2, '0')
      return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
    })()

export default function UpcomingAgenda({ occurrences, onEditOccurrence, onToggleComplete }) {
  const upcoming = [...occurrences]
    .sort((left, right) => occurrenceStartMs(left) - occurrenceStartMs(right))
    .slice(0, 10)

  return (
    <aside className="calendar-agenda" aria-labelledby="calendar-agenda-title">
      <header>
        <div><CalendarClock size={16} /><h2 id="calendar-agenda-title">À venir</h2></div>
        <span>{upcoming.length}</span>
      </header>
      <div className="calendar-agenda-list">
        {upcoming.length === 0 ? (
          <div className="calendar-agenda-empty"><CalendarClock size={28} /><strong>Aucun élément à venir</strong><span>Crée un rendez-vous, une tâche ou une deadline.</span></div>
        ) : upcoming.map((occurrence, index) => {
          const project = projectMeta(occurrence.projectId)
          const dateKey = occurrenceDay(occurrence)
          const previousDay = index ? occurrenceDay(upcoming[index - 1]) : ''
          return (
            <div className="calendar-agenda-group" key={occurrence.occurrenceId}>
              {dateKey !== previousDay ? <h3>{formatAgendaDay(dateKey)}</h3> : null}
              <div className={`calendar-agenda-item calendar-project-${project.color} ${occurrence.status === 'completed' ? 'is-completed' : ''}`}>
                <button
                  className="calendar-agenda-check"
                  type="button"
                  aria-label={occurrence.status === 'completed' ? `Rouvrir ${occurrence.title}` : `Terminer ${occurrence.title}`}
                  onClick={() => onToggleComplete(occurrence)}
                >
                  {occurrence.status === 'completed' ? <Check size={13} /> : occurrence.kind === 'deadline' || occurrence.kind === 'milestone' ? <Flag size={13} /> : <i />}
                </button>
                <button className="calendar-agenda-open" type="button" onClick={() => onEditOccurrence(occurrence)}>
                  <span className="calendar-agenda-time">{isRailOccurrence(occurrence) ? 'Journée' : <><Clock3 size={11} /> {formatTime(occurrence.time.start)}</>}</span>
                  <strong>{occurrence.title}</strong>
                  <small>{project.shortLabel}</small>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
