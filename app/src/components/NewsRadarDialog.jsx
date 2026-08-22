import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, Newspaper, Radio, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { studioApi } from '../lib/desktopApi.js'
import './news-radar.css'

const TOPICS_KEY = 'noblesse-studio:news-radar-topics:v1'
const TOPICS = Object.freeze([
  { id: 'unreal', label: 'Unreal / UEFN' },
  { id: 'roblox', label: 'Roblox Studio' },
  { id: 'epic-status', label: 'État Epic' },
])
const EMPTY_SNAPSHOT = {
  schemaVersion: 1,
  available: false,
  refreshedAt: null,
  stale: true,
  items: [],
  sources: [],
  error: '',
}
const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

const readTopics = () => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(TOPICS_KEY) || 'null')
    const valid = Array.isArray(stored) ? stored.filter((id) => TOPICS.some((topic) => topic.id === id)) : []
    return new Set(valid.length ? valid : TOPICS.map((topic) => topic.id))
  } catch {
    return new Set(TOPICS.map((topic) => topic.id))
  }
}

const formatDate = (value) => {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Date inconnue'
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date)
}

export default function NewsRadarDialog({ onClose }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const titleId = useId()
  const [topics, setTopics] = useState(readTopics)
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = async (force = false) => {
    if (force) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const next = await studioApi.newsRadarSnapshot(force)
      if (next) setSnapshot((current) => ({ ...current, ...next, items: Array.isArray(next.items) ? next.items : [], sources: Array.isArray(next.sources) ? next.sources : [] }))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Le Radar gaming est momentanément indisponible.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load(false) }, [])
  useEffect(() => { window.localStorage.setItem(TOPICS_KEY, JSON.stringify([...topics])) }, [topics])
  useEffect(() => {
    const previousFocus = document.activeElement
    requestAnimationFrame(() => closeRef.current?.focus())
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab') return
      const focusable = [...(dialogRef.current?.querySelectorAll(FOCUSABLE) || [])]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus?.focus?.() }
  }, [onClose])

  const visibleItems = useMemo(() => snapshot.items.filter((item) => topics.has(item.topic)).slice(0, 9), [snapshot.items, topics])
  const healthySources = snapshot.sources.filter((source) => source.ok).length
  const toggleTopic = (topicId) => setTopics((current) => {
    const next = new Set(current)
    if (next.has(topicId)) next.delete(topicId)
    else next.add(topicId)
    return next
  })

  return (
    <div className="news-radar-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="news-radar-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header>
          <span><Radio size={20} /></span>
          <div><small>Veille ciblée</small><h2 id={titleId}>Radar gaming</h2></div>
          <button ref={closeRef} type="button" aria-label="Fermer le Radar gaming" onClick={onClose}><X size={19} /></button>
        </header>

        <div className="news-radar-body">
          <div className="news-radar-intro">
            <Newspaper size={19} />
            <div><strong>Les news utiles, seulement quand tu les demandes</strong><span>Le tableau de bord reste léger. Choisis ici les sujets qui comptent pour le studio.</span></div>
          </div>

          <div className="news-radar-topics" role="group" aria-label="Sujets suivis">
            {TOPICS.map((topic) => (
              <button key={topic.id} className={topics.has(topic.id) ? 'is-selected' : ''} type="button" aria-pressed={topics.has(topic.id)} onClick={() => toggleTopic(topic.id)}>
                {topics.has(topic.id) ? <CheckCircle2 size={13} /> : null}{topic.label}
              </button>
            ))}
          </div>

          {!snapshot.available ? (
            <div className="news-radar-unavailable"><ShieldCheck size={18} /><span>Les flux officiels sont chargés uniquement par l’application desktop. La prévisualisation web ne contacte aucune source externe.</span></div>
          ) : null}

          <div className="news-radar-source-state">
            <span>{snapshot.available ? `${healthySources}/3 sources officielles disponibles` : 'Sources en attente du desktop'}</span>
            <span>{snapshot.refreshedAt ? `Actualisé ${formatDate(snapshot.refreshedAt)}` : 'Pas encore actualisé'}</span>
            <button type="button" disabled={!snapshot.available || refreshing} onClick={() => load(true)}><RefreshCw className={refreshing ? 'is-spinning' : ''} size={13} /> {refreshing ? 'Actualisation…' : 'Actualiser'}</button>
          </div>

          {error || snapshot.error ? <p className="news-radar-error" role="alert"><AlertTriangle size={14} /> {error || snapshot.error}</p> : null}

          <div className="news-radar-feed" aria-live="polite" aria-busy={loading}>
            {loading ? <div className="news-radar-empty"><i /><strong>Lecture des sources officielles…</strong></div> : null}
            {!loading && visibleItems.map((item) => (
              <a key={item.id} className={`news-radar-item ${item.active ? 'is-active' : ''}`} href={item.url} target="_blank" rel="noreferrer">
                <div><span>{item.sourceLabel}</span>{item.active ? <b>Incident en cours</b> : null}<time dateTime={item.publishedAt || undefined}>{formatDate(item.publishedAt)}</time></div>
                <strong>{item.title}</strong>
                {item.summary ? <p>{item.summary}</p> : null}
                <ExternalLink size={14} />
              </a>
            ))}
            {!loading && !visibleItems.length ? (
              <div className="news-radar-empty"><Newspaper size={22} /><strong>{topics.size ? 'Aucune actualité disponible pour le moment.' : 'Choisis au moins un sujet ci-dessus.'}</strong></div>
            ) : null}
          </div>

          <section className="news-radar-x-lane">
            <span aria-hidden="true">𝕏</span>
            <div><strong>Compte X / Twitter non connecté</strong><p>L’API officielle X est facturée à l’usage. Le connecteur reste volontairement désactivé tant qu’un compte développeur et un budget ne sont pas validés.</p></div>
            <a href="https://developer.x.com/en/portal/dashboard" target="_blank" rel="noreferrer">Portail X <ExternalLink size={12} /></a>
          </section>
        </div>

        <footer><small>Gratuit : Unreal Engine, Roblox DevForum et état Epic Games.</small><button className="secondary-action" type="button" onClick={onClose}>Fermer</button></footer>
      </section>
    </div>
  )
}
