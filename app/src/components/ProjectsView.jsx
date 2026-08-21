import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Blocks,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Gamepad2,
  LoaderCircle,
  MousePointerClick,
  Play,
  Radio,
  Route,
  Save,
  TriangleAlert,
} from 'lucide-react'
import {
  getRoadmapSnapshot,
  loadRoadmapWorkspace,
  portfolioProjects,
  saveRoadmapWorkspace,
  toggleRoadmapStep,
} from '../data/projectRoadmaps.js'
import { publicAsset } from '../lib/desktopApi.js'
import { getProjectLaunchAction } from '../lib/projectLaunchUi.js'

const formatNumber = (value) => new Intl.NumberFormat('fr-FR').format(Number(value) || 0)

const iconByType = {
  blocks: Blocks,
  gamepad: Gamepad2,
}

function readRoadmapWorkspace() {
  try {
    return loadRoadmapWorkspace(window.localStorage)
  } catch {
    return loadRoadmapWorkspace({ getItem: () => null })
  }
}

export default function ProjectsView({
  fortniteStats,
  launchProfiles = [],
  launchingProfileId = '',
  onLaunchProject,
  onNavigate,
}) {
  const projectRailRef = useRef(null)
  const roadmapPanelRef = useRef(null)
  const roadmapTitleRef = useRef(null)
  const [roadmapWorkspace, setRoadmapWorkspace] = useState(readRoadmapWorkspace)
  const [storageStatus, setStorageStatus] = useState('saving')
  const [lastToggledStepId, setLastToggledStepId] = useState(null)
  const [roadmapAnnouncement, setRoadmapAnnouncement] = useState('')

  const { progress: roadmapProgress, selectedProjectId } = roadmapWorkspace
  const launchProfileByProject = useMemo(() => new Map(
    launchProfiles.filter((profile) => profile.portfolioProjectId).map((profile) => [profile.portfolioProjectId, profile]),
  ), [launchProfiles])

  const rows = useMemo(() => portfolioProjects.map((project) => {
    if (project.id !== 'primebot-rush') {
      return {
        ...project,
        image: publicAsset(project.imagePath),
        live: false,
        players: 0,
      }
    }

    return {
      ...project,
      name: fortniteStats.island?.title || project.name,
      image: publicAsset(project.imagePath),
      status: fortniteStats.connected ? 'Source Epic connectée' : 'Source Epic indisponible',
      live: fortniteStats.connected,
      players: fortniteStats.currentPlayers,
      detail: fortniteStats.island?.code || project.detail,
    }
  }), [fortniteStats])

  const selectedProject = rows.find((project) => project.id === selectedProjectId) || rows[0]
  const selectedProjectIndex = Math.max(0, rows.findIndex((project) => project.id === selectedProject.id))
  const selectedProgress = roadmapProgress[selectedProject.id] || {}
  const {
    completedSteps,
    totalSteps,
    progressPercent,
    nextStep,
    nextStepIndex,
    isComplete,
  } = getRoadmapSnapshot(selectedProject, selectedProgress)

  useEffect(() => {
    let saved = false
    try {
      saved = saveRoadmapWorkspace(window.localStorage, roadmapWorkspace)
    } catch {
      saved = false
    }
    setStorageStatus(saved ? 'saved' : 'session-only')
  }, [roadmapWorkspace])

  useEffect(() => {
    if (!lastToggledStepId) return undefined
    const timeout = window.setTimeout(() => setLastToggledStepId(null), 420)
    return () => window.clearTimeout(timeout)
  }, [lastToggledStepId])

  const prefersReducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

  const selectProjectAtIndex = (requestedIndex, { focusSelector = false, revealRoadmap = false } = {}) => {
    if (!rows.length) return
    const nextIndex = Math.min(rows.length - 1, Math.max(0, requestedIndex))
    const nextProject = rows[nextIndex]
    setRoadmapWorkspace((current) => current.selectedProjectId === nextProject.id
      ? current
      : { ...current, selectedProjectId: nextProject.id })
    setRoadmapAnnouncement(`Projet ${nextProject.roadmapName} affiché.`)

    window.requestAnimationFrame(() => {
      const selector = document.getElementById(`project-selector-${nextProject.id}`)
      selector?.closest('.project-card')?.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'nearest',
        inline: 'center',
      })
      if (focusSelector) selector?.focus({ preventScroll: true })
      if (revealRoadmap) {
        roadmapPanelRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
        roadmapTitleRef.current?.focus({ preventScroll: true })
      }
    })
  }

  const handleProjectRailWheel = (event) => {
    const rail = projectRailRef.current
    if (!rail) return
    const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth)
    if (!maxScroll) return
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    const nextScroll = Math.min(maxScroll, Math.max(0, rail.scrollLeft + delta))
    if (nextScroll === rail.scrollLeft) return
    event.preventDefault()
    rail.scrollLeft = nextScroll
  }

  const moveProjectSelection = (event, currentIndex) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !rows.length) return
    event.preventDefault()
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? rows.length - 1
        : event.key === 'ArrowLeft'
          ? (currentIndex - 1 + rows.length) % rows.length
          : (currentIndex + 1) % rows.length
    selectProjectAtIndex(nextIndex, { focusSelector: true })
  }

  const toggleStep = (step) => {
    const willBeDone = !Boolean(selectedProgress[step.id])
    setRoadmapWorkspace((current) => ({
      ...current,
      progress: toggleRoadmapStep(current.progress, selectedProject.id, step.id),
    }))
    setLastToggledStepId(step.id)
    setRoadmapAnnouncement(`${step.title} ${willBeDone ? 'validée' : 'rouverte'}.`)
  }

  const sliderProgress = rows.length > 1 ? (selectedProjectIndex / (rows.length - 1)) * 100 : 0

  return (
    <section className="workspace-page projects-page">
      <header className="workspace-header">
        <div>
          <span className="workspace-kicker"><Radio size={15} /> Portefeuille du studio</span>
          <h1>Projets</h1>
          <p>Une vue claire des jeux suivis. Les nombres restent à zéro tant qu’une vraie source n’est pas reliée.</p>
        </div>
        <button className="secondary-action" type="button" onClick={() => onNavigate('calendar')}><CalendarPlus size={17} /> Ouvrir le planning</button>
      </header>

      <div className="project-rail-shell">
        <div
          className="project-cards"
          ref={projectRailRef}
          role="list"
          aria-label="Projets du studio"
          onWheel={handleProjectRailWheel}
        >
          {rows.map(({ icon, ...project }, projectIndex) => {
            const selected = project.id === selectedProject.id
            const launchProfile = launchProfileByProject.get(project.id)
            const isUefnLaunchTarget = launchProfile?.platform === 'UEFN'
            const Icon = isUefnLaunchTarget ? Gamepad2 : iconByType[icon] || Blocks
            const platformLabel = isUefnLaunchTarget ? 'Fortnite / UEFN' : project.platform
            const launchAction = getProjectLaunchAction(launchProfile, launchingProfileId === launchProfile?.id)
            const LaunchIcon = launchAction?.tone === 'ready'
              ? CircleCheck
              : launchAction?.tone === 'error' || launchAction?.tone === 'warning'
                ? TriangleAlert
                : launchAction?.busy ? LoaderCircle : Play
            return (
              <article className={`project-card premium-panel ${selected ? 'is-selected' : ''}`} data-project-id={project.id} role="listitem" key={project.id}>
                <button
                  className="project-card-select"
                  id={`project-selector-${project.id}`}
                  type="button"
                  aria-label={`Afficher la roadmap de ${project.roadmapName}`}
                  aria-pressed={selected}
                  aria-controls="selected-project-roadmap"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => selectProjectAtIndex(projectIndex, { revealRoadmap: true })}
                  onKeyDown={(event) => moveProjectSelection(event, projectIndex)}
                />
                <img src={project.image} alt={`Miniature ${project.name}`} />
                <div className="project-card-body">
                  <header><span className={project.live ? 'is-live' : ''}><i /> {project.status}</span><b>{project.phase}</b></header>
                  <h2>{project.name}</h2>
                  <p><Icon size={15} /> {platformLabel}</p>
                  {launchAction && (
                    <p className={`project-launch-status is-${launchAction.tone}`} title={launchAction.statusLabel} aria-live="polite">
                      <i /> {launchAction.statusLabel}
                    </p>
                  )}
                  <div className="project-card-metrics"><div><span>Joueurs actuels</span><strong>{formatNumber(project.players)}</strong></div><div><span>Référence</span><strong className="is-small">{project.detail}</strong></div></div>
                  <div className="project-card-actions">
                    {launchAction && (
                      <button
                        className={`project-launch-action is-${launchAction.tone}`}
                        type="button"
                        disabled={launchAction.disabled}
                        title={launchAction.statusLabel}
                        onClick={(event) => {
                          event.stopPropagation()
                          onLaunchProject?.(launchProfile.id)
                        }}
                      >
                        <LaunchIcon className={launchAction.busy ? 'is-spinning' : ''} size={15} />
                        <span>{launchAction.label}</span>
                      </button>
                    )}
                    <button className="project-plan-action" type="button" onClick={() => onNavigate('calendar')}>Planifier une action <ArrowRight size={16} /></button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>

        <div className="project-rail-navigation" aria-label="Faire défiler les projets">
          <button type="button" aria-label="Projet précédent" disabled={selectedProjectIndex === 0} onClick={() => selectProjectAtIndex(selectedProjectIndex - 1)}><ChevronLeft size={16} /></button>
          <input
            className="project-rail-slider"
            type="range"
            min="1"
            max={Math.max(1, rows.length)}
            step="1"
            value={selectedProjectIndex + 1}
            disabled={rows.length <= 1}
            aria-label={`Choisir un projet. Projet ${selectedProjectIndex + 1} sur ${rows.length}`}
            style={{ '--project-slider-progress': `${sliderProgress}%` }}
            onChange={(event) => selectProjectAtIndex(Number(event.currentTarget.value) - 1)}
          />
          <span>Projet {selectedProjectIndex + 1} sur {rows.length}</span>
          <button type="button" aria-label="Projet suivant" disabled={selectedProjectIndex === rows.length - 1} onClick={() => selectProjectAtIndex(selectedProjectIndex + 1)}><ChevronRight size={16} /></button>
        </div>
      </div>

      <section
        className="project-roadmap premium-panel"
        id="selected-project-roadmap"
        ref={roadmapPanelRef}
        role="region"
        data-project-id={selectedProject.id}
        aria-labelledby="selected-project-roadmap-title"
      >
        <header className="roadmap-header">
          <div className="roadmap-heading">
            <span><Route size={16} /> Roadmap</span>
            <h2 id="selected-project-roadmap-title" ref={roadmapTitleRef} tabIndex="-1">{selectedProject.roadmapName}</h2>
            <p>{selectedProject.summary}</p>
            <small>{selectedProject.reviewedAt}</small>
          </div>
          <div
            className="roadmap-progress"
            role="progressbar"
            aria-label="Progression de la roadmap"
            aria-valuemin="0"
            aria-valuemax={Math.max(1, totalSteps)}
            aria-valuenow={completedSteps}
            aria-valuetext={totalSteps ? `${completedSteps} étapes validées sur ${totalSteps}` : 'Aucune étape définie'}
          >
            <div><strong>{completedSteps}/{totalSteps}</strong><span>étapes validées</span></div>
            <div className="roadmap-progress-track"><span style={{ width: `${progressPercent}%` }} /></div>
            <div className={`roadmap-next-step ${isComplete ? 'is-complete' : ''}`}>
              {nextStep ? <><span>Prochaine étape</span><strong>{nextStep.title}</strong></> : <><Check size={14} /><strong>{totalSteps ? 'Roadmap terminée' : 'Roadmap à définir'}</strong></>}
            </div>
          </div>
        </header>

        <div className="roadmap-steps">
          {selectedProject.roadmap.map((step, index) => {
            const done = Boolean(selectedProgress[step.id])
            const current = index === nextStepIndex
            const previousDone = index > 0 && Boolean(selectedProgress[selectedProject.roadmap[index - 1].id])
            const connectorDone = index > 0 && done && previousDone
            const connectorCurrent = index > 0 && current && previousDone
            const stateLabel = done ? 'Validé' : current ? 'À faire maintenant' : 'À venir'
            return (
              <button
                className={`roadmap-step ${done ? 'is-done' : ''} ${current ? 'is-current' : ''} ${connectorDone ? 'is-connector-done' : ''} ${connectorCurrent ? 'is-connector-current' : ''} ${lastToggledStepId === step.id ? 'is-just-updated' : ''}`}
                data-roadmap-step={step.id}
                type="button"
                aria-pressed={done}
                aria-current={current ? 'step' : undefined}
                aria-label={`${done ? 'Rouvrir' : 'Valider'} l’étape ${step.title}`}
                key={step.id}
                onClick={() => toggleStep(step)}
              >
                <span className="roadmap-bubble">{done ? <Check size={19} strokeWidth={2.5} /> : index + 1}</span>
                <span className="roadmap-step-copy">
                  <strong>{step.title}</strong>
                  <span>{step.description}</span>
                  <small>{stateLabel}</small>
                </span>
              </button>
            )
          })}
        </div>

        <span className="roadmap-announcement" aria-live="polite" aria-atomic="true">{roadmapAnnouncement}</span>

        <footer className="roadmap-footer">
          <span><MousePointerClick size={15} /> Clique sur une bulle pour valider ou rouvrir une étape.</span>
          <span className={storageStatus === 'session-only' ? 'is-storage-warning' : ''} aria-live="polite">
            <Save size={14} />
            {storageStatus === 'saved' ? 'Progression sauvegardée sur cet appareil' : storageStatus === 'session-only' ? 'Progression conservée pour cette session uniquement' : 'Sauvegarde en cours'}
          </span>
        </footer>
      </section>
    </section>
  )
}
