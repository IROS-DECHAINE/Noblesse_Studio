import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, LoaderCircle, Plus, Trash2, X } from 'lucide-react'

import { documentPreviewFallback, documentProjects } from '../data/documentProjects.js'
import { studioApi } from '../lib/desktopApi.js'
import AddDocumentsDialog from './documents/AddDocumentsDialog.jsx'
import DocumentList from './documents/DocumentList.jsx'
import DocumentProjectRail from './documents/DocumentProjectRail.jsx'
import DocumentViewer, { resolveDocumentKind } from './documents/DocumentViewer.jsx'

const PROJECT_ALIASES = {
  'noblesse-studio': 'studio',
  'how-many-boxes-can-you-carry': 'how-many-boxes',
}

function normalizeProjectId(value) {
  const id = String(value || '').trim().toLowerCase()
  return PROJECT_ALIASES[id] || id
}

export function normalizeDocumentsResponse(response) {
  const values = Array.isArray(response) ? response : response?.documents || response?.items || []
  return values
    .filter((item) => item && !item.deletedAt && !item.deleted_at)
    .map((item) => {
      const originalName = String(item.originalName || item.original_name || item.name || '')
      const extensionFromName = originalName.includes('.') ? originalName.split('.').pop() : ''
      const normalized = {
        ...item,
        id: String(item.id || item.documentId || item.document_id || ''),
        projectId: normalizeProjectId(item.projectId || item.project_id),
        title: String(item.title || originalName.replace(/\.[^.]+$/, '') || 'Document'),
        originalName,
        extension: String(item.extension || extensionFromName).replace(/^\./, '').toLowerCase(),
        mimeType: String(item.mimeType || item.mime_type || ''),
        canonicalStatus: String(item.canonicalStatus || item.canonical_status || ''),
        updatedAt: item.updatedAt || item.updated_at || item.modifiedAt || item.modified_at || item.createdAt || item.created_at || null,
        available: item.available !== false,
        previewUrl: item.previewUrl || item.preview_url || '',
      }
      return { ...normalized, kind: resolveDocumentKind(normalized) }
    })
    .filter((item) => item.id && documentProjects.some((project) => project.id === item.projectId))
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback
}

function DeleteConfirmationDialog({ plan, busy, onCancel, onConfirm }) {
  const dialogRef = useRef(null)
  const cancelRef = useRef(null)
  const onCancelRef = useRef(onCancel)
  const busyRef = useRef(busy)
  onCancelRef.current = onCancel
  busyRef.current = busy

  useEffect(() => {
    if (!plan) return undefined
    const previouslyFocused = document.activeElement
    const focusTimer = window.setTimeout(() => cancelRef.current?.focus(), 0)
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault()
        onCancelRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled])')]
      if (!focusable.length) return
      if (event.shiftKey && document.activeElement === focusable[0]) {
        event.preventDefault()
        focusable.at(-1)?.focus()
      } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
        event.preventDefault()
        focusable[0].focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [plan])

  if (!plan) return null
  const unlink = plan.action === 'UNLINK'

  return (
    <div className="documents-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}>
      <section className="documents-modal documents-delete-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="documents-delete-title">
        <header className="documents-modal-header">
          <div><AlertTriangle size={24} aria-hidden="true" /><h2 id="documents-delete-title">Supprimer « {plan.title} » ?</h2></div>
          <button type="button" aria-label="Fermer" disabled={busy} onClick={onCancel}><X size={20} /></button>
        </header>
        <div className="documents-modal-body">
          <div className="documents-delete-summary">
            <Trash2 size={23} aria-hidden="true" />
            <div>
              <strong>{plan.title}</strong>
              <p>{unlink ? 'Le lien sera retiré de la bibliothèque.' : 'Le document sera déplacé dans la corbeille locale.'}</p>
            </div>
          </div>
          <div className="documents-delete-details">
            <p>{plan.recoverable === false ? 'Cette action ne peut pas être annulée.' : 'Cette action est réversible.'}</p>
            <p>{plan.originalSourceWillBeDeleted ? 'Le fichier source d’origine sera également supprimé.' : 'Le fichier source d’origine ne sera pas supprimé.'}</p>
          </div>
          {plan.originalSourceWillBeDeleted && <p className="documents-delete-warning" role="alert">Vérifie la cible avant de confirmer : le fichier source est inclus dans ce plan.</p>}
        </div>
        <footer className="documents-modal-actions">
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel}>Annuler</button>
          <button className="is-danger" type="button" disabled={busy} onClick={onConfirm}>
            {busy ? <LoaderCircle size={16} aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
            Confirmer la suppression
          </button>
        </footer>
      </section>
    </div>
  )
}

export default function DocumentsView({ onNotify }) {
  const [documents, setDocuments] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('primebot-rush')
  const [selectedDocumentId, setSelectedDocumentId] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [textState, setTextState] = useState({ id: '', text: '', loading: false, error: '' })
  const [addOpen, setAddOpen] = useState(false)
  const [deletePlan, setDeletePlan] = useState(null)
  const [planningDeleteId, setPlanningDeleteId] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [localMessage, setLocalMessage] = useState('')

  const notify = useCallback((message) => {
    if (onNotify) onNotify(message)
    else setLocalMessage(message)
  }, [onNotify])

  const loadDocuments = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    setLoadError('')
    try {
      const next = typeof studioApi.documents === 'function'
        ? normalizeDocumentsResponse(await studioApi.documents())
        : normalizeDocumentsResponse(documentPreviewFallback)
      setDocuments(next)
      return next
    } catch (error) {
      const message = errorMessage(error, 'Impossible de charger les documents.')
      setDocuments([])
      setLoadError(message)
      return []
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDocuments()
    const unsubscribe = typeof studioApi.onDocumentsUpdated === 'function'
      ? studioApi.onDocumentsUpdated(() => loadDocuments({ quiet: true }))
      : null
    return typeof unsubscribe === 'function' ? unsubscribe : undefined
  }, [loadDocuments])

  const projectDocuments = useMemo(() => documents
    .filter((document) => document.projectId === selectedProjectId)
    .sort((left, right) => {
      const byDate = new Date(right.updatedAt || 0).valueOf() - new Date(left.updatedAt || 0).valueOf()
      return byDate || left.title.localeCompare(right.title, 'fr')
    }), [documents, selectedProjectId])

  const selectedDocument = projectDocuments.find((document) => document.id === selectedDocumentId) || null

  useEffect(() => {
    if (selectedDocumentId && projectDocuments.some((document) => document.id === selectedDocumentId)) return
    setSelectedDocumentId(projectDocuments[0]?.id || '')
  }, [projectDocuments, selectedDocumentId])

  useEffect(() => {
    if (!selectedDocument || !['markdown', 'text'].includes(selectedDocument.kind)) {
      setTextState({ id: selectedDocument?.id || '', text: '', loading: false, error: '' })
      return undefined
    }

    if (typeof selectedDocument.previewText === 'string') {
      setTextState({ id: selectedDocument.id, text: selectedDocument.previewText, loading: false, error: '' })
      return undefined
    }

    let active = true
    setTextState({ id: selectedDocument.id, text: '', loading: true, error: '' })
    if (typeof studioApi.documentText !== 'function') {
      setTextState({ id: selectedDocument.id, text: '', loading: false, error: 'Aperçu texte indisponible.' })
      return undefined
    }

    studioApi.documentText(selectedDocument.id)
      .then((payload) => {
        if (!active) return
        const text = typeof payload === 'string' ? payload : payload?.text
        setTextState({
          id: selectedDocument.id,
          text: typeof text === 'string' ? text : '',
          loading: false,
          error: typeof text === 'string' ? '' : 'Le contenu texte est indisponible.',
        })
      })
      .catch((error) => {
        if (!active) return
        setTextState({ id: selectedDocument.id, text: '', loading: false, error: errorMessage(error, 'Impossible de lire ce document.') })
      })
    return () => { active = false }
  }, [selectedDocument])

  useEffect(() => {
    if (!localMessage) return undefined
    const timer = window.setTimeout(() => setLocalMessage(''), 5000)
    return () => window.clearTimeout(timer)
  }, [localMessage])

  const selectProject = (projectId) => {
    setSelectedProjectId(projectId)
    setSelectedDocumentId(documents.find((document) => document.projectId === projectId)?.id || '')
  }

  const chooseFiles = () => {
    if (typeof studioApi.chooseDocumentFiles !== 'function') throw new Error('La sélection est disponible dans l’application desktop.')
    return studioApi.chooseDocumentFiles()
  }

  const registerDroppedFiles = (files) => {
    if (typeof studioApi.registerDroppedDocumentFiles !== 'function') throw new Error('Le dépôt est disponible dans l’application desktop.')
    return studioApi.registerDroppedDocumentFiles(files)
  }

  const importDocuments = async (request) => {
    if (typeof studioApi.importDocuments !== 'function') throw new Error('L’import est disponible dans l’application desktop.')
    const result = await studioApi.importDocuments(request)
    const imported = normalizeDocumentsResponse(result)
    setSelectedProjectId(request.projectId)
    const refreshed = await loadDocuments({ quiet: true })
    const selectedId = imported.find((document) => document.projectId === request.projectId)?.id
      || refreshed.find((document) => document.projectId === request.projectId)?.id
      || ''
    setSelectedDocumentId(selectedId)
    notify(`${request.selectionTokens.length} document${request.selectionTokens.length > 1 ? 's' : ''} ajouté${request.selectionTokens.length > 1 ? 's' : ''}.`)
  }

  const runDocumentAction = async (action, document, fallback) => {
    try {
      if (typeof action !== 'function') throw new Error('Cette action est disponible dans l’application desktop.')
      await action(document.id)
    } catch (error) {
      notify(errorMessage(error, fallback))
    }
  }

  const planDelete = async (document) => {
    if (typeof studioApi.planDeleteDocument !== 'function') {
      notify('La suppression est disponible dans l’application desktop.')
      return
    }
    setPlanningDeleteId(document.id)
    try {
      const plan = await studioApi.planDeleteDocument(document.id)
      setDeletePlan({ ...plan, title: String(plan?.title || document.title) })
    } catch (error) {
      notify(errorMessage(error, 'Impossible de préparer la suppression.'))
    } finally {
      setPlanningDeleteId('')
    }
  }

  const confirmDelete = async () => {
    if (!deletePlan || deleting) return
    if (!deletePlan.operationId || !deletePlan.planHash) {
      notify('Le plan de suppression est incomplet. Aucun fichier n’a été modifié.')
      return
    }
    setDeleting(true)
    try {
      await studioApi.deleteDocument({ operationId: deletePlan.operationId, planHash: deletePlan.planHash })
      const deletedTitle = deletePlan.title
      setDeletePlan(null)
      const refreshed = await loadDocuments({ quiet: true })
      const next = refreshed.find((document) => document.projectId === selectedProjectId)
      setSelectedDocumentId(next?.id || '')
      notify(`« ${deletedTitle} » a été placé dans la corbeille.`)
    } catch (error) {
      notify(errorMessage(error, 'La suppression a échoué.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="workspace-page documents-page">
      <header className="workspace-header documents-header">
        <div><h1>Documents</h1><p>Consultez et gérez les documents de vos projets.</p></div>
        <button className="primary-action documents-add-button" type="button" onClick={() => setAddOpen(true)}><Plus size={19} aria-hidden="true" /> Ajouter</button>
      </header>

      <DocumentProjectRail projects={documentProjects} selectedProjectId={selectedProjectId} onSelect={selectProject} />

      <div
        className="documents-workspace"
        id="document-library-panel"
        role="tabpanel"
        aria-labelledby={`document-project-${selectedProjectId}`}
      >
        <DocumentList
          documents={projectDocuments}
          selectedDocumentId={selectedDocumentId}
          loading={loading}
          error={loadError}
          onSelect={setSelectedDocumentId}
          onAdd={() => setAddOpen(true)}
        />
        <DocumentViewer
          document={selectedDocument}
          text={textState.id === selectedDocument?.id ? textState.text : ''}
          textLoading={textState.id === selectedDocument?.id && textState.loading}
          textError={textState.id === selectedDocument?.id ? textState.error : ''}
          deleting={planningDeleteId === selectedDocument?.id || deleting}
          onOpen={(document) => runDocumentAction(studioApi.openDocument, document, 'Impossible d’ouvrir ce document.')}
          onReveal={(document) => runDocumentAction(studioApi.revealDocument, document, 'Impossible d’afficher ce document dans son dossier.')}
          onDelete={planDelete}
        />
      </div>

      <AddDocumentsDialog
        open={addOpen}
        projects={documentProjects}
        initialProjectId={selectedProjectId}
        onClose={() => setAddOpen(false)}
        onChooseFiles={chooseFiles}
        onRegisterDroppedFiles={registerDroppedFiles}
        onImport={importDocuments}
      />
      <DeleteConfirmationDialog plan={deletePlan} busy={deleting} onCancel={() => setDeletePlan(null)} onConfirm={confirmDelete} />
      {localMessage && <div className="documents-local-message" role="status">{localMessage}</div>}
    </section>
  )
}
