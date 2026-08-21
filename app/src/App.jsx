import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import ModulePlaceholder from './components/ModulePlaceholder.jsx'
import StudioSidebar from './components/StudioSidebar.jsx'
import { buildSurfaceCatalog } from './lib/catalog.js'
import { studioApi } from './lib/desktopApi.js'

const CalendarView = lazy(() => import('./components/CalendarView.jsx'))
const CoffreView = lazy(() => import('./components/CoffreView.jsx'))
const DashboardHome = lazy(() => import('./components/DashboardHome.jsx'))
const DocumentsView = lazy(() => import('./components/DocumentsView.jsx'))
const FinanceView = lazy(() => import('./components/FinanceView.jsx'))
const ProjectsView = lazy(() => import('./components/ProjectsView.jsx'))
const RecoveryView = lazy(() => import('./components/RecoveryView.jsx'))

const moduleTitles = {
  fortnite: 'Fortnite',
  roblox: 'Roblox',
}

const projectCanReceive = (project) => Boolean(
  project?.canInstall && (project.transferReady ?? project.connected),
)

export default function App() {
  const [section, setSection] = useState('home')
  const [assets, setAssets] = useState([])
  const [projects, setProjects] = useState([])
  const [projectLaunchProfiles, setProjectLaunchProfiles] = useState([])
  const [launchingProfileId, setLaunchingProfileId] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Tout')
  const [platform, setPlatform] = useState('Toutes')
  const [selected, setSelected] = useState(null)
  const [installing, setInstalling] = useState(false)
  const [fortniteStats, setFortniteStats] = useState({
    connected: false,
    dataStatus: 'UNAVAILABLE',
    stale: false,
    checkedAt: null,
    updatedAt: null,
    currentPlayers: null,
    currentPlayersAvailable: false,
    currentPlayersSuppressed: false,
    peak24h: null,
    peak24hAvailable: false,
    peak24hSuppressed: false,
    plays24h: null,
    plays24hAvailable: false,
    plays24hComplete: false,
    plays24hSuppressed: false,
    minutesPlayed24h: null,
    minutesPlayed24hAvailable: false,
    minutesPlayed24hComplete: false,
    minutesPlayed24hSuppressed: false,
    hourlyPeakCCU: [],
    threshold: 5,
  })
  const [fortniteRefreshing, setFortniteRefreshing] = useState(false)
  const [toast, setToast] = useState('')
  const [vaultIntegrity, setVaultIntegrity] = useState(null)
  const [calendarOpenItemId, setCalendarOpenItemId] = useState(null)

  const surfaces = useMemo(() => buildSurfaceCatalog(assets), [assets])
  const connected = useMemo(() => projects.some((project) => project.platform === 'UEFN' && project.connected), [projects])

  const applyProjects = useCallback((items) => {
    const nextProjects = Array.isArray(items) ? items : []
    setProjects(nextProjects)
    setSelectedProjectId((currentId) => {
      const current = nextProjects.find((project) => project.id === currentId)
      if (projectCanReceive(current)) return currentId
      const connectedFavorite = nextProjects.find((project) => projectCanReceive(project) && project.favorite)
      const firstConnected = connectedFavorite || nextProjects.find(projectCanReceive)
      if (firstConnected) return firstConnected.id
      if (current) return current.id
      return nextProjects.find((project) => project.favorite)?.id || ''
    })
    return nextProjects
  }, [])

  const refreshProjects = useCallback(() => studioApi.projects()
    .then(applyProjects)
    .catch(() => applyProjects([])), [applyProjects])

  const refreshProjectLaunchProfiles = useCallback(() => studioApi.projectLaunchProfiles()
    .then((profiles) => {
      const nextProfiles = Array.isArray(profiles) ? profiles : []
      setProjectLaunchProfiles(nextProfiles)
      return nextProfiles
    })
    .catch(() => {
      setProjectLaunchProfiles([])
      return []
    }), [])

  useEffect(() => {
    const refreshAssets = () => Promise.all([studioApi.assets(), studioApi.vaultHealth()])
      .then(([items, integrity]) => {
        setAssets(items)
        setVaultIntegrity(integrity)
      })
      .catch(() => {
        setAssets([])
        setVaultIntegrity(null)
      })
    refreshAssets()
    const unsubscribe = studioApi.onVaultUpdated(refreshAssets)
    return unsubscribe
  }, [])

  useEffect(() => {
    const refreshProjectWorkspace = () => Promise.all([refreshProjects(), refreshProjectLaunchProfiles()])
    refreshProjectWorkspace()
    const timer = window.setInterval(refreshProjectWorkspace, 4000)
    window.addEventListener('focus', refreshProjectWorkspace)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshProjectWorkspace)
    }
  }, [refreshProjectLaunchProfiles, refreshProjects])

  useEffect(() => {
    if (!surfaces.length || selected) return
    setSelected(surfaces.find((surface) => surface.installable) || surfaces[0])
  }, [surfaces, selected])

  useEffect(() => {
    if (!selected?.platforms?.length || !projects.length) return
    const current = projects.find((project) => project.id === selectedProjectId)
    if (projectCanReceive(current) && selected.platforms.includes(current.platform)) return
    const compatible = projects.find((project) => (
      projectCanReceive(project) && selected.platforms.includes(project.platform)
    ))
    if (compatible) setSelectedProjectId(compatible.id)
  }, [projects, selected, selectedProjectId])

  const refreshFortnite = useCallback(async ({ force = false } = {}) => {
    setFortniteRefreshing(true)
    try {
      setFortniteStats(await studioApi.fortnitePrimebot({ force }))
    } catch {
      setFortniteStats((current) => current.updatedAt
        ? {
            ...current,
            connected: false,
            dataStatus: 'STALE',
            stale: true,
            checkedAt: new Date().toISOString(),
          }
        : {
            ...current,
            connected: false,
            dataStatus: 'UNAVAILABLE',
            stale: false,
            checkedAt: new Date().toISOString(),
          })
    } finally {
      setFortniteRefreshing(false)
    }
  }, [])

  useEffect(() => {
    refreshFortnite()
    const timer = window.setInterval(refreshFortnite, 5 * 60 * 1000)
    const refreshOnFocus = () => refreshFortnite()
    const refreshOnReconnect = () => refreshFortnite({ force: true })
    window.addEventListener('focus', refreshOnFocus)
    window.addEventListener('online', refreshOnReconnect)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshOnFocus)
      window.removeEventListener('online', refreshOnReconnect)
    }
  }, [refreshFortnite])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(''), 6500)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => studioApi.onNavigate((request) => {
    if (!request?.section) return
    setSection(request.section)
    if (request.section !== 'vault') setQuery('')
    setCalendarOpenItemId(request.section === 'calendar' ? request.itemId || null : null)
  }), [])

  const navigate = (nextSection) => {
    setSection(nextSection)
    if (nextSection !== 'vault') setQuery('')
  }

  const installSurface = async (surface, variant) => {
    if (!surface.installable) {
      setToast('Cette ancienne entrée doit encore être convertie en recette Noblesse Studio.')
      return
    }
    if (!selectedProjectId) {
      setToast('Choisis un projet destination avant l’installation.')
      return
    }
    const destination = projects.find((project) => project.id === selectedProjectId)
    if (!projectCanReceive(destination)) {
      setToast('Ce projet destination n’est pas prêt au transfert.')
      return
    }
    if (!surface.platforms.includes(destination.platform)) {
      setToast(`Choisis un projet ${surface.platforms.join(' / ')} compatible avec cette matière.`)
      return
    }
    setInstalling(true)
    setToast(`Installation de ${surface.name} en cours…`)
    try {
      const result = await studioApi.installAsset({
        assetId: variant?.installAssetId || surface.installAssetId,
        projectId: selectedProjectId,
      })
      const wording = result.mode === 'ALREADY_INSTALLED' ? 'déjà présent et vérifié' : 'installé et validé'
      setToast(`${surface.name} ${wording} dans ${result.project}.`)
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Installation impossible')
    } finally {
      setInstalling(false)
    }
  }

  const toggleProjectFavorite = async (projectId, favorite) => {
    try {
      const nextProjects = await studioApi.setProjectFavorite({ projectId, favorite })
      applyProjects(nextProjects)
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Impossible de modifier les favoris')
    }
  }

  const launchProject = async (profileId) => {
    if (!profileId || launchingProfileId) return
    setLaunchingProfileId(profileId)
    setToast('Lancement UEFN sécurisé en cours…')
    try {
      const result = await studioApi.launchProject(profileId)
      const label = result?.profile?.displayName || 'Le projet'
      if (result?.status === 'ALREADY_READY') setToast(`${label} est déjà ouvert et son MCP est vérifié.`)
      else if (result?.status === 'ALREADY_LAUNCHING') setToast(`${label} est déjà en cours de lancement.`)
      else setToast(`${label} démarre avec son port MCP dédié. La carte passera au vert après validation réelle.`)
      await Promise.all([refreshProjects(), refreshProjectLaunchProfiles()])
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Lancement UEFN impossible')
      await refreshProjectLaunchProfiles()
    } finally {
      setLaunchingProfileId('')
    }
  }

  return (
    <div className="studio-shell">
      <StudioSidebar section={section} connected={connected} onNavigate={navigate} />
      <div className="studio-main">
        <Suspense fallback={<div className="module-loading" role="status">Ouverture du module…</div>}>
        {section === 'home' && (
          <DashboardHome
            connected={connected}
            fortniteStats={fortniteStats}
            refreshing={fortniteRefreshing}
            onNavigate={navigate}
            onRefresh={() => refreshFortnite({ force: true })}
          />
        )}
        {section === 'projects' && (
          <ProjectsView
            fortniteStats={fortniteStats}
            launchProfiles={projectLaunchProfiles}
            launchingProfileId={launchingProfileId}
            onLaunchProject={launchProject}
            onNavigate={navigate}
          />
        )}
        {section === 'vault' && (
          <CoffreView
            surfaces={surfaces}
            query={query}
            category={category}
            platform={platform}
            selected={selected}
            projects={projects}
            selectedProjectId={selectedProjectId}
            connected={connected}
            installing={installing}
            vaultIntegrity={vaultIntegrity}
            onQuery={setQuery}
            onCategory={setCategory}
            onPlatform={setPlatform}
            onSelect={setSelected}
            onProject={setSelectedProjectId}
            onProjectFavorite={toggleProjectFavorite}
            onInstall={installSurface}
          />
        )}
        {section === 'documents' && (
          <DocumentsView onNotify={setToast} />
        )}
        {section === 'finance' && <FinanceView />}
        {section === 'calendar' && (
          <CalendarView openItemId={calendarOpenItemId} onOpenItemHandled={() => setCalendarOpenItemId(null)} />
        )}
        {section === 'settings' && (
          <RecoveryView />
        )}
        {moduleTitles[section] && <ModulePlaceholder title={moduleTitles[section]} />}
        </Suspense>
      </div>
      {toast && <div className="studio-toast" role="status">{toast}</div>}
    </div>
  )
}
