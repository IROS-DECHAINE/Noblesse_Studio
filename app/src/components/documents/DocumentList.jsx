import {
  File,
  FileCode2,
  FileText,
  Image as ImageIcon,
  Music2,
  Video,
} from 'lucide-react'

const iconByKind = {
  audio: Music2,
  image: ImageIcon,
  markdown: FileCode2,
  pdf: FileText,
  text: FileText,
  video: Video,
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '—' : dateFormatter.format(date)
}

function displayExtension(document) {
  const extension = String(document.extension || '').replace(/^\./, '')
  return extension ? extension.toUpperCase() : 'FICHIER'
}

function statusLabel(document) {
  const value = String(document.canonicalStatus || '').trim()
  return value || '—'
}

export default function DocumentList({
  documents,
  selectedDocumentId,
  loading = false,
  error = '',
  onSelect,
  onAdd,
}) {
  return (
    <section className="document-list-panel" aria-label="Documents du projet" aria-busy={loading}>
      <div className="document-list-scroll">
        <table className="document-list-table" role="grid" aria-label="Liste des documents">
          <thead className="document-list-header">
            <tr>
              <th className="document-list-column is-name" scope="col">Nom</th>
              <th className="document-list-column is-format" scope="col">Format</th>
              <th className="document-list-column is-date" scope="col">Modifié le</th>
              <th className="document-list-column is-status" scope="col">Statut</th>
            </tr>
          </thead>
          <tbody className="document-list-rows">
            {documents.map((document) => {
              const Icon = iconByKind[document.kind] || File
              const selected = document.id === selectedDocumentId
              const status = statusLabel(document)
              const unavailable = document.available === false
              return (
                <tr
                  className={`document-list-row ${selected ? 'is-selected' : ''} ${unavailable ? 'is-unavailable' : ''}`}
                  key={document.id}
                  tabIndex="0"
                  aria-selected={selected}
                  aria-label={`${document.title}, ${displayExtension(document)}, modifié le ${formatDate(document.updatedAt)}`}
                  onClick={() => onSelect(document.id)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    onSelect(document.id)
                  }}
                >
                  <td className="document-list-title">
                    <span className={`document-file-icon is-${document.kind}`} aria-hidden="true">
                      <Icon size={17} />
                    </span>
                    <span>
                      <strong>{document.title}</strong>
                      {unavailable && <small>Fichier introuvable</small>}
                    </span>
                  </td>
                  <td className="document-list-meta">{displayExtension(document)}</td>
                  <td className="document-list-meta">{formatDate(document.updatedAt)}</td>
                  <td className={`document-list-status ${status !== '—' ? 'has-status' : ''}`}>{status}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {!loading && !documents.length && !error && (
          <div className="document-list-empty">
            <strong>Aucun document</strong>
            <button type="button" onClick={onAdd}>Ajouter le premier document</button>
          </div>
        )}
        {loading && !documents.length && <div className="document-list-empty" role="status">Chargement…</div>}
        {error && !documents.length && <div className="document-list-empty is-error" role="alert">{error}</div>}
      </div>
    </section>
  )
}
