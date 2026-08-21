import { Box, CheckCircle2, Palette, Plus, Search, Sparkles, Volume2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  coffreFamilies,
  familyForSurface,
  filterSurfaces,
  platformFilters,
  subcategoriesForFamily,
} from '../lib/catalog.js'
import { layoutLimits, maxInspectorWidthFor, maxPreviewHeightFor } from '../lib/layoutPreferences.js'
import { studioApi } from '../lib/desktopApi.js'
import ColumnResizeHandle from './ColumnResizeHandle.jsx'
import SoundImportDialog from './SoundImportDialog.jsx'
import SurfaceInspector from './SurfaceInspector.jsx'
import VaultTrashDialog from './VaultTrashDialog.jsx'
import VirtualizedSurfaceGrid from './VirtualizedSurfaceGrid.jsx'

const familyIcons = Object.freeze({
  Assets: Box,
  Matières: Palette,
  VFX: Sparkles,
  Sons: Volume2,
})

export default function CoffreView({
  surfaces,
  query,
  family,
  category,
  platform,
  selected,
  projects,
  selectedProjectId,
  connected,
  installing,
  vaultIntegrity,
  inspectorWidth,
  onQuery,
  onFamily,
  onCategory,
  onPlatform,
  onSelect,
  onProject,
  onProjectFavorite,
  onInstall,
  onInspectorWidth,
  onSoundImported,
  onVaultChanged,
  onNotify,
}) {
  const [soundDialogOpen, setSoundDialogOpen] = useState(false)
  const [trashPlan, setTrashPlan] = useState(null)
  const [trashBusy, setTrashBusy] = useState(false)
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 })
  const subcategories = subcategoriesForFamily(family)
  const activeFamily = coffreFamilies.find((item) => item.id === family) || coffreFamilies[1]
  const filtered = useMemo(
    () => filterSurfaces(surfaces, { query, family, category, platform }),
    [category, family, platform, query, surfaces],
  )
  const soundSurfaces = useMemo(() => filtered.filter((surface) => surface.kind === 'sound'), [filtered])
  const familyCounts = useMemo(() => {
    const counts = new Map(coffreFamilies.map((item) => [item.id, 0]))
    surfaces.forEach((surface) => {
      const familyId = familyForSurface(surface)
      counts.set(familyId, (counts.get(familyId) || 0) + 1)
    })
    return counts
  }, [surfaces])
  const subcategoryCounts = useMemo(() => new Map(subcategories.map((item) => [
    item,
    filterSurfaces(surfaces, { family, category: item, platform }).length,
  ])), [family, platform, subcategories, surfaces])
  const visibleSelected = filtered.find((surface) => surface.id === selected?.id) || filtered[0] || null
  const mainRef = useRef(null)
  const viewRef = useRef(null)

  useEffect(() => {
    const view = viewRef.current
    if (!view) return undefined
    const measure = () => setViewSize({ width: view.clientWidth, height: view.clientHeight })
    const observer = new ResizeObserver(measure)
    observer.observe(view)
    measure()
    return () => observer.disconnect()
  }, [])

  const inspectorMax = maxInspectorWidthFor(viewSize.width)
  const previewMaxHeight = maxPreviewHeightFor(viewSize.height)
  const effectiveInspectorWidth = Math.min(inspectorWidth, inspectorMax)

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [category, family, platform])

  const planTrash = async (surface) => {
    const assetIds = [...new Set((surface?.assets || []).map((asset) => asset.asset_id).filter(Boolean))]
    if (!assetIds.length || trashBusy) return
    setTrashBusy(true)
    try {
      setTrashPlan(await studioApi.planVaultTrash(assetIds))
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Le plan de corbeille n’a pas pu être préparé.')
    } finally {
      setTrashBusy(false)
    }
  }

  const applyTrash = async () => {
    if (!trashPlan || trashBusy) return
    setTrashBusy(true)
    try {
      const result = await studioApi.applyVaultTrash({ operationId: trashPlan.operationId, planHash: trashPlan.planHash, confirmationPhrase: 'CORBEILLE' })
      setTrashPlan(null)
      await onVaultChanged?.()
      onNotify(`« ${result.title} » a été placé dans la corbeille. Les originaux sont préservés.`)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'La mise en corbeille a échoué.')
    } finally {
      setTrashBusy(false)
    }
  }

  return (
    <section
      ref={viewRef}
      className="coffre-view"
      style={{
        '--coffre-inspector-width': `${effectiveInspectorWidth}px`,
        '--coffre-preview-max-height': `${previewMaxHeight}px`,
      }}
    >
      <main ref={mainRef} className="coffre-main">
        <div className="coffre-heading">
          <h1>Coffre</h1>
          <div className="coffre-heading-actions">
            {family === 'Sons' && <button className="add-sound-button" type="button" onClick={() => setSoundDialogOpen(true)}><Plus size={17} /> Ajouter un son</button>}
            {vaultIntegrity?.status === 'PASS' && (
              <span><CheckCircle2 size={14} /> Coffre vérifié · {vaultIntegrity.checkedFileCount} fichiers · 0 manquant</span>
            )}
          </div>
        </div>

        <nav className="coffre-family-nav" aria-label="Grandes catégories du Coffre">
          {coffreFamilies.map((item) => {
            const Icon = familyIcons[item.id]
            const active = family === item.id
            return (
              <button
                key={item.id}
                type="button"
                className={active ? 'is-active' : ''}
                aria-pressed={active}
                onClick={() => onFamily(item.id)}
              >
                <i aria-hidden="true"><Icon size={22} strokeWidth={1.7} /></i>
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
                <b>{familyCounts.get(item.id) || 0}</b>
              </button>
            )
          })}
        </nav>

        <div className="subcategory-filter">
          <span>{activeFamily.label} · Sous-catégories</span>
          <div className="usage-filter" aria-label={`Sous-catégories ${activeFamily.label}`}>
            {subcategories.map((item) => (
              <button
                key={item}
                type="button"
                className={category === item ? 'is-active' : ''}
                aria-pressed={category === item}
                onClick={() => onCategory(item)}
              >
                <span>{item}</span><small>{subcategoryCounts.get(item) || 0}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="coffre-toolbar">
          <label className="coffre-search">
            <Search size={19} />
            <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder={`Rechercher dans ${activeFamily.label}…`} />
          </label>

          <div className="platform-filter" aria-label="Destination du projet">
            <span>Destination</span>
            <div>{platformFilters.map((item) => <button key={item} type="button" className={platform === item ? 'is-active' : ''} onClick={() => onPlatform(item)}>{item}</button>)}</div>
          </div>
        </div>

        {filtered.length ? (
          <VirtualizedSurfaceGrid surfaces={filtered} selectedId={visibleSelected?.id} onSelect={onSelect} scrollContainerRef={mainRef} />
        ) : (
          <div className="coffre-empty">
            <strong>Aucun contenu dans {activeFamily.label}.</strong>
            <span>{familyCounts.get(family)
              ? 'Essaie la sous-catégorie Tout, une autre destination ou une recherche différente.'
              : 'Cette catégorie est prête pour les prochains imports validés, sans créer de faux contenu.'}</span>
          </div>
        )}
      </main>

      <ColumnResizeHandle
        className="coffre-inspector-resizer"
        label="Redimensionner le prévisualisateur"
        value={effectiveInspectorWidth}
        min={layoutLimits.inspector.min}
        max={inspectorMax}
        defaultValue={layoutLimits.inspector.defaultValue}
        direction={-1}
        onChange={onInspectorWidth}
      />
      <SurfaceInspector surface={visibleSelected} soundSurfaces={soundSurfaces} projects={projects} selectedProjectId={selectedProjectId} connected={connected} installing={installing} onProject={onProject} onProjectFavorite={onProjectFavorite} onInstall={onInstall} onSelect={onSelect} onTrash={planTrash} trashBusy={trashBusy} />
      <SoundImportDialog open={soundDialogOpen} onClose={() => setSoundDialogOpen(false)} onImported={onSoundImported} onNotify={onNotify} />
      <VaultTrashDialog plan={trashPlan} busy={trashBusy} onCancel={() => setTrashPlan(null)} onConfirm={applyTrash} />
    </section>
  )
}
