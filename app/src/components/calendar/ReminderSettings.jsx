import { useEffect, useId, useRef } from 'react'
import { Bell, BellOff, BellRing, CheckCircle2, Monitor, Play, X } from 'lucide-react'

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

const formatTestTime = (value) => value ? new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
}).format(new Date(value)) : ''

export default function ReminderSettings({
  enabled,
  busy = false,
  lastTestAt = null,
  onClose,
  onEnable,
  onDisable,
  onTest,
}) {
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const titleId = useId()

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
      <section className="calendar-reminder-settings" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header>
          <span className={enabled ? 'is-enabled' : ''}>{enabled ? <BellRing size={19} /> : <BellOff size={19} />}</span>
          <div><small>Calendrier</small><h2 id={titleId}>Rappels ordinateur</h2></div>
          <button ref={closeRef} type="button" aria-label="Fermer les réglages de rappels" onClick={onClose}><X size={19} /></button>
        </header>

        <div className="calendar-reminder-settings-body">
          <div className={`calendar-reminder-health ${enabled ? 'is-enabled' : ''}`}>
            {enabled ? <CheckCircle2 size={18} /> : <Bell size={18} />}
            <div>
              <strong>{enabled ? 'Les rappels sont actifs' : 'Les rappels sont désactivés'}</strong>
              <span>{enabled ? 'Noblesse Studio surveille les échéances enregistrées.' : 'Aucune notification ne sera envoyée par l’ordinateur.'}</span>
            </div>
          </div>

          <div className="calendar-reminder-explanation">
            <Monitor size={18} />
            <p>L’application reste discrètement ouverte en arrière-plan après la fermeture de sa fenêtre. Le PC doit être allumé pour afficher un rappel.</p>
          </div>

          {lastTestAt ? <p className="calendar-reminder-test-ok" role="status"><CheckCircle2 size={14} /> Notification test affichée à {formatTestTime(lastTestAt)}</p> : null}
        </div>

        <footer>
          {enabled ? <button className="calendar-reminder-disable" type="button" disabled={busy} onClick={onDisable}>Désactiver</button> : <span />}
          <div>
            <button className="secondary-action" type="button" onClick={onClose}>Fermer</button>
            <button className="primary-action" type="button" disabled={busy} onClick={enabled ? onTest : onEnable}>
              {enabled ? <><Play size={15} /> {busy ? 'Test…' : 'Tester maintenant'}</> : <><BellRing size={15} /> {busy ? 'Activation…' : 'Activer les rappels'}</>}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
