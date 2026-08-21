import { CheckCircle2, CircleAlert, FileAudio, LoaderCircle, Music2, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { studioApi } from '../lib/desktopApi.js'

const categories = ['Effets', 'Ambiances', 'Musiques', 'Voix']
const terminalStatuses = new Set(['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'])
const itemStatusLabels = Object.freeze({
  PENDING: 'En attente',
  RUNNING: 'Traitement…',
  COMPLETED: 'Ajouté',
  FAILED: 'Échec',
  CANCELLED: 'Annulé',
})

export default function SoundImportDialog({ open, onClose, onImported, onNotify }) {
  const [selections, setSelections] = useState([])
  const [category, setCategory] = useState('Effets')
  const [rightsConfirmed, setRightsConfirmed] = useState(false)
  const [starting, setStarting] = useState(false)
  const [activeJobId, setActiveJobId] = useState('')
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')
  const handledTerminalJob = useRef('')

  const terminal = Boolean(job && terminalStatuses.has(job.status))
  const busy = starting || Boolean(activeJobId && !terminal)
  const invalidTitle = selections.some((item) => !item.title.trim())

  useEffect(() => {
    if (open) return
    setSelections([])
    setCategory('Effets')
    setRightsConfirmed(false)
    setStarting(false)
    setActiveJobId('')
    setJob(null)
    setError('')
    handledTerminalJob.current = ''
  }, [open])

  useEffect(() => {
    if (!open || !activeJobId) return undefined
    let active = true
    const acceptJob = (nextJob) => {
      if (active && nextJob?.id === activeJobId) setJob(nextJob)
    }
    const refresh = async () => {
      try {
        const operations = await studioApi.operations()
        acceptJob(operations.find((operation) => operation.id === activeJobId))
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'La progression de l’import est indisponible.')
      }
    }
    const unsubscribe = studioApi.onOperationsUpdated(acceptJob)
    const timer = setInterval(refresh, 400)
    refresh()
    return () => {
      active = false
      clearInterval(timer)
      unsubscribe()
    }
  }, [activeJobId, open])

  useEffect(() => {
    if (!job || !terminalStatuses.has(job.status) || handledTerminalJob.current === `${job.id}:${job.revision}`) return
    handledTerminalJob.current = `${job.id}:${job.revision}`
    onImported(job)
    onNotify(job.summary || 'Import audio terminé.')
    if (job.status === 'COMPLETED') onClose()
  }, [job, onClose, onImported, onNotify])

  if (!open) return null

  const chooseFiles = async () => {
    setError('')
    try {
      const result = await studioApi.chooseSoundFiles()
      if (result?.canceled || !result?.files?.length) return
      setSelections(result.files.map((file) => ({ ...file, title: file.suggestedTitle })))
      setJob(null)
      setActiveJobId('')
      handledTerminalJob.current = ''
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Les fichiers audio ne peuvent pas être sélectionnés.')
    }
  }

  const updateTitle = (selectionToken, title) => {
    setSelections((current) => current.map((item) => item.selectionToken === selectionToken ? { ...item, title } : item))
  }

  const importSounds = async (event) => {
    event.preventDefault()
    if (!selections.length || busy || invalidTitle) return
    setStarting(true)
    setError('')
    try {
      const started = await studioApi.importSounds({
        items: selections.map((item) => ({ selectionToken: item.selectionToken, title: item.title.trim() })),
        category,
        rightsConfirmed,
      })
      setActiveJobId(started.jobId)
      setJob({ id: started.jobId, status: started.status, revision: 0, progress: { total: started.total, pending: started.total, running: 0, completed: 0, failed: 0, cancelled: 0 }, items: [] })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'L’import audio a échoué.')
    } finally {
      setStarting(false)
    }
  }

  const cancelBatch = async () => {
    if (!activeJobId || terminal) return
    setError('')
    try {
      setJob(await studioApi.cancelOperation(activeJobId))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'L’annulation n’a pas pu être demandée.')
    }
  }

  const resumeBatch = async () => {
    if (!activeJobId || !terminal) return
    setError('')
    handledTerminalJob.current = ''
    try {
      setJob(await studioApi.resumeOperation(activeJobId))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'La reprise a échoué.')
    }
  }

  const progress = job?.progress
  const completedCount = (progress?.completed || 0) + (progress?.failed || 0) + (progress?.cancelled || 0)
  const displayedItems = job?.items?.length ? job.items : selections

  return (
    <div className="sound-import-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <form className="sound-import-dialog is-batch" role="dialog" aria-modal="true" aria-labelledby="sound-import-title" onSubmit={importSounds}>
        <header>
          <span><Music2 size={21} /></span>
          <div><h2 id="sound-import-title">Ajouter des sons</h2><p>Jusqu’à 200 WAV ou MP3, avec un titre repris automatiquement du nom de chaque fichier.</p></div>
          <button type="button" aria-label="Fermer" disabled={busy} onClick={onClose}><X size={18} /></button>
        </header>

        <button className={`sound-file-picker${selections.length ? ' has-file' : ''}`} type="button" disabled={busy} onClick={chooseFiles}>
          {selections.length ? <CheckCircle2 size={24} /> : <Upload size={24} />}
          <span>
            <strong>{selections.length ? `${selections.length} son${selections.length > 1 ? 's' : ''} sélectionné${selections.length > 1 ? 's' : ''}` : 'Choisir plusieurs WAV ou MP3'}</strong>
            <small>{selections.length
              ? `${selections.filter((item) => item.conversionRequired).length} MP3 à convertir · les titres restent modifiables avant l’import`
              : '128 Mo et 30 minutes maximum par fichier · 200 fichiers maximum par lot'}</small>
          </span>
        </button>

        {selections.length > 0 && !job?.items?.length && (
          <div className="sound-batch-file-list" aria-label="Titres des sons à importer">
            {selections.map((item, index) => (
              <label key={item.selectionToken} className="sound-batch-file-row">
                <FileAudio size={17} />
                <span><small>{index + 1}. {item.originalName}</small><input value={item.title} maxLength={120} disabled={busy} aria-label={`Titre de ${item.originalName}`} onChange={(event) => updateTitle(item.selectionToken, event.target.value)} /></span>
                <b>{item.conversionRequired ? 'MP3 → WAV' : 'WAV'}</b>
              </label>
            ))}
          </div>
        )}

        {job && (
          <section className="sound-batch-progress" aria-live="polite">
            <div><strong>{job.summary || `Import de ${progress?.total || selections.length} sons`}</strong><span>{completedCount}/{progress?.total || selections.length}</span></div>
            <progress value={completedCount} max={progress?.total || selections.length || 1} />
            {displayedItems.length > 0 && (
              <div className="sound-batch-result-list">
                {displayedItems.map((item) => (
                  <div key={item.id || item.selectionToken} className={`is-${String(item.status || 'PENDING').toLowerCase()}`}>
                    {item.status === 'COMPLETED' ? <CheckCircle2 size={15} /> : item.status === 'FAILED' ? <CircleAlert size={15} /> : <FileAudio size={15} />}
                    <span><strong>{item.label || item.title}</strong>{item.error?.message && <small>{item.error.message}</small>}</span>
                    <b>{itemStatusLabels[item.status] || 'En attente'}</b>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <fieldset className="sound-category-field">
          <legend>Catégorie appliquée à tout le lot</legend>
          <div>{categories.map((item) => (
            <button key={item} type="button" className={category === item ? 'is-active' : ''} disabled={busy || Boolean(job)} onClick={() => setCategory(item)}>{item}</button>
          ))}</div>
        </fieldset>

        <label className="sound-rights-confirmation">
          <input type="checkbox" checked={rightsConfirmed} disabled={busy || Boolean(job)} onChange={(event) => setRightsConfirmed(event.target.checked)} />
          <span>Je confirme que Noblesse Studio possède le droit d’utiliser tous les sons de ce lot.</span>
        </label>

        {error && <div className="sound-import-error" role="alert"><CircleAlert size={17} /> {error}</div>}

        <footer>
          {busy && activeJobId && <button type="button" onClick={cancelBatch}>Arrêter après ce fichier</button>}
          {terminal && job.status !== 'COMPLETED' && <button type="button" onClick={resumeBatch}>Reprendre les fichiers non terminés</button>}
          <button type="button" disabled={busy} onClick={onClose}>{terminal ? 'Fermer' : 'Annuler'}</button>
          {!job && (
            <button className="is-primary" type="submit" disabled={!selections.length || invalidTitle || !rightsConfirmed || busy}>
              {starting ? <LoaderCircle className="is-spinning" size={18} /> : <Upload size={18} />}
              {starting ? 'Création du lot…' : `Ajouter ${selections.length || ''} son${selections.length > 1 ? 's' : ''} au Coffre`}
            </button>
          )}
        </footer>
      </form>
    </div>
  )
}
