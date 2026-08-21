import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArchiveRestore,
  CheckCircle2,
  DatabaseBackup,
  FolderOpen,
  HardDrive,
  LoaderCircle,
  PauseCircle,
  Play,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react'

import { studioApi } from '../lib/desktopApi.js'

const terminalStatuses = new Set(['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'])

const formatBytes = (value) => {
  if (!Number.isFinite(Number(value))) return '—'
  const units = ['o', 'Ko', 'Mo', 'Go', 'To']
  let size = Number(value)
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: unit > 2 ? 2 : 1 }).format(size)} ${units[unit]}`
}

const formatDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const statusLabel = {
  QUEUED: 'En attente',
  RUNNING: 'En cours',
  INTERRUPTED: 'Interrompue',
  COMPLETED: 'Terminée',
  PARTIAL: 'Partielle',
  FAILED: 'Échec',
  CANCELLED: 'Annulée',
}

export default function RecoveryView() {
  const [recovery, setRecovery] = useState(null)
  const [operations, setOperations] = useState([])
  const [trashItems, setTrashItems] = useState([])
  const [deletedDocuments, setDeletedDocuments] = useState([])
  const [progress, setProgress] = useState(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    const [nextRecovery, nextOperations, nextTrash, nextDeletedDocuments] = await Promise.all([studioApi.recoveryStatus(), studioApi.operations(), studioApi.vaultTrash(), studioApi.documentTrash()])
    setRecovery(nextRecovery)
    setOperations(Array.isArray(nextOperations) ? nextOperations : [])
    setTrashItems(Array.isArray(nextTrash?.items) ? nextTrash.items : [])
    setDeletedDocuments(Array.isArray(nextDeletedDocuments) ? nextDeletedDocuments : [])
  }, [])

  useEffect(() => {
    refresh().catch((error) => setMessage(error instanceof Error ? error.message : 'État de récupération indisponible.'))
    const unsubscribeProgress = studioApi.onRecoveryProgress(setProgress)
    const unsubscribeOperations = studioApi.onOperationsUpdated((updated) => {
      setOperations((current) => {
        const next = [updated, ...current.filter((job) => job.id !== updated?.id)].filter(Boolean)
        return next.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 100)
      })
    })
    return () => {
      unsubscribeProgress()
      unsubscribeOperations()
    }
  }, [refresh])

  const latest = recovery?.latestSnapshot || null
  const activeOperationCount = useMemo(() => operations.filter((job) => !terminalStatuses.has(job.status)).length, [operations])

  const createSnapshot = async () => {
    setBusy('create')
    setMessage('')
    setProgress(null)
    try {
      const result = await studioApi.createRecoverySnapshot('Sauvegarde manuelle depuis Noble Studio')
      setMessage(`Sauvegarde ${result.snapshotId} créée et vérifiée.`)
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'La sauvegarde a échoué.')
    } finally {
      setBusy('')
      setProgress(null)
    }
  }

  const verifyLatest = async () => {
    if (!latest?.snapshotId) return
    setBusy('verify')
    setMessage('')
    setProgress(null)
    try {
      const result = await studioApi.verifyRecoverySnapshot(latest.snapshotId)
      setMessage(`${result.checkedFileCount} fichiers vérifiés : aucun écart.`)
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'La vérification a échoué.')
    } finally {
      setBusy('')
      setProgress(null)
    }
  }

  const runOperationAction = async (action, jobId) => {
    setMessage('')
    try {
      await action(jobId)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'L’opération a échoué.')
    }
  }

  const restoreTrashItem = async (trashId) => {
    setBusy(`trash:${trashId}`)
    setMessage('')
    try {
      const result = await studioApi.restoreVaultTrash(trashId)
      setMessage(`${result.targetCount} élément${result.targetCount > 1 ? 's' : ''} restauré${result.targetCount > 1 ? 's' : ''} dans le Coffre.`)
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'La restauration du Coffre a échoué.')
    } finally {
      setBusy('')
    }
  }

  const restoreDeletedDocument = async (document) => {
    setBusy(`document:${document.id}`)
    setMessage('')
    try {
      await studioApi.restoreDocument(document.id)
      setMessage(`« ${document.title} » a été restauré dans Documents.`)
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'La restauration du document a échoué.')
    } finally {
      setBusy('')
    }
  }

  const progressPercent = progress?.totalBytes
    ? Math.min(100, Math.round((Number(progress.completedBytes ?? progress.checkedBytes ?? 0) / progress.totalBytes) * 100))
    : 0

  return (
    <section className="workspace-page recovery-page">
      <header className="workspace-header recovery-header">
        <div><h1>Sécurité et récupération</h1><p>Sauvegardes vérifiables, historique et reprise des opérations locales.</p></div>
        <button className="recovery-secondary" type="button" onClick={() => studioApi.revealRecoveryRepository()}><FolderOpen size={17} /> Ouvrir le dépôt</button>
      </header>

      <div className="recovery-health-grid">
        <article><ShieldCheck size={22} /><div><strong>Electron isolé</strong><span>Renderer sandboxé et API IPC limitée</span></div><CheckCircle2 className="is-pass" size={18} /></article>
        <article><HardDrive size={22} /><div><strong>Sources protégées</strong><span>{recovery?.source?.fileCount ?? '…'} fichiers · {formatBytes(recovery?.source?.totalBytes)}</span></div><CheckCircle2 className="is-pass" size={18} /></article>
        <article><DatabaseBackup size={22} /><div><strong>Sauvegardes</strong><span>{recovery?.snapshotCount ?? 0} snapshot{recovery?.snapshotCount === 1 ? '' : 's'} disponible{recovery?.snapshotCount === 1 ? '' : 's'}</span></div>{latest ? <CheckCircle2 className="is-pass" size={18} /> : <PauseCircle className="is-warning" size={18} />}</article>
      </div>

      <div className="recovery-layout">
        <article className="recovery-panel">
          <header><div><DatabaseBackup size={20} /><span><strong>Sauvegarde du studio</strong><small>Vault, documents et état métier</small></span></div></header>
          <div className="recovery-latest">
            <span>Dernière sauvegarde</span>
            <strong>{latest ? formatDate(latest.createdAt) : 'Aucune sauvegarde complète'}</strong>
            <small>{latest ? `${latest.fileCount} fichiers · ${formatBytes(latest.totalBytes)}` : `Premier dépôt estimé : ${formatBytes(recovery?.source?.totalBytes)}`}</small>
          </div>
          {busy && progress && (
            <div className="recovery-progress" role="status">
              <div><span>{busy === 'create' ? 'Copie et hash' : 'Vérification'}</span><strong>{progressPercent}%</strong></div>
              <progress max="100" value={progressPercent} />
              <small>{progress.completedFiles || 0} / {progress.totalFiles || 0} fichiers</small>
            </div>
          )}
          <div className="recovery-actions">
            <button className="is-primary" type="button" disabled={Boolean(busy)} onClick={createSnapshot}>{busy === 'create' ? <LoaderCircle size={17} /> : <DatabaseBackup size={17} />} Créer une sauvegarde</button>
            <button type="button" disabled={Boolean(busy) || !latest} onClick={verifyLatest}>{busy === 'verify' ? <LoaderCircle size={17} /> : <ShieldCheck size={17} />} Vérifier la dernière</button>
          </div>
          <p className="recovery-note"><ArchiveRestore size={16} /> Une restauration crée d’abord un snapshot de sécurité. Elle s’exécute application fermée afin que le calendrier et les finances ne réécrivent pas les anciennes données.</p>
        </article>

        <article className="recovery-panel">
          <header><div><RefreshCw size={20} /><span><strong>Opérations récupérables</strong><small>{activeOperationCount} active{activeOperationCount > 1 ? 's' : ''}</small></span></div></header>
          <div className="operation-list">
            {operations.length ? operations.slice(0, 8).map((job) => (
              <div className="operation-row" key={job.id}>
                <div><strong>{job.title}</strong><span>{statusLabel[job.status] || job.status} · {job.progress.completed}/{job.progress.total}</span></div>
                <div>
                  {['INTERRUPTED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(job.status) && <button type="button" title="Reprendre" onClick={() => runOperationAction(studioApi.resumeOperation, job.id)}><Play size={15} /></button>}
                  {!terminalStatuses.has(job.status) && <button type="button" title="Annuler" onClick={() => runOperationAction(studioApi.cancelOperation, job.id)}><XCircle size={15} /></button>}
                </div>
              </div>
            )) : <div className="recovery-empty">Aucune opération interrompue.</div>}
          </div>
        </article>

        <article className="recovery-panel recovery-trash-panel">
          <header><div><Trash2 size={20} /><span><strong>Corbeilles locales</strong><small>{trashItems.length + deletedDocuments.length} groupe{trashItems.length + deletedDocuments.length === 1 ? '' : 's'} récupérable{trashItems.length + deletedDocuments.length === 1 ? '' : 's'} · originaux préservés</small></span></div></header>
          <div className="vault-trash-list">
            {trashItems.length ? trashItems.map((item) => (
              <div key={item.trashId}>
                <span><strong>{item.title}</strong><small>{item.targetCount} entrée{item.targetCount > 1 ? 's' : ''} · {formatDate(item.deletedAt)}</small></span>
                <button type="button" disabled={Boolean(busy)} onClick={() => restoreTrashItem(item.trashId)}>{busy === `trash:${item.trashId}` ? <LoaderCircle size={15} /> : <ArchiveRestore size={15} />} Restaurer</button>
              </div>
            )) : null}
            {deletedDocuments.map((document) => (
              <div key={`document:${document.id}`}>
                <span><strong>{document.title}</strong><small>Document · {formatDate(document.deletedAt)}</small></span>
                <button type="button" disabled={Boolean(busy)} onClick={() => restoreDeletedDocument(document)}>{busy === `document:${document.id}` ? <LoaderCircle size={15} /> : <ArchiveRestore size={15} />} Restaurer</button>
              </div>
            ))}
            {!trashItems.length && !deletedDocuments.length && <div className="recovery-empty">Les corbeilles locales sont vides.</div>}
          </div>
        </article>
      </div>

      {message && <div className="recovery-message" role="status">{message}</div>}
    </section>
  )
}
