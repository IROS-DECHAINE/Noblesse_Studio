import { createElement } from 'react'
import {
  ExternalLink,
  FileQuestion,
  FolderOpen,
  History,
  ImageOff,
  LoaderCircle,
  Music2,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react'

import { parseInlineMarkdown, parseMarkdownDocument, safeDocumentUrl } from '../../lib/markdownDocument.js'

const imageExtensions = new Set(['avif', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp'])
const videoExtensions = new Set(['m4v', 'mov', 'mp4', 'webm'])
const audioExtensions = new Set(['aac', 'flac', 'm4a', 'mp3', 'ogg', 'wav'])

export function resolveDocumentKind(document) {
  const declared = String(document?.kind || '').toLowerCase()
  if (['audio', 'image', 'markdown', 'pdf', 'text', 'video'].includes(declared)) return declared

  const mimeType = String(document?.mimeType || '').toLowerCase()
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType === 'text/markdown') return 'markdown'
  if (mimeType.startsWith('text/')) return 'text'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'

  const extension = String(document?.extension || '').replace(/^\./, '').toLowerCase()
  if (extension === 'pdf') return 'pdf'
  if (['md', 'markdown', 'mdown'].includes(extension)) return 'markdown'
  if (['txt', 'log', 'csv'].includes(extension)) return 'text'
  if (imageExtensions.has(extension)) return 'image'
  if (videoExtensions.has(extension)) return 'video'
  if (audioExtensions.has(extension)) return 'audio'
  return 'unsupported'
}

function renderInline(text, keyPrefix) {
  return parseInlineMarkdown(text).map((segment, index) => {
    const key = `${keyPrefix}-${index}`
    if (segment.type === 'strong') return <strong key={key}>{segment.text}</strong>
    if (segment.type === 'emphasis') return <em key={key}>{segment.text}</em>
    if (segment.type === 'delete') return <del key={key}>{segment.text}</del>
    if (segment.type === 'code') return <code key={key}>{segment.text}</code>
    if (segment.type === 'link') {
      return <a key={key} href={segment.href} title={segment.title || undefined} target="_blank" rel="noreferrer">{segment.text}</a>
    }
    if (segment.type === 'image') {
      return <img className="markdown-inline-image" key={key} src={segment.href} alt={segment.text} title={segment.title || undefined} loading="lazy" />
    }
    return segment.text
  })
}

function MarkdownDocument({ source }) {
  const blocks = parseMarkdownDocument(source)
  return (
    <article className="markdown-sheet">
      <div className="markdown-document">
        {blocks.map((block, blockIndex) => {
          const key = `markdown-block-${blockIndex}`
          if (block.type === 'heading') {
            return createElement(
              `h${block.level}`,
              { className: `markdown-heading is-level-${block.level}`, key },
              renderInline(block.text, key),
            )
          }
          if (block.type === 'paragraph') return <p className="markdown-paragraph" key={key}>{renderInline(block.text, key)}</p>
          if (block.type === 'quote') return <blockquote className="markdown-quote" key={key}>{renderInline(block.text, key)}</blockquote>
          if (block.type === 'divider') return <hr className="markdown-divider" key={key} />
          if (block.type === 'code') {
            return <pre className="markdown-code" key={key}><code data-language={block.language || undefined}>{block.text}</code></pre>
          }
          if (block.type === 'list') {
            const List = block.ordered ? 'ol' : 'ul'
            return (
              <List className={`markdown-list ${block.items.some((item) => item.checked !== null) ? 'is-task-list' : ''}`} key={key}>
                {block.items.map((item, itemIndex) => (
                  <li className={item.checked === true ? 'is-checked' : ''} key={`${key}-${itemIndex}`}>
                    {item.checked !== null && <input type="checkbox" checked={item.checked} readOnly aria-label={item.checked ? 'Terminé' : 'À faire'} />}
                    <span>{renderInline(item.text, `${key}-${itemIndex}`)}</span>
                  </li>
                ))}
              </List>
            )
          }
          if (block.type === 'table') {
            return (
              <div className="markdown-table-scroll" key={key}>
                <table className="markdown-table">
                  <thead><tr>{block.headers.map((cell, cellIndex) => <th key={`${key}-h-${cellIndex}`} scope="col">{renderInline(cell, `${key}-h-${cellIndex}`)}</th>)}</tr></thead>
                  <tbody>{block.rows.map((row, rowIndex) => <tr key={`${key}-r-${rowIndex}`}>{row.map((cell, cellIndex) => <td key={`${key}-r-${rowIndex}-${cellIndex}`}>{renderInline(cell, `${key}-r-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody>
                </table>
              </div>
            )
          }
          return null
        })}
      </div>
    </article>
  )
}

function EmptyViewer({ icon: Icon = FileQuestion, children, role = 'status' }) {
  return (
    <div className="document-viewer-empty" role={role}>
      <Icon size={28} aria-hidden="true" />
      <p>{children}</p>
    </div>
  )
}

export default function DocumentViewer({
  document,
  text = '',
  textLoading = false,
  textError = '',
  deleting = false,
  versioning = false,
  history = [],
  historyLoading = false,
  historyError = '',
  onOpen,
  onReveal,
  onReplaceVersion,
  onRevertVersion,
  onDelete,
}) {
  if (!document) {
    return (
      <section className="document-viewer-panel">
        <EmptyViewer>Sélectionne un document pour le lire.</EmptyViewer>
      </section>
    )
  }

  const kind = resolveDocumentKind(document)
  const previewUrl = safeDocumentUrl(document.previewUrl || document.contentUrl || document.mediaUrl || document.url, { image: kind === 'image' })
  const unavailable = document.available === false

  let preview
  if (unavailable) {
    preview = <EmptyViewer icon={ImageOff} role="alert">Le fichier n’est plus disponible à son emplacement enregistré.</EmptyViewer>
  } else if ((kind === 'markdown' || kind === 'text') && textLoading) {
    preview = <div className="document-viewer-loading" role="status"><LoaderCircle size={22} aria-hidden="true" /> Chargement…</div>
  } else if ((kind === 'markdown' || kind === 'text') && textError) {
    preview = <div className="document-viewer-error" role="alert">{textError}</div>
  } else if (kind === 'markdown') {
    preview = <MarkdownDocument source={text} />
  } else if (kind === 'text') {
    preview = <article className="markdown-sheet"><pre className="document-plain-text">{text}</pre></article>
  } else if (kind === 'pdf' && previewUrl) {
    preview = <iframe className="document-media-pdf" src={previewUrl} title={`Lecture de ${document.title}`} />
  } else if (kind === 'image' && previewUrl) {
    preview = <img className="document-media-image" src={previewUrl} alt={document.title} />
  } else if (kind === 'video' && previewUrl) {
    preview = <video className="document-media-video" src={previewUrl} controls preload="metadata">La lecture vidéo n’est pas prise en charge.</video>
  } else if (kind === 'audio' && previewUrl) {
    preview = (
      <div className="document-media-audio">
        <Music2 size={42} aria-hidden="true" />
        <strong>{document.title}</strong>
        <audio src={previewUrl} controls preload="metadata">La lecture audio n’est pas prise en charge.</audio>
      </div>
    )
  } else if (kind !== 'unsupported') {
    preview = <EmptyViewer>L’aperçu intégré est indisponible. Ouvre le document avec son application habituelle.</EmptyViewer>
  } else {
    preview = <EmptyViewer>Ce format est conservé dans la bibliothèque et s’ouvre avec son application habituelle.</EmptyViewer>
  }

  return (
    <section className="document-viewer-panel" aria-label={`Lecteur de ${document.title}`}>
      <header className="document-viewer-toolbar">
        <h2 className="document-viewer-title">{document.title}</h2>
        <div className="document-viewer-actions">
          <button className="document-viewer-action" type="button" disabled={unavailable} onClick={() => onOpen(document)}>
            <ExternalLink size={16} aria-hidden="true" /> Ouvrir
          </button>
          <button className="document-viewer-action" type="button" onClick={() => onReveal(document)}>
            <FolderOpen size={16} aria-hidden="true" /> Afficher dans le dossier
          </button>
          {document.origin === 'managed' && (
            <button className="document-viewer-action" type="button" disabled={versioning} onClick={() => onReplaceVersion(document)}>
              {versioning ? <LoaderCircle size={16} aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
              <span>Nouvelle version</span>
            </button>
          )}
          <button className="document-viewer-action is-danger" type="button" aria-label={`Supprimer ${document.title}`} disabled={deleting} onClick={() => onDelete(document)}>
            {deleting ? <LoaderCircle size={16} aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
            <span>Supprimer</span>
          </button>
        </div>
      </header>
      <div className={`document-viewer-stage is-${kind}`}>{preview}</div>
      {document.origin === 'managed' && (
        <aside className="document-history" aria-label={`Historique de ${document.title}`}>
          <header><History size={15} aria-hidden="true" /><strong>Historique immuable</strong><span>Version actuelle : {document.revision || 1}</span></header>
          {historyLoading ? (
            <p className="document-history-state"><LoaderCircle size={14} aria-hidden="true" /> Chargement de l’historique…</p>
          ) : historyError ? (
            <p className="document-history-state is-error" role="alert">{historyError}</p>
          ) : (
            <ol className="document-history-list">
              {history.slice(0, 8).map((entry) => (
                <li key={entry.revision} className={entry.current ? 'is-current' : ''}>
                  <div>
                    <strong>Version {entry.revision}</strong>
                    <span>{entry.action} · {new Date(entry.at).toLocaleString('fr-FR')}</span>
                  </div>
                  {entry.current ? (
                    <b>Actuelle</b>
                  ) : (
                    <button type="button" disabled={versioning} onClick={() => onRevertVersion(document, entry.revision)}>
                      <RotateCcw size={13} aria-hidden="true" /> Restaurer
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </aside>
      )}
    </section>
  )
}
