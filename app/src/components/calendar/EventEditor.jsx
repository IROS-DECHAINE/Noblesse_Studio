import { useEffect, useId, useRef, useState } from 'react'
import { Bell, CalendarClock, CheckSquare2, Clock3, Focus, Flag, Link2, Mail, MapPin, Plus, Repeat2, Trash2, Users, X } from 'lucide-react'
import { CALENDAR_PROJECTS, CALENDAR_TIME_ZONE, KIND_LABELS, REMINDER_PRESETS, validateForm } from './calendarModel.js'

const KINDS = [
  { id: 'event', icon: Users },
  { id: 'task', icon: CheckSquare2 },
  { id: 'deadline', icon: Flag },
  { id: 'focus', icon: Focus },
]

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function EventEditor({ mode, initialForm, itemTitle, busy, externalError, onCancel, onDelete, onSave }) {
  const dialogRef = useRef(null)
  const titleRef = useRef(null)
  const titleId = useId()
  const [form, setForm] = useState(initialForm)
  const [error, setError] = useState('')
  const [deleteArmed, setDeleteArmed] = useState(false)

  useEffect(() => {
    const previousFocus = document.activeElement
    requestAnimationFrame(() => titleRef.current?.focus())
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
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
  }, [onCancel])

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  const submit = (event) => {
    event.preventDefault()
    const validationError = validateForm(form)
    if (validationError) { setError(validationError); return }
    setError('')
    onSave(form)
  }

  const addReminder = () => setForm((current) => ({
    ...current,
    reminders: [...current.reminders, current.reminders.includes(1440) ? 60 : 1440].slice(0, 5),
  }))

  const updateReminder = (index, value) => setForm((current) => ({
    ...current,
    reminders: current.reminders.map((reminder, reminderIndex) => reminderIndex === index ? Number(value) : reminder),
  }))

  const removeReminder = (index) => setForm((current) => ({
    ...current,
    reminders: current.reminders.filter((_, reminderIndex) => reminderIndex !== index),
  }))

  const requestDelete = () => {
    if (!deleteArmed) {
      setDeleteArmed(true)
      return
    }
    onDelete()
  }

  return (
    <div className="calendar-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <section className="calendar-editor" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="calendar-editor-header">
          <div><CalendarClock size={19} /><h2 id={titleId}>{mode === 'edit' ? 'Modifier l’élément' : 'Nouvel événement'}</h2></div>
          <button type="button" aria-label="Fermer" onClick={onCancel}><X size={20} /></button>
        </header>

        <form onSubmit={submit}>
          <div className="calendar-kind-tabs" role="radiogroup" aria-label="Type d’élément">
            {KINDS.map(({ id, icon: Icon }) => (
              <button className={form.kind === id ? 'is-active' : ''} key={id} type="button" role="radio" aria-checked={form.kind === id} onClick={() => update('kind', id)}>
                <Icon size={15} /><span>{KIND_LABELS[id]}</span>
              </button>
            ))}
          </div>

          <label className="calendar-field calendar-field-title">
            <span>Titre</span>
            <input ref={titleRef} value={form.title} maxLength={160} placeholder="Ex. Revue du build PrimeBot" onChange={(event) => update('title', event.target.value)} />
          </label>

          <label className="calendar-field">
            <span>Projet</span>
            <select value={form.projectId} onChange={(event) => update('projectId', event.target.value)}>
              {CALENDAR_PROJECTS.map((project) => <option key={project.id} value={project.id}>{project.label}</option>)}
            </select>
          </label>

          <div className="calendar-editor-dates">
            <fieldset>
              <legend>Début</legend>
              <input aria-label="Date de début" type="date" value={form.startDate} onChange={(event) => update('startDate', event.target.value)} />
              {!form.allDay ? <input aria-label="Heure de début" type="time" step="900" value={form.startTime} onChange={(event) => update('startTime', event.target.value)} /> : null}
            </fieldset>
            <fieldset>
              <legend>Fin</legend>
              <input aria-label="Date de fin" type="date" value={form.endDate} min={form.startDate} onChange={(event) => update('endDate', event.target.value)} />
              {!form.allDay ? <input aria-label="Heure de fin" type="time" step="900" value={form.endTime} onChange={(event) => update('endTime', event.target.value)} /> : null}
            </fieldset>
          </div>

          <label className="calendar-toggle-row">
            <input type="checkbox" checked={form.allDay} onChange={(event) => update('allDay', event.target.checked)} />
            <i aria-hidden="true" /><span>Toute la journée</span>
          </label>

          <div className="calendar-editor-pair">
            <label className="calendar-field">
              <span><Repeat2 size={12} /> Récurrence</span>
              <select value={form.recurrence} onChange={(event) => update('recurrence', event.target.value)}>
                <option value="none">Ne se répète pas</option>
                <option value="daily">Tous les jours</option>
                <option value="weekly">Toutes les semaines</option>
                <option value="monthly">Tous les mois</option>
                <option value="yearly">Tous les ans</option>
              </select>
            </label>
            <label className="calendar-field">
              <span><Clock3 size={12} /> Fuseau horaire</span>
              <select value={form.timeZone} onChange={(event) => update('timeZone', event.target.value)}>
                <option value={CALENDAR_TIME_ZONE}>Europe/Paris</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">America/New_York</option>
                <option value="Asia/Tokyo">Asia/Tokyo</option>
              </select>
            </label>
          </div>

          {form.recurrence !== 'none' ? (
            <label className="calendar-field calendar-field-compact">
              <span>Fin de la récurrence (facultatif)</span>
              <input type="date" min={form.startDate} value={form.recurrenceUntil} onChange={(event) => update('recurrenceUntil', event.target.value)} />
            </label>
          ) : null}

          <label className="calendar-field calendar-field-icon">
            <span><MapPin size={12} /> Lieu ou lien</span>
            <div><Link2 size={15} /><input value={form.location} maxLength={300} placeholder="Ajouter un lieu ou un lien" onChange={(event) => update('location', event.target.value)} /></div>
          </label>

          <label className="calendar-field">
            <span>Notes</span>
            <textarea value={form.notes} maxLength={4000} placeholder="Ajouter des notes…" onChange={(event) => update('notes', event.target.value)} />
          </label>

          <fieldset className="calendar-reminders">
            <legend>Rappels</legend>
            {form.reminders.map((reminder, index) => (
              <div className="calendar-reminder-row" key={`${index}-${reminder}`}>
                <span><Bell size={15} /> Notification ordinateur</span>
                <select aria-label={`Délai du rappel ${index + 1}`} value={reminder} onChange={(event) => updateReminder(index, event.target.value)}>
                  {REMINDER_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
                </select>
                <button type="button" aria-label={`Supprimer le rappel ${index + 1}`} onClick={() => removeReminder(index)}><X size={16} /></button>
              </div>
            ))}
            {form.reminders.length < 5 ? <button className="calendar-add-reminder" type="button" onClick={addReminder}><Plus size={15} /> Ajouter un rappel</button> : null}
            <div className="calendar-email-unavailable" aria-disabled="true"><Mail size={15} /><span>E-mail — connexion requise</span><small>Un fournisseur vérifié sera nécessaire.</small></div>
          </fieldset>

          {error || externalError ? <p className="calendar-form-error" role="alert">{error || externalError}</p> : null}

          <footer className="calendar-editor-actions">
            {mode === 'edit' ? (
              <button
                className={`calendar-delete-action ${deleteArmed ? 'is-armed' : ''}`}
                type="button"
                disabled={busy}
                aria-label={deleteArmed ? `Confirmer la suppression de ${itemTitle}` : `Supprimer ${itemTitle}`}
                onClick={requestDelete}
              >
                <Trash2 size={16} /> {deleteArmed ? 'Confirmer la suppression' : 'Supprimer'}
              </button>
            ) : <span />}
            <div>
              <button className="secondary-action" type="button" disabled={busy} onClick={onCancel}>Annuler</button>
              <button className="primary-action" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  )
}
