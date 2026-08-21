import { Download, LoaderCircle } from 'lucide-react'
import { capabilityForSurface, projectSupportsSurface } from '../lib/installCapabilities.js'
import ProjectDestinationPicker from './ProjectDestinationPicker.jsx'

export default function VaultInstallControl({
  surface,
  projects,
  selectedProjectId,
  installing,
  onProject,
  onProjectFavorite,
  onInstall,
  variant,
}) {
  const selectedProject = projects.find((project) => project.id === selectedProjectId)
  const compatible = Boolean(selectedProject && surface.platforms.includes(selectedProject.platform))
  const supported = Boolean(selectedProject?.installCapabilities?.[capabilityForSurface(surface)])
  const canInstall = surface.installable && projectSupportsSurface(selectedProject, surface) && !installing
  const handoff = surface.installMode === 'UEFN_AUDIO_HANDOFF'

  return (
    <>
      <ProjectDestinationPicker
        projects={projects}
        selectedProjectId={selectedProjectId}
        acceptedPlatforms={surface.platforms}
        requiredCapability={capabilityForSurface(surface)}
        itemLabel={surface.kind === 'sound' ? 'ce son' : 'cet élément'}
        onProject={onProject}
        onFavorite={onProjectFavorite}
      />
      <button className="install-surface" type="button" disabled={!canInstall} onClick={() => onInstall(surface, variant)}>
        {installing ? <LoaderCircle className="is-spinning" size={19} /> : <Download size={19} />}
        {installing
          ? handoff ? 'Préparation de l’import audio…' : 'Installation et validation…'
          : surface.installable
            ? compatible
              ? supported
                ? handoff ? 'Préparer ce son dans le projet' : 'Installer dans ce projet'
                : `Adaptateur ${surface.kind === 'sound' ? 'audio' : 'de ce type'} indisponible`
              : `Choisir un projet ${surface.platforms.join(' / ')}`
            : 'Adaptateur d’installation requis'}
      </button>
    </>
  )
}
