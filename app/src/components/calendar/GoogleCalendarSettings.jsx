import { useEffect, useId, useRef, useState } from 'react'
import { CalendarSync, CheckCircle2, Cloud, ExternalLink, FileKey2, RefreshCw, ShieldCheck, Smartphone, Unplug, X } from 'lucide-react'

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

const formatDateTime = (value) => value ? new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(value)) : 'Jamais'

export default function GoogleCalendarSettings({
  status,
  busy = false,
  error = '',
  onClose,
  onChooseCredentials,
  onConnect,
  onDisconnect,
  onSync,
}) {
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const titleId = useId()
  const [disconnectArmed, setDisconnectArmed] = useState(false)

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

  const requestDisconnect = () => {
    if (!disconnectArmed) {
      setDisconnectArmed(true)
      return
    }
    onDisconnect()
  }

  return (
    <div className="calendar-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="google-calendar-settings" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header>
          <span className={status.connected ? 'is-connected' : ''}><CalendarSync size={20} /></span>
          <div><small>Synchronisation mobile</small><h2 id={titleId}>Google Calendar</h2></div>
          <button ref={closeRef} type="button" aria-label="Fermer Google Calendar" onClick={onClose}><X size={19} /></button>
        </header>

        <div className="google-calendar-settings-body">
          <div className="google-calendar-purpose">
            <Smartphone size={20} />
            <div><strong>Les rendez-vous te suivent partout</strong><span>Chaque élément Noblesse Studio est copié dans ton agenda Google principal avec ses rappels, puis Google l’affiche sur ton téléphone et ton iPad.</span></div>
          </div>

          {!status.available ? (
            <div className="google-calendar-unavailable"><Cloud size={18} /><span>Ouvre cette fonction dans l’application desktop Noblesse Studio. Le navigateur de prévisualisation ne stocke aucun compte Google.</span></div>
          ) : null}

          {status.available && !status.configured ? (
            <section className="google-calendar-onboarding">
              <div className="google-calendar-step"><b>1</b><span>Dans Google Cloud, active l’API Google Calendar et crée un client OAuth de type <strong>Application de bureau</strong>.</span></div>
              <div className="google-calendar-step"><b>2</b><span>Télécharge le fichier JSON, puis choisis-le ici. Il sera chiffré localement par Windows.</span></div>
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Ouvrir Google Cloud <ExternalLink size={13} /></a>
              <button className="primary-action" type="button" disabled={busy} onClick={onChooseCredentials}><FileKey2 size={16} /> {busy ? 'Lecture…' : 'Choisir le fichier OAuth Google'}</button>
            </section>
          ) : null}

          {status.available && status.configured && !status.connected ? (
            <section className="google-calendar-ready">
              <ShieldCheck size={23} />
              <div><strong>Client Google prêt</strong><span>La connexion s’ouvrira dans ton navigateur. Noblesse Studio ne voit jamais ton mot de passe.</span></div>
              <button className="primary-action" type="button" disabled={busy} onClick={onConnect}><Cloud size={16} /> {busy ? 'Connexion en cours…' : 'Connecter mon compte Google'}</button>
            </section>
          ) : null}

          {status.connected ? (
            <section className="google-calendar-connected">
              <div className="google-calendar-account">
                <CheckCircle2 size={20} />
                <div><strong>{status.accountEmail || 'Compte Google connecté'}</strong><span>{status.calendarName || 'Agenda principal'} · Envoi Noblesse → Google</span></div>
              </div>
              <dl>
                <div><dt>Dernière synchronisation</dt><dd>{formatDateTime(status.lastSyncAt)}</dd></div>
                <div><dt>En attente</dt><dd>{status.pendingCount || 0}</dd></div>
              </dl>
              <p>Les modifications faites directement dans Google Calendar ne reviennent pas encore dans Noblesse Studio. Cette limite évite les conflits silencieux pour la première version.</p>
              <button className="primary-action" type="button" disabled={busy} onClick={onSync}><RefreshCw className={busy ? 'is-spinning' : ''} size={16} /> {busy ? 'Synchronisation…' : 'Synchroniser maintenant'}</button>
            </section>
          ) : null}

          {error || status.lastError ? <p className="google-calendar-error" role="alert">{error || status.lastError}</p> : null}
        </div>

        <footer>
          {status.connected ? (
            <button className={`google-calendar-disconnect ${disconnectArmed ? 'is-armed' : ''}`} type="button" disabled={busy} onClick={requestDisconnect}>
              <Unplug size={14} /> {disconnectArmed ? 'Confirmer la déconnexion' : 'Déconnecter'}
            </button>
          ) : <span />}
          <button className="secondary-action" type="button" onClick={onClose}>Fermer</button>
        </footer>
      </section>
    </div>
  )
}
