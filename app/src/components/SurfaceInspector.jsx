import { CheckCircle2, ChevronDown, Circle, Download, Layers3, LoaderCircle, ShieldCheck, Square } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { studioApi } from '../lib/desktopApi.js'
import { usePreviewDescriptor } from './material-preview/usePreviewDescriptor.js'
import ProjectDestinationPicker from './ProjectDestinationPicker.jsx'

const MaterialPreview3D = lazy(() => import('./MaterialPreview3D.jsx'))

export default function SurfaceInspector({
  surface,
  projects,
  selectedProjectId,
  installing,
  onProject,
  onProjectFavorite,
  onInstall,
}) {
  const [shape, setShape] = useState('sphere')
  const [variantId, setVariantId] = useState('Standard')
  useEffect(() => setVariantId(surface?.variantOptions?.[0]?.id || 'Standard'), [surface?.id, surface?.variantOptions])
  const activeVariant = useMemo(
    () => surface?.variantOptions?.find((variant) => variant.id === variantId) || surface?.variantOptions?.[0],
    [surface?.variantOptions, variantId],
  )
  const activeAssetId = activeVariant?.assetId || surface?.installAssetId || ''
  const descriptorState = usePreviewDescriptor({
    assetId: activeAssetId,
    enabled: Boolean(activeAssetId),
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

  if (!surface) return <aside className="surface-inspector is-empty">Aucune matière dans cette sélection.</aside>

  const selectedProject = projects.find((project) => project.id === selectedProjectId)
  const projectCompatible = Boolean(selectedProject && surface.platforms.includes(selectedProject.platform))
  const projectTransferReady = selectedProject?.canInstall
    && (selectedProject.transferReady ?? selectedProject.connected)
  const canInstall = surface.installable && projectCompatible && projectTransferReady && !installing
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

      <ProjectDestinationPicker
        projects={projects}
        selectedProjectId={selectedProjectId}
        acceptedPlatforms={surface.platforms}
        onProject={onProject}
        onFavorite={onProjectFavorite}
      />

      <button className="install-surface" type="button" disabled={!canInstall} onClick={() => onInstall(surface, activeVariant)}>
        {installing ? <LoaderCircle className="is-spinning" size={19} /> : <Download size={19} />}
        {installing
          ? 'Installation et validation…'
          : surface.installable
            ? projectCompatible ? 'Installer dans ce projet' : `Choisir un projet ${surface.platforms.join(' / ')}`
            : 'Conversion en recette requise'}
      </button>
    </aside>
  )
}
