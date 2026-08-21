import { useMemo } from 'react'
import { Bell, Clock3 } from 'lucide-react'
import {
  isRailOccurrence,
  layoutAllDayBars,
  localDateKey,
  occurrenceOverlapsDay,
} from './calendarModel.js'

const WEEKDAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const MAX_RAIL_LANES = 2
const MAX_TIMED_ITEMS = 2

const projectClass = (occurrence) => `calendar-project-${occurrence.project?.color || 'silver'}`

const timeLabel = (occurrence) => {
  if (occurrence.time.kind === 'allDay') return 'Toute la journée'
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(occurrence.time.start))
}

const sortForDay = (left, right) => {
  if (left.time.kind === 'allDay' && right.time.kind !== 'allDay') return -1
  if (left.time.kind !== 'allDay' && right.time.kind === 'allDay') return 1
  const leftStart = left.time.kind === 'allDay' ? left.time.startDate : left.time.start
  const rightStart = right.time.kind === 'allDay' ? right.time.startDate : right.time.start
  return leftStart.localeCompare(rightStart)
}

export default function MonthGrid({
  days,
  monthKey,
  occurrences,
  selectedDate,
  onSelectDate,
  onCreateOnDate,
  onEditOccurrence,
}) {
  const todayKey = localDateKey()
  const currentMonth = monthKey.slice(0, 7)
  const occurrencesByDay = useMemo(() => {
    const byDay = new Map()
    for (const day of days) {
      byDay.set(day, occurrences.filter((occurrence) => occurrenceOverlapsDay(occurrence, day)).sort(sortForDay))
    }
    return byDay
  }, [days, occurrences])

  const weeks = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const weekDays = days.slice(index * 7, index * 7 + 7)
    const weekOccurrences = occurrences.filter((occurrence) => weekDays.some((day) => occurrenceOverlapsDay(occurrence, day)))
    return { days: weekDays, layout: layoutAllDayBars(weekOccurrences, weekDays) }
  }), [days, occurrences])

  const moveSelection = (event, day) => {
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    let target = null
    if (event.key in offsets) target = days[days.indexOf(day) + offsets[event.key]]
    if (event.key === 'Home') target = days[Math.floor(days.indexOf(day) / 7) * 7]
    if (event.key === 'End') target = days[Math.floor(days.indexOf(day) / 7) * 7 + 6]
    if (!target) return
    event.preventDefault()
    onSelectDate(target)
    window.requestAnimationFrame(() => document.querySelector(`[data-calendar-date="${target}"]`)?.focus())
  }

  return (
    <section className="calendar-month-shell" aria-label={`Mois de ${monthKey.slice(0, 7)}`}>
      <div className="calendar-month-weekdays" role="row">
        {WEEKDAY_LABELS.map((label) => <span key={label} role="columnheader">{label}</span>)}
      </div>
      <div className="calendar-month-grid" role="grid" aria-label="Calendrier mensuel">
        {weeks.map((week, weekIndex) => {
          const visibleBars = week.layout.bars.filter((bar) => bar.lane < MAX_RAIL_LANES)
          return (
            <div className="calendar-month-week" role="row" key={week.days[0]}>
              <div className="calendar-month-cells">
                {week.days.map((day) => {
                  const dayOccurrences = occurrencesByDay.get(day) || []
                  const timedOccurrences = dayOccurrences.filter((occurrence) => !isRailOccurrence(occurrence))
                  const visibleTimed = timedOccurrences.slice(0, MAX_TIMED_ITEMS)
                  const visibleRailCount = visibleBars.filter((bar) => occurrenceOverlapsDay(bar.occurrence, day)).length
                  const hiddenCount = Math.max(0, dayOccurrences.length - visibleRailCount - visibleTimed.length)
                  const isSelected = selectedDate === day
                  const isToday = todayKey === day
                  const isOutside = day.slice(0, 7) !== currentMonth
                  return (
                    <div
                      className={`calendar-month-cell ${isSelected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''} ${isOutside ? 'is-outside' : ''}`}
                      role="gridcell"
                      aria-selected={isSelected}
                      key={day}
                      onDoubleClick={() => onCreateOnDate(day)}
                    >
                      <div className="calendar-month-date-row">
                        <button
                          className="calendar-month-date"
                          type="button"
                          data-calendar-date={day}
                          tabIndex={isSelected ? 0 : -1}
                          aria-label={`${dayOccurrences.length ? `${dayOccurrences.length} élément${dayOccurrences.length > 1 ? 's' : ''}, ` : ''}${day}`}
                          onClick={() => onSelectDate(day)}
                          onKeyDown={(event) => moveSelection(event, day)}
                        >
                          {Number(day.slice(-2))}
                        </button>
                        {dayOccurrences.length ? <span className="calendar-month-count" aria-hidden="true">{dayOccurrences.length}</span> : null}
                      </div>
                      <div className="calendar-month-timed-list">
                        {visibleTimed.map((occurrence) => (
                          <button
                            className={`calendar-month-event ${projectClass(occurrence)} ${occurrence.status === 'completed' ? 'is-completed' : ''}`}
                            type="button"
                            key={occurrence.occurrenceId}
                            title={`${timeLabel(occurrence)} — ${occurrence.title}`}
                            onClick={() => onEditOccurrence(occurrence)}
                            onDoubleClick={(event) => event.stopPropagation()}
                          >
                            <Clock3 size={9} aria-hidden="true" />
                            <span>{timeLabel(occurrence)}</span>
                            <strong>{occurrence.title}</strong>
                            {occurrence.reminders?.length ? <Bell size={9} aria-label="Rappel actif" /> : null}
                          </button>
                        ))}
                        {hiddenCount ? (
                          <button className="calendar-month-more" type="button" onClick={() => onSelectDate(day)} onDoubleClick={(event) => event.stopPropagation()}>
                            + {hiddenCount} autre{hiddenCount > 1 ? 's' : ''}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="calendar-month-span-layer" aria-label={`Périodes de la semaine ${weekIndex + 1}`}>
                {visibleBars.map((bar) => (
                  <button
                    className={`calendar-month-span ${projectClass(bar.occurrence)} ${bar.occurrence.status === 'completed' ? 'is-completed' : ''}`}
                    type="button"
                    key={bar.occurrence.occurrenceId}
                    style={{
                      gridColumn: `${bar.startIndex + 1} / ${bar.endIndex + 1}`,
                      gridRow: bar.lane + 1,
                    }}
                    title={`${timeLabel(bar.occurrence)} — ${bar.occurrence.title}`}
                    onClick={() => onEditOccurrence(bar.occurrence)}
                  >
                    <span>{bar.occurrence.title}</span>
                    {bar.occurrence.reminders?.length ? <Bell size={9} aria-label="Rappel actif" /> : null}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <p className="calendar-month-help">Clique sur un jour pour ouvrir son planning détaillé. Double-clique pour ajouter un événement.</p>
    </section>
  )
}
