import { ArrowUpRight, Boxes, CheckCircle2, FlaskConical, Layers3, LockKeyhole, PackageSearch } from 'lucide-react'

const statusLabels = {
  AUDIT_FIRST: 'Premier audit',
  SECOND_CANARY: 'Second canari',
  GRAPH_AUDIT: 'Audit du graphe',
  UNREAL_FIRST_UEFN_HOLD: 'Unreal · UEFN en attente',
}

export default function FabMaterialView({ candidates, query }) {
  const needle = query.trim().toLocaleLowerCase('fr')
  const visible = candidates.filter((candidate) => !needle || [
    candidate.name,
    candidate.publisher,
    candidate.sourceFormat,
    candidate.unreal,
    candidate.uefn,
    candidate.summary,
  ].join(' ').toLocaleLowerCase('fr').includes(needle))

  return (
    <section className="fab-material-view">
      <header className="fab-heading">
        <div>
          <span className="fab-eyebrow">Source Fab · propriété à confirmer dans My Library</span>
          <h1>Fab Materials</h1>
          <p>On indexe d’abord. On télécharge et valide seulement les matériaux utiles.</p>
        </div>
        <div className="fab-count"><strong>12</strong><span>packs matériaux déclarés</span></div>
      </header>

      <div className="fab-principles">
        <article><PackageSearch size={19} /><span><strong>Metadata first</strong>Pas de téléchargement massif</span></article>
        <article><FlaskConical size={19} /><span><strong>Quarantaine</strong>Un canari avant chaque pack</span></article>
        <article><LockKeyhole size={19} /><span><strong>Licence tracée</strong>Historique UE ≠ Fab automatique</span></article>
        <article><CheckCircle2 size={19} /><span><strong>Validation cible</strong>Unreal et UEFN séparés</span></article>
      </div>

      <div className="fab-list-heading"><h2><Layers3 size={17} /> Première shortlist</h2><span>{visible.length} candidats documentés</span></div>
      <div className="fab-candidate-grid">
        {visible.map((candidate) => (
          <article className="fab-candidate-card" key={candidate.id}>
            <div className="fab-card-top">
              <span className="fab-rank">0{candidate.priority}</span>
              <span className={`fab-status status-${candidate.status.toLocaleLowerCase()}`}>{statusLabels[candidate.status]}</span>
            </div>
            <div className="fab-card-icon"><Boxes size={25} /></div>
            <h2>{candidate.name}</h2>
            <p className="fab-publisher">{candidate.publisher}</p>
            <p className="fab-summary">{candidate.summary}</p>
            <dl>
              <div><dt>Source</dt><dd>{candidate.sourceFormat}</dd></div>
              <div><dt>Unreal</dt><dd>{candidate.unreal}</dd></div>
              <div><dt>UEFN</dt><dd>{candidate.uefn}</dd></div>
            </dl>
            <a href={candidate.listingUrl} target="_blank" rel="noreferrer">Voir le listing Fab <ArrowUpRight size={14} /></a>
          </article>
        ))}
      </div>
      {!visible.length && <div className="no-results">Aucun pack Fab ne correspond à cette recherche.</div>}
    </section>
  )
}
