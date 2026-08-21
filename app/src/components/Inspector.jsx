import { CheckCircle2, Clipboard, Download, FileJson, ShieldCheck } from 'lucide-react'
import { formatAssetName, thumbnailFor } from '../lib/catalog.js'

function DetailRow({ label, children }) {
  return <div className="detail-row"><dt>{label}</dt><dd>{children || '—'}</dd></div>
}
export default function Inspector({ asset, onCopy, onInstall }) {
  if (!asset) {
    return <aside className="inspector empty-inspector">Sélectionne un asset pour afficher sa fiche.</aside>
  }

  const deps = asset.dependencies?.split(';').map((item) => item.trim()).filter(Boolean) || []

  return (
    <aside className="inspector" aria-label="Détails de l’asset sélectionné">
      <header className="inspector-header">
        <div>
          <p>Asset sélectionné</p>
          <h2>{asset.display_name}</h2>
        </div>
        <ShieldCheck size={20} />
      </header>

      <div className="hero-preview">
        <img src={thumbnailFor(asset)} alt={`Aperçu de ${formatAssetName(asset.display_name)}`} />
      </div>

      <dl className="detail-list">
        <DetailRow label="ID (Asset ID)">{asset.asset_id}</DetailRow>
        <DetailRow label="Pack">{asset.pack_id}</DetailRow>
        <DetailRow label="Version">{asset.pack_version}</DetailRow>
        <DetailRow label="Provenance">{asset.provenance}</DetailRow>
        <DetailRow label="Statut"><span className="status-value"><CheckCircle2 size={14} />{asset.status}</span></DetailRow>
      </dl>

      <section className="dependency-block">
        <h3><FileJson size={15} /> Dépendances ({deps.length})</h3>
        {deps.length ? deps.slice(0, 4).map((dep) => <p key={dep}>{dep}</p>) : <p>Aucune dépendance externe.</p>}
      </section>

      <section className="path-block">
        <span>Chemin du contenu</span>
        <code>{asset.target_path}</code>
      </section>

      <div className="inspector-actions">
        <button className="primary-action" type="button" onClick={() => onInstall(asset)}>
          <Download size={18} /> Préparer l’installation
        </button>
        <button className="secondary-action" type="button" onClick={() => onCopy(asset.target_path)}>
          <Clipboard size={17} /> Copier le chemin
        </button>
      </div>
    </aside>
  )
}
