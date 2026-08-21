import { CheckCircle2, Search } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { filterSurfaces, platformFilters, surfaceCategories } from '../lib/catalog.js'
import SurfaceInspector from './SurfaceInspector.jsx'
import VirtualizedSurfaceGrid from './VirtualizedSurfaceGrid.jsx'

export default function CoffreView({ surfaces, query, category, platform, selected, projects, selectedProjectId, connected, installing, vaultIntegrity, onQuery, onCategory, onPlatform, onSelect, onProject, onProjectFavorite, onInstall }) {
  const filtered = filterSurfaces(surfaces, { query, category, platform })
  const visibleSelected = filtered.find((surface) => surface.id === selected?.id) || filtered[0] || null
  const mainRef = useRef(null)

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [category, platform])

  return (
    <section className="coffre-view">
      <main ref={mainRef} className="coffre-main">
        <div className="coffre-heading">
          <h1>Coffre</h1>
          {vaultIntegrity?.status === 'PASS' && (
            <span><CheckCircle2 size={14} /> Coffre vérifié · {vaultIntegrity.checkedFileCount} fichiers · 0 manquant</span>
          )}
        </div>

        <label className="coffre-search">
          <Search size={19} />
          <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Rechercher dans le Coffre…" />
        </label>

        <div className="platform-filter" aria-label="Destination du projet">
          <span>Destination</span>
          <div>{platformFilters.map((item) => <button key={item} type="button" className={platform === item ? 'is-active' : ''} onClick={() => onPlatform(item)}>{item}</button>)}</div>
        </div>

        <div className="subcategory-filter">
          <span>Sous-catégorie</span>
          <div className="usage-filter" aria-label="Sous-catégories du Coffre">
            {surfaceCategories.map((item) => <button key={item} type="button" className={category === item ? 'is-active' : ''} onClick={() => onCategory(item)}>{item}</button>)}
          </div>
        </div>

        {filtered.length ? (
          <VirtualizedSurfaceGrid surfaces={filtered} selectedId={visibleSelected?.id} onSelect={onSelect} scrollContainerRef={mainRef} />
        ) : (
          <div className="coffre-empty">
            <strong>Aucune matière validée ici.</strong>
            <span>Le filtre reste prêt pour les prochains imports, sans créer de faux contenu.</span>
          </div>
        )}
      </main>

      <SurfaceInspector surface={visibleSelected} projects={projects} selectedProjectId={selectedProjectId} connected={connected} installing={installing} onProject={onProject} onProjectFavorite={onProjectFavorite} onInstall={onInstall} />
    </section>
  )
}
