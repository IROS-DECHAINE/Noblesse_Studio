import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { PanelLeftOpen } from 'lucide-react'
import ModulePlaceholder from './components/ModulePlaceholder.jsx'
import SkinBackdrop from './components/SkinBackdrop.jsx'
import StudioSidebar from './components/StudioSidebar.jsx'
import { buildSurfaceCatalog } from './lib/catalog.js'
import { studioApi } from './lib/desktopApi.js'
import { loadStudioLayout, saveStudioLayout } from './lib/layoutPreferences.js'
import { SIDEBAR_MATERIAL_OPTIONS, getSkinDefinition, loadSkinPreferences, saveSkinPreferences } from './lib/skinPreferences.js'

const CalendarView = lazy(() => import('./components/CalendarView.jsx'))
const CoffreView = lazy(() => import('./components/CoffreView.jsx'))
const DashboardHome = lazy(() => import('./components/DashboardHome.jsx'))
const DocumentsView = lazy(() => import('./components/DocumentsView.jsx'))
const FinanceView = lazy(() => import('./components/FinanceView.jsx'))
const ProjectsView = lazy(() => import('./components/ProjectsView.jsx'))
const RecoveryView = lazy(() => import('./components/RecoveryView.jsx'))
const SkinsView = lazy(() => import('./components/SkinsView.jsx'))

const moduleTitles = {
  fortnite: 'Fortnite',
  roblox: 'Roblox',
}

const projectCanReceive = (project, capability = '') => Boolean(
  project?.canInstall
  && (project.transferReady ?? project.connected)
  && (!capability || project.installCapabilities?.[capability] === true),
)

export default function App() {
  const [section, setSection] = useState('home')
  const [skinPreferences, setSkinPreferences] = useState(() => loadSkinPreferences())
  const [assets, setAssets] = useState([])
  const [projects, setProjects] = useState([])
  const [projectLaunchProfiles, setProjectLaunchProfiles] = useState([])
  const [launchingProfileId, setLaunchingProfileId] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [query, setQuery] = useState('')
  const [vaultFamily, setVaultFamily] = useState('Matières')
  const [category, setCategory] = useState('Tout')
  const [platform, setPlatform] = useState('Toutes')
  const [selected, setSelected] = useState(null)
  const [layout, setLayout] = useState(() => loadStudioLayout())
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

  useEffect(() => {
    const saveTimer = window.setTimeout(() => saveStudioLayout(layout), 180)
    return () => window.clearTimeout(saveTimer)
  }, [layout])

  useEffect(() => {
    saveSkinPreferences(skinPreferences)
  }, [skinPreferences])

  const selectSkin = useCallback((skinId) => {
    const skin = getSkinDefinition(skinId)
    setSkinPreferences((current) => ({ ...current, skinId: skin.id }))
    setToast(`${skin.name} activé.`)
  }, [])

  const selectSkinMotion = useCallback((motion) => {
    setSkinPreferences((current) => ({ ...current, motion }))
  }, [])

  const selectSidebarMaterial = useCallback((sidebarMaterial) => {
    const material = SIDEBAR_MATERIAL_OPTIONS.find((option) => option.id === sidebarMaterial)
    if (!material) return
    setSkinPreferences((current) => ({ ...current, sidebarMaterial: material.id }))
    setToast(`${material.label} activé sur la colonne.`)
  }, [])

  const selectVaultFamily = useCallback((family) => {
    setVaultFamily(family)
    setCategory('Tout')
  }, [])

  const resizeSidebar = useCallback((sidebarWidth) => {
    setLayout((current) => ({ ...current, sidebarWidth }))
  }, [])

  const resizeInspector = useCallback((inspectorWidth) => {
    setLayout((current) => ({ ...current, inspectorWidth }))
  }, [])

  const collapseSidebar = useCallback(() => {
    setLayout((current) => ({ ...current, sidebarCollapsed: true }))
  }, [])

  const restoreSidebar = useCallback(() => {
    setLayout((current) => ({ ...current, sidebarCollapsed: false }))
  }, [])

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

  const refreshAssets = useCallback(() => Promise.all([studioApi.assets(), studioApi.vaultHealth()])
    .then(([items, integrity]) => {
      const nextItems = Array.isArray(items) ? items : []
      setAssets(nextItems)
      setVaultIntegrity(integrity)
      return nextItems
    })
    .catch(() => {
      setAssets([])
      setVaultIntegrity(null)
      return []
    }), [])

  useEffect(() => {
    refreshAssets()
    const unsubscribe = studioApi.onVaultUpdated(refreshAssets)
    return unsubscribe
  }, [refreshAssets])

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
    if (projectCanReceive(current, selected.installCapability) && selected.platforms.includes(current.platform)) return
    const compatible = projects.find((project) => (
      projectCanReceive(project, selected.installCapability) && selected.platforms.includes(project.platform)
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
    if (!projectCanReceive(destination, surface.installCapability)) {
      setToast('Ce projet destination n’est pas prêt au transfert.')
      return
    }
    if (!surface.platforms.includes(destination.platform)) {
      setToast(`Choisis un projet ${surface.platforms.join(' / ')} compatible avec cet élément.`)
      return
    }
    setInstalling(true)
    setToast(`Installation de ${surface.name} en cours…`)
    try {
      const result = await studioApi.installAsset({
        assetId: variant?.installAssetId || surface.installAssetId,
        projectId: selectedProjectId,
      })
      if (result.mode === 'MANUAL_AUDIO_IMPORT_READY') {
        setToast(`${surface.name} est prêt : le dossier Audio est ouvert dans UEFN et le WAV est sélectionné dans l’Explorateur. Glisse-le dans UEFN pour terminer.`)
      } else {
        const wording = result.mode === 'ALREADY_INSTALLED' ? 'déjà présent et vérifié' : 'installé et vérifié'
        setToast(`${surface.name} ${wording} dans ${result.project}.`)
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Installation impossible')
    } finally {
      setInstalling(false)
    }
  }

  const handleSoundImported = useCallback(async (job) => {
    const nextAssets = await refreshAssets()
    setVaultFamily('Sons')
    setCategory('Tout')
    const importedAssetId = [...(job?.items || [])].reverse().find((item) => item.status === 'COMPLETED')?.result?.assetId
    const importedSurface = buildSurfaceCatalog(nextAssets).find((surface) => surface.assets?.some((asset) => asset.asset_id === importedAssetId))
    if (importedSurface) setSelected(importedSurface)
  }, [refreshAssets])

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
    <div
      className={`studio-shell${layout.sidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}
      style={{ '--studio-sidebar-width': `${layout.sidebarWidth}px` }}
      data-skin={skinPreferences.skinId}
      data-skin-motion={skinPreferences.motion}
      data-sidebar-material={skinPreferences.sidebarMaterial}
    >
      <SkinBackdrop key={skinPreferences.skinId} skinId={skinPreferences.skinId} motion={skinPreferences.motion} />
      <StudioSidebar
        section={section}
        connected={connected}
        width={layout.sidebarWidth}
        onNavigate={navigate}
        onWidth={resizeSidebar}
        onCollapse={collapseSidebar}
      />
      <div className="studio-main">
        {layout.sidebarCollapsed && (
          <button className="studio-sidebar-restore" type="button" aria-label="Afficher la navigation" title="Afficher la navigation" onClick={restoreSidebar}>
            <PanelLeftOpen size={20} />
          </button>
        )}
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
            family={vaultFamily}
            category={category}
            platform={platform}
            selected={selected}
            projects={projects}
            selectedProjectId={selectedProjectId}
            connected={connected}
            installing={installing}
            vaultIntegrity={vaultIntegrity}
            inspectorWidth={layout.inspectorWidth}
            onQuery={setQuery}
            onFamily={selectVaultFamily}
            onCategory={setCategory}
            onPlatform={setPlatform}
            onSelect={setSelected}
            onProject={setSelectedProjectId}
            onProjectFavorite={toggleProjectFavorite}
            onInstall={installSurface}
            onInspectorWidth={resizeInspector}
            onSoundImported={handleSoundImported}
            onVaultChanged={refreshAssets}
            onNotify={setToast}
          />
        )}
        {section === 'documents' && (
          <DocumentsView onNotify={setToast} />
        )}
        {section === 'finance' && <FinanceView />}
        {section === 'calendar' && (
          <CalendarView openItemId={calendarOpenItemId} onOpenItemHandled={() => setCalendarOpenItemId(null)} />
        )}
        {section === 'skins' && (
          <SkinsView
            skinId={skinPreferences.skinId}
            motion={skinPreferences.motion}
            sidebarMaterial={skinPreferences.sidebarMaterial}
            onSkin={selectSkin}
            onMotion={selectSkinMotion}
            onSidebarMaterial={selectSidebarMaterial}
          />
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
