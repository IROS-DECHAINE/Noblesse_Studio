import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, CheckCircle2, Clock3, Flag, Focus, MapPin, Repeat2, Users } from 'lucide-react'
import { formatDayHeading, formatTime, localDateKey, projectMeta, timedLayoutForDay } from './calendarModel.js'

const HOUR_HEIGHT = 52
const HOURS = Array.from({ length: 25 }, (_, index) => index)

const KindIcon = ({ kind }) => {
  if (kind === 'task') return <CheckCircle2 size={12} aria-hidden="true" />
  if (kind === 'deadline' || kind === 'milestone') return <Flag size={12} aria-hidden="true" />
  if (kind === 'focus') return <Focus size={12} aria-hidden="true" />
  return <Users size={12} aria-hidden="true" />
}

export default function DayTimeline({ dateKey, occurrences, onCreateAt, onEditOccurrence }) {
  const scrollRef = useRef(null)
  const [now, setNow] = useState(() => new Date())
  const layout = useMemo(() => timedLayoutForDay(occurrences, dateKey), [dateKey, occurrences])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const firstMinute = layout[0]?.startMinute
    const targetMinute = dateKey === localDateKey(now)
      ? Math.max(0, (now.getHours() * 60) + now.getMinutes() - 90)
      : Math.max(0, (firstMinute ?? (8 * 60)) - 60)
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: (targetMinute / 60) * HOUR_HEIGHT, behavior: 'auto' }))
  }, [dateKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const onCanvasDoubleClick = (event) => {
    if (event.target.closest('.calendar-timed-event')) return
    const rect = event.currentTarget.getBoundingClientRect()
    const minute = Math.max(0, Math.min(1439, ((event.clientY - rect.top) / (24 * HOUR_HEIGHT)) * 1440))
    onCreateAt(Math.round(minute / 15) * 15)
  }

  const showNow = dateKey === localDateKey(now)
  const nowMinute = (now.getHours() * 60) + now.getMinutes()

  return (
    <section className="calendar-day-panel" aria-labelledby="calendar-day-heading">
      <header className="calendar-day-header">
        <div>
          <h2 id="calendar-day-heading">{formatDayHeading(dateKey)}</h2>
          <span>{layout.length ? `${layout.length} rendez-vous ou bloc${layout.length > 1 ? 's' : ''} horaire${layout.length > 1 ? 's' : ''}` : 'Aucun horaire — double-clique pour créer'}</span>
        </div>
        <div className="calendar-day-mode"><Clock3 size={14} /><span>Jour</span></div>
      </header>

      <div className="calendar-timeline-scroll" ref={scrollRef} tabIndex="0" aria-label={`Planning horaire du ${formatDayHeading(dateKey)}`}>
        <div className="calendar-timeline-canvas" style={{ '--hour-height': `${HOUR_HEIGHT}px` }} onDoubleClick={onCanvasDoubleClick}>
          {HOURS.map((hour) => (
            <div className="calendar-hour-rule" key={hour} style={{ top: `${hour * HOUR_HEIGHT}px` }}>
              <span>{String(hour).padStart(2, '0')}:00</span>
            </div>
          ))}

          {layout.map(({ occurrence, startMinute, durationMinutes, column, columns }) => {
            const project = projectMeta(occurrence.projectId)
            const top = (startMinute / 60) * HOUR_HEIGHT
            const height = Math.max(34, (durationMinutes / 60) * HOUR_HEIGHT)
            const width = `calc(${100 / columns}% - 8px)`
            const left = `calc(${(column * 100) / columns}% + 4px)`
            return (
              <button
                className={`calendar-timed-event calendar-project-${project.color} ${occurrence.status === 'completed' ? 'is-completed' : ''}`}
                key={occurrence.occurrenceId}
                type="button"
                style={{ top: `${top}px`, height: `${height}px`, left, width }}
                aria-label={`${occurrence.title}, ${formatTime(occurrence.time.start)} à ${formatTime(occurrence.time.end)}, ${project.label}`}
                onClick={() => onEditOccurrence(occurrence)}
              >
                <span className="calendar-event-title">{occurrence.title}</span>
                <span className="calendar-event-time">{formatTime(occurrence.time.start)} – {formatTime(occurrence.time.end)}</span>
                {height >= 50 ? (
                  <span className="calendar-event-meta"><KindIcon kind={occurrence.kind} /> {project.shortLabel}</span>
                ) : null}
                <span className="calendar-event-icons" aria-hidden="true">
                  {occurrence.location ? <MapPin size={11} /> : null}
                  {occurrence.reminders?.length ? <Bell size={11} /> : null}
                  {occurrence.recurrence?.frequency !== 'none' ? <Repeat2 size={11} /> : null}
                </span>
              </button>
            )
          })}

          {showNow ? (
            <div className="calendar-now-line" style={{ top: `${(nowMinute / 60) * HOUR_HEIGHT}px` }} aria-label={`Heure actuelle ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`}>
              <span>{String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}</span><i />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
