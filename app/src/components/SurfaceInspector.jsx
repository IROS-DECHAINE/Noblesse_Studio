import { CheckCircle2, ChevronDown, Circle, Layers3, LoaderCircle, ShieldCheck, Square, Trash2 } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { studioApi } from '../lib/desktopApi.js'
import { describeMaterialVariantSelection, reconcileMaterialVariantId } from '../lib/materialVariantSelection.js'
import AssetInspector from './AssetInspector.jsx'
import { usePreviewDescriptor } from './material-preview/usePreviewDescriptor.js'
import SoundInspector from './SoundInspector.jsx'
import VaultInstallControl from './VaultInstallControl.jsx'

const MaterialPreview3D = lazy(() => import('./MaterialPreview3D.jsx'))

export default function SurfaceInspector({
  surface,
  soundSurfaces,
  projects,
  selectedProjectId,
  installing,
  onProject,
  onProjectFavorite,
  onInstall,
  onSelect,
  onTrash,
  trashBusy,
}) {
  const [shape, setShape] = useState('sphere')
  const [variantId, setVariantId] = useState('Standard')
  const previousSurfaceIdRef = useRef(null)
  const variantSelection = describeMaterialVariantSelection(surface)
  useEffect(() => {
    const previousSurfaceId = previousSurfaceIdRef.current
    previousSurfaceIdRef.current = variantSelection.surfaceId
    setVariantId((currentVariantId) => reconcileMaterialVariantId({
      currentVariantId,
      previousSurfaceId,
      selection: variantSelection,
    }))
  }, [variantSelection.key])
  const activeVariant = useMemo(
    () => surface?.variantOptions?.find((variant) => variant.id === variantId) || surface?.variantOptions?.[0],
    [surface?.variantOptions, variantId],
  )
  const activeAssetId = activeVariant?.assetId || surface?.installAssetId || ''
  const descriptorState = usePreviewDescriptor({
    assetId: activeAssetId,
    enabled: Boolean(activeAssetId) && surface?.kind !== 'asset',
    loadDescriptor: studioApi.materialPreview,
  })
  const technicalChannels = descriptorState?.descriptor?.channels || []
  const previewSurface = useMemo(
    () => surface ? {
      ...surface,
      assetId: activeAssetId,
      animated: Boolean(activeVariant?.animated),
      previewColor: activeVariant?.previewColor || surface.previewColor,
      previewKind: activeVariant?.previewKind || surface.previewKind,
    } : surface,
    [activeAssetId, activeVariant?.animated, activeVariant?.previewColor, activeVariant?.previewKind, surface],
  )

  if (!surface) return <aside className="surface-inspector is-empty">Aucun élément dans cette sélection.</aside>
  if (surface.kind === 'sound') return <SoundInspector surface={surface} sounds={soundSurfaces} projects={projects} selectedProjectId={selectedProjectId} installing={installing} onProject={onProject} onProjectFavorite={onProjectFavorite} onInstall={onInstall} onSelect={onSelect} onTrash={onTrash} trashBusy={trashBusy} />
  if (surface.kind === 'asset') return <AssetInspector surface={surface} projects={projects} selectedProjectId={selectedProjectId} installing={installing} onProject={onProject} onProjectFavorite={onProjectFavorite} onInstall={onInstall} onTrash={onTrash} trashBusy={trashBusy} />
  const technicalMapCount = Number(activeVariant?.technicalMaps) || technicalChannels.length

  return (
    <aside className="surface-inspector" aria-label="Détails de la matière sélectionnée">
      <header><h2>{surface.name}</h2><ShieldCheck size={20} /></header>
      <div className="preview-toolbar">
        <div>
          <button type="button" className={shape === 'sphere' ? 'is-active' : ''} onClick={() => setShape('sphere')}><Circle size={15} /> Sphère</button>
          <button type="button" className={shape === 'plane' ? 'is-active' : ''} onClick={() => setShape('plane')}><Square size={15} /> Plane</button>
        </div>
      </div>
      {surface.variantOptions?.length > 1 && (
        <div className="material-variants">
          <span>Variantes</span>
          <div>
            {surface.variantOptions.map((variant) => (
              <button key={variant.id} type="button" className={variant.id === activeVariant?.id ? 'is-active' : ''} onClick={() => setVariantId(variant.id)}>
                <i style={{ backgroundImage: variant.preview ? `url(${variant.preview})` : undefined, backgroundColor: surface.previewColor, backgroundSize: variant.previewKind === 'rendered_sphere' ? '116%' : undefined }} />
                <b>{variant.label}</b>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="inspector-sphere">
        <Suspense fallback={<div className="material-preview-loading" role="status"><LoaderCircle className="is-spinning" size={22} /> Préparation de l’aperçu 3D…</div>}>
          <MaterialPreview3D
            descriptorState={descriptorState}
            surface={previewSurface}
            shape={shape}
            preview={activeVariant?.preview || surface.preview}
          />
        </Suspense>
      </div>

      <dl className="surface-facts">
        <div><dt>Catégorie</dt><dd>{surface.category}</dd></div>
        <div><dt>Variantes</dt><dd>{surface.variants.length}</dd></div>
        <div><dt>Type</dt><dd>{previewSurface.animated ? 'Animée' : 'Statique'}</dd></div>
        <div><dt>Compatibilité</dt><dd className="compatibility-list">{surface.platforms.map((item) => <span key={item}><CheckCircle2 size={13} /> {item}</span>)}</dd></div>
      </dl>

      <details className="technical-details">
        <summary><span><Layers3 size={18} /> {technicalMapCount} cartes techniques</span><ChevronDown size={17} /></summary>
        <div className="technical-body">
          {technicalChannels.length
            ? technicalChannels.map((channel) => <p key={channel.key}><span>{channel.label}</span><strong>{channel.detail}</strong></p>)
            : <p><span>Capture source</span><strong>Aucune carte déclarée</strong></p>}
          <small>Source : {surface.sourcePack}</small>
        </div>
      </details>

      <VaultInstallControl
        surface={surface}
        projects={projects}
        selectedProjectId={selectedProjectId}
        installing={installing}
        onProject={onProject}
        onProjectFavorite={onProjectFavorite}
        onInstall={onInstall}
        variant={activeVariant}
      />
      <button className="vault-trash-trigger" type="button" disabled={trashBusy || !surface.assets?.length} onClick={() => onTrash?.(surface)}><Trash2 size={16} /> Mettre cet élément dans la corbeille</button>
    </aside>
  )
}
