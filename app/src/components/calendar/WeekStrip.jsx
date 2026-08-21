import { CalendarRange, Flag, Repeat2 } from 'lucide-react'
import { formatAgendaDay, layoutAllDayBars, localDateKey, occurrenceOverlapsDay } from './calendarModel.js'

const weekdayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' })

const RailIcon = ({ kind }) => kind === 'milestone' || kind === 'deadline'
  ? <Flag size={12} aria-hidden="true" />
  : <CalendarRange size={12} aria-hidden="true" />

export default function WeekStrip({ days, occurrences, selectedDate, onSelectDate, onEditOccurrence }) {
  const { bars, laneCount } = layoutAllDayBars(occurrences, days)
  const todayKey = localDateKey()

  const onDayKeyDown = (event, index) => {
    let target = null
    if (event.key === 'ArrowLeft') target = Math.max(0, index - 1)
    if (event.key === 'ArrowRight') target = Math.min(6, index + 1)
    if (event.key === 'Home') target = 0
    if (event.key === 'End') target = 6
    if (target === null) return
    event.preventDefault()
    onSelectDate(days[target])
    requestAnimationFrame(() => document.getElementById(`calendar-day-${days[target]}`)?.focus())
  }

  return (
    <section className="calendar-week-shell" aria-label="Semaine sélectionnée">
      <div className="calendar-week-grid" role="grid" aria-label="Jours de la semaine">
        {days.map((day, index) => {
          const count = occurrences.filter((occurrence) => occurrenceOverlapsDay(occurrence, day)).length
          const isSelected = selectedDate === day
          const isToday = todayKey === day
          const date = new Date(`${day}T12:00:00`)
          const weekday = weekdayFormatter.format(date).replace('.', '').toUpperCase()
          return (
            <button
              id={`calendar-day-${day}`}
              className={`calendar-day-button ${isSelected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''}`}
              key={day}
              type="button"
              role="gridcell"
              tabIndex={isSelected ? 0 : -1}
              aria-pressed={isSelected}
              aria-label={`${formatAgendaDay(day)}${count ? `, ${count} élément${count > 1 ? 's' : ''}` : ', aucun élément'}`}
              onClick={() => onSelectDate(day)}
              onKeyDown={(event) => onDayKeyDown(event, index)}
            >
              <span>{weekday}</span>
              <strong>{date.getDate()}</strong>
              <small className={count ? 'has-items' : ''}><i aria-hidden="true" /> {count > 9 ? '9+' : count}</small>
            </button>
          )
        })}
      </div>

      <div className="calendar-all-day-rail" style={{ '--calendar-rail-lanes': laneCount }}>
        <div className="calendar-all-day-label"><span>Toute la journée</span></div>
        <div className="calendar-all-day-grid">
          {bars.length === 0 ? <span className="calendar-rail-empty">Aucun élément sur plusieurs jours</span> : null}
          {bars.map(({ occurrence, startIndex, endIndex, lane }) => (
            <button
              className={`calendar-span calendar-project-${occurrence.project.color} ${occurrence.status === 'completed' ? 'is-completed' : ''}`}
              key={occurrence.occurrenceId}
              type="button"
              style={{ gridColumn: `${startIndex + 1} / ${Math.min(8, endIndex + 1)}`, gridRow: lane + 1 }}
              title={`${occurrence.title} — ${occurrence.project.label}`}
              onClick={() => onEditOccurrence(occurrence)}
            >
              <RailIcon kind={occurrence.kind} />
              <span>{occurrence.title}</span>
              {occurrence.recurrence?.frequency && occurrence.recurrence.frequency !== 'none' ? <Repeat2 size={11} aria-label="Récurrent" /> : null}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
