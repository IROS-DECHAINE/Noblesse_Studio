import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  FilePlus2,
  Info,
  LoaderCircle,
  UploadCloud,
  X,
} from 'lucide-react'

function extractSelections(result) {
  const values = Array.isArray(result) ? result : result?.selections || result?.files || result?.items || []
  return values
    .map((item) => ({
      selectionToken: String(item?.selectionToken || item?.token || ''),
      originalName: String(item?.originalName || item?.name || 'Document'),
      extension: String(item?.extension || '').replace(/^\./, '').toLowerCase(),
      kind: String(item?.kind || 'unsupported').toLowerCase(),
      mimeType: String(item?.mimeType || ''),
      sizeBytes: Number.isFinite(Number(item?.sizeBytes)) ? Number(item.sizeBytes) : null,
      allowed: item?.allowed !== false,
      blockedReason: String(item?.blockedReason || ''),
    }))
    .filter((item) => item.selectionToken)
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return '—'
  if (value < 1024) return `${value} o`
  const units = ['Ko', 'Mo', 'Go', 'To']
  let size = value / 1024
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: size >= 10 ? 0 : 1 }).format(size)} ${units[unit]}`
}

export default function AddDocumentsDialog({
  open,
  projects,
  initialProjectId,
  onClose,
  onChooseFiles,
  onRegisterDroppedFiles,
  onImport,
}) {
  const dialogRef = useRef(null)
  const closeButtonRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const busyRef = useRef(false)
  const [projectId, setProjectId] = useState(initialProjectId)
  const [selections, setSelections] = useState([])
  const [title, setTitle] = useState('')
  const [dragging, setDragging] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState('')

  const allowedSelections = useMemo(() => selections.filter((item) => item.allowed), [selections])
  const busy = selecting || importing
  onCloseRef.current = onClose
  busyRef.current = busy

  useEffect(() => {
    if (!open) return undefined
    const previouslyFocused = document.activeElement
    setProjectId(initialProjectId)
    setSelections([])
    setTitle('')
    setDragging(false)
    setMessage('')

    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0)
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [open, initialProjectId])

  if (!open) return null

  const mergeSelections = (result) => {
    const incoming = extractSelections(result)
    setSelections((current) => {
      const byToken = new Map(current.map((item) => [item.selectionToken, item]))
      for (const item of incoming) byToken.set(item.selectionToken, item)
      return [...byToken.values()]
    })
    setMessage(incoming.length ? '' : 'Aucun fichier sélectionné.')
  }

  const chooseFiles = async () => {
    setSelecting(true)
    setMessage('')
    try {
      mergeSelections(await onChooseFiles())
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'La sélection de fichiers a échoué.')
    } finally {
      setSelecting(false)
    }
  }

  const registerDrop = async (event) => {
    event.preventDefault()
    setDragging(false)
    const files = [...(event.dataTransfer?.files || [])]
    if (!files.length) return
    setSelecting(true)
    setMessage('')
    try {
      mergeSelections(await onRegisterDroppedFiles(files))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Le dépôt de fichiers a échoué.')
    } finally {
      setSelecting(false)
    }
  }

  const importDocuments = async () => {
    if (!projectId || !allowedSelections.length) return
    setImporting(true)
    setMessage('')
    try {
      await onImport({
        projectId,
        selectionTokens: allowedSelections.map((item) => item.selectionToken),
        ...(allowedSelections.length === 1 && title.trim() ? { title: title.trim() } : {}),
      })
      onClose()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'L’import des documents a échoué.')
    } finally {
      setImporting(false)
    }
  }

  const countLabel = allowedSelections.length === 1 ? 'Ajouter le document' : `Ajouter ${allowedSelections.length} documents`

  return (
    <div className="documents-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section
        className="documents-modal documents-add-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="documents-add-title"
        aria-describedby="documents-add-description"
      >
        <header className="documents-modal-header">
          <div>
            <FilePlus2 size={25} aria-hidden="true" />
            <h2 id="documents-add-title">Ajouter des documents</h2>
          </div>
          <button ref={closeButtonRef} type="button" aria-label="Fermer" disabled={busy} onClick={onClose}><X size={20} /></button>
        </header>

        <div className="documents-modal-body">
          <label className="documents-form-field">
            <span>Destination du projet</span>
            <select value={projectId} disabled={busy} onChange={(event) => setProjectId(event.target.value)}>
              {projects.map((project) => <option value={project.id} key={project.id}>{project.label}</option>)}
            </select>
          </label>

          <div
            className={`documents-dropzone ${dragging ? 'is-dragging' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false) }}
            onDrop={registerDrop}
          >
            {selecting ? <LoaderCircle size={39} aria-hidden="true" /> : <UploadCloud size={39} aria-hidden="true" />}
            <strong>Dépose tes fichiers ici</strong>
            <span id="documents-add-description">PDF, Markdown, images, vidéos et sons</span>
            <button type="button" disabled={busy} onClick={chooseFiles}>Choisir des fichiers</button>
          </div>

          {!!selections.length && (
            <div className="documents-selection">
              <p>{selections.length} fichier{selections.length > 1 ? 's' : ''} sélectionné{selections.length > 1 ? 's' : ''}</p>
              <ul className="documents-selection-list">
                {selections.map((item) => (
                  <li className={`documents-selection-item ${item.allowed ? '' : 'is-blocked'}`} key={item.selectionToken}>
                    <FilePlus2 size={17} aria-hidden="true" />
                    <span><strong>{item.originalName}</strong>{!item.allowed && <small>{item.blockedReason || 'Format refusé'}</small>}</span>
                    <small>{formatBytes(item.sizeBytes)}</small>
                    <button
                      type="button"
                      aria-label={`Retirer ${item.originalName}`}
                      disabled={busy}
                      onClick={() => setSelections((current) => current.filter((entry) => entry.selectionToken !== item.selectionToken))}
                    ><X size={16} /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <label className="documents-form-field">
            <span>Titre <small>(optionnel)</small></span>
            <input
              type="text"
              value={title}
              maxLength="160"
              disabled={busy || allowedSelections.length !== 1}
              placeholder="Laisse vide pour conserver le nom d’origine"
              onChange={(event) => setTitle(event.target.value)}
            />
            <small>Le nom d’origine du fichier est conservé par défaut.</small>
          </label>

          <p className="documents-import-note"><Info size={15} aria-hidden="true" /> Les originaux importés sont copiés dans la bibliothèque locale de Noblesse Studio.</p>
          {message && <p className="documents-form-message" role="alert"><AlertCircle size={15} aria-hidden="true" /> {message}</p>}
        </div>

        <footer className="documents-modal-actions">
          <button type="button" disabled={busy} onClick={onClose}>Annuler</button>
          <button className="is-primary" type="button" disabled={busy || !projectId || !allowedSelections.length} onClick={importDocuments}>
            {importing && <LoaderCircle size={16} aria-hidden="true" />}
            {countLabel}
          </button>
        </footer>
      </section>
    </div>
  )
}
