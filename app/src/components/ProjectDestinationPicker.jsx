import { ChevronDown, FolderOpen, Star } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

export default function ProjectDestinationPicker({ projects, selectedProjectId, acceptedPlatforms = [], onProject, onFavorite }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const selected = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId],
  )
  const isCompatible = (project) => !acceptedPlatforms.length || acceptedPlatforms.includes(project.platform)
  const isReady = (project) => Boolean(
    project.canInstall
    && (project.transferReady ?? project.connected)
    && isCompatible(project),
  )
  const isLive = (project) => Boolean(
    isReady(project)
    && (project.connected || (project.platform === 'Unreal' && project.opened)),
  )
  const availableProjects = useMemo(
    () => projects.filter((project) => (
      project.opened
      || project.connected
    )),
    [projects, acceptedPlatforms],
  )
  const readyProjects = useMemo(
    () => availableProjects.filter(isReady),
    [availableProjects, acceptedPlatforms],
  )
  const unavailableProjects = useMemo(
    () => availableProjects.filter((project) => !isReady(project)),
    [availableProjects, acceptedPlatforms],
  )
  const offlineFavorites = useMemo(
    () => projects.filter((project) => project.favorite && !project.opened && !project.connected),
    [projects],
  )

  const projectStatus = (project) => {
    if (!isCompatible(project)) return `Incompatible avec cette matière · ${project.platform}`
    if (project.platform === 'Unreal') {
      if (project.opened && isReady(project)) return `Unreal ouvert · import natif local ${project.engineVersion}`
      if (!project.opened) return `Projet Unreal fermé · version ${project.engineVersion || 'inconnue'}`
    }
    if (project.connected && project.canInstall && project.mcpWarning?.code === 'PORT_PREFERENCE_MISMATCH') {
      return `Prêt · MCP ${project.port} · port préféré ${project.mcpWarning.preferredPort}`
    }
    if (project.connected && project.canInstall) return `Prêt au transfert · MCP ${project.port}`
    if (project.mcpIssue?.code === 'PORT_MISMATCH') {
      return `Mauvais port · attendu ${project.mcpIssue.expectedPort}, détecté ${project.mcpIssue.actualPort}`
    }
    if (project.connected) return `MCP ${project.port} connecté · outils d’import incomplets`
    if (project.opened && project.mcpIssue?.code === 'PORT_CONFLICT') {
      return `UEFN ouvert · port MCP ${project.mcpIssue.port} occupé`
    }
    if (project.opened) return 'UEFN ouvert · MCP indisponible'
    return 'Fermé · favori conservé'
  }

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const renderProject = (project) => (
    <div className={`destination-project-row${project.id === selectedProjectId ? ' is-selected' : ''}`} key={project.id}>
      <button
        type="button"
        className="destination-project-select"
        disabled={!isReady(project)}
        onClick={() => {
          onProject(project.id)
          setOpen(false)
        }}
      >
        <i className={`destination-led${isLive(project) ? ' is-online' : ''}`} />
        <span>
          <strong>{project.name}</strong>
          <small>{projectStatus(project)}</small>
        </span>
      </button>
      {project.platform === 'UEFN' && (
        <button
          type="button"
          className={`destination-favorite${project.favorite ? ' is-favorite' : ''}`}
          aria-label={project.favorite ? `Retirer ${project.name} des favoris` : `Ajouter ${project.name} aux favoris`}
          aria-pressed={project.favorite}
          onClick={() => onFavorite(project.id, !project.favorite)}
        >
          <Star size={15} fill={project.favorite ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  )

  return (
    <div className="project-destination" ref={rootRef}>
      <span><FolderOpen size={15} /> Projet destination</span>
      <button
        type="button"
        className="project-destination-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <i className={`destination-led${selected && isLive(selected) ? ' is-online' : ''}`} />
        <span>
          <strong>{selected?.name || 'Choisir un projet ouvert'}</strong>
          <small>{selected
            ? projectStatus(selected)
            : 'Aucune session sélectionnée'}</small>
        </span>
        <ChevronDown size={16} />
      </button>

      {open && (
        <div className="project-destination-menu" role="listbox" aria-label="Projets compatibles avec la matière">
          <div className="destination-menu-heading">
            <strong>Projets destination</strong>
            <span>{readyProjects.length} disponible{readyProjects.length > 1 ? 's' : ''}</span>
          </div>
          {readyProjects.length ? readyProjects.map(renderProject) : (
            <p className="destination-empty">Aucun projet prêt au transfert.</p>
          )}
          {unavailableProjects.length > 0 && (
            <>
              <div className="destination-menu-divider"><span>Indisponibles ou incompatibles</span></div>
              {unavailableProjects.map(renderProject)}
            </>
          )}
          {offlineFavorites.length > 0 && (
            <>
              <div className="destination-menu-divider"><span>Favoris hors ligne</span></div>
              {offlineFavorites.map(renderProject)}
            </>
          )}
        </div>
      )}
      <small>
        {selected && isReady(selected)
          ? selected && isLive(selected)
            ? 'LED verte : session éditeur identifiée, transfert disponible'
            : 'Projet détecté mais aucune session active pour le transfert'
          : `Choisis un projet ${acceptedPlatforms.join(' / ') || 'compatible'} prêt au transfert`}
      </small>
    </div>
  )
}
