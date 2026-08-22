import { Box, Boxes, CheckCircle2, LoaderCircle, Ruler, ShieldCheck, Trash2, Triangle } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import VaultInstallControl from './VaultInstallControl.jsx'

const AssetPreview3D = lazy(() => import('./AssetPreview3D.jsx'))

const meters = (value) => Number(value || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const count = (value) => Number(value || 0).toLocaleString('fr-FR')

export default function AssetInspector({
  surface,
  projects,
  selectedProjectId,
  installing,
  onProject,
  onProjectFavorite,
  onInstall,
  onTrash,
  trashBusy,
}) {
  const [moduleId, setModuleId] = useState(surface.variantOptions?.[0]?.id || '')
  useEffect(() => setModuleId(surface.variantOptions?.[0]?.id || ''), [surface.id, surface.variantOptions])
  const activeModule = useMemo(
    () => surface.variantOptions?.find((module) => module.id === moduleId) || surface.variantOptions?.[0],
    [moduleId, surface.variantOptions],
  )
  const bounds = activeModule?.boundsMeters || {}

  return (
    <aside className="surface-inspector asset-inspector" aria-label="Détails de l’asset sélectionné">
      <header><div><small className="asset-inspector-kicker">Asset modulaire</small><h2>{surface.name}</h2></div><ShieldCheck size={20} /></header>
      {surface.description && <p className="asset-inspector-description">{surface.description}</p>}

      <div className="material-variants asset-modules">
        <span>Modules · {surface.variantOptions.length}</span>
        <div>
          {surface.variantOptions.map((module) => (
            <button key={module.id} type="button" className={module.id === activeModule?.id ? 'is-active' : ''} onClick={() => setModuleId(module.id)}>
              <i style={{ backgroundImage: module.preview ? `url(${module.preview})` : undefined }} />
              <b>{module.label}</b>
            </button>
          ))}
        </div>
      </div>

      <div className="inspector-sphere asset-preview-stage">
        <Suspense fallback={<div className="material-preview-loading" role="status"><LoaderCircle className="is-spinning" size={22} /> Préparation de l’asset 3D…</div>}>
          <AssetPreview3D
            modelUrl={activeModule?.modelUrl || ''}
            posterUrl={activeModule?.preview || surface.preview}
            resetToken={`${surface.id}:${activeModule?.id || ''}`}
          />
        </Suspense>
      </div>

      <dl className="surface-facts asset-facts">
        <div><dt><Box size={14} /> Catégorie</dt><dd>{surface.category}</dd></div>
        <div><dt><Boxes size={14} /> Pièces source</dt><dd>{count(activeModule?.meshObjectCount)}</dd></div>
        <div><dt><Triangle size={14} /> Triangles</dt><dd>{count(activeModule?.triangleCount)}</dd></div>
        <div><dt><Ruler size={14} /> Dimensions</dt><dd>{meters(bounds.x)} × {meters(bounds.y)} × {meters(bounds.z)} m</dd></div>
        <div><dt>Compatibilité</dt><dd className="compatibility-list">{surface.platforms.map((item) => <span key={item}><CheckCircle2 size={13} /> {item}</span>)}</dd></div>
      </dl>

      <p className="asset-install-note">Le mesh et ses matériaux PBR sont installés ensemble. Le succès exige la vérification de l’échelle, des triangles, des slots et de la sauvegarde.</p>
      <VaultInstallControl
        surface={surface}
        projects={projects}
        selectedProjectId={selectedProjectId}
        installing={installing}
        onProject={onProject}
        onProjectFavorite={onProjectFavorite}
        onInstall={onInstall}
        variant={activeModule}
      />
      <button className="vault-trash-trigger" type="button" disabled={trashBusy || !surface.assets?.length} onClick={() => onTrash?.(surface)}><Trash2 size={16} /> Mettre cet asset dans la corbeille</button>
    </aside>
  )
}
