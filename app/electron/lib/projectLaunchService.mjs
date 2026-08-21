import { spawn } from 'node:child_process'
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { loadProjectConnectionRegistry } from './projectConnectionRegistry.mjs'
import { discoverUefnEditorExecutable } from './uefnExecutableDiscovery.mjs'
import { prepareUefnEditorLaunchSettings } from './uefnEditorSettings.mjs'
import { listUefnProcessIds } from './uefnOpenProjectDiscovery.mjs'

const STATE_SCHEMA_VERSION = 1
const DEFAULT_TIMEOUT_MS = 180_000
const DEFAULT_PROJECT_LOAD_GRACE_MS = 30_000
const DEFAULT_PROCESS_SETTLE_TIMEOUT_MS = 12_000
const DEFAULT_PROCESS_SETTLE_INTERVAL_MS = 300
const LAUNCH_STRATEGY = 'UEFN_VALKYRIE_PROJECT_V3'

const normalizeMount = (value = '') => String(value).trim().replace(/^\/+|\/+$/g, '').toLocaleLowerCase('en-US')

const pathExists = async (file) => {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

const isTcpPortAvailable = (port, host = '127.0.0.1') => new Promise((resolve) => {
  const server = net.createServer()
  server.unref()
  server.once('error', () => resolve(false))
  server.listen({ host, port, exclusive: true }, () => server.close(() => resolve(true)))
})

const spawnUefnEditor = (executable, args) => new Promise((resolve, reject) => {
  const child = spawn(executable, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    shell: false,
  })
  child.once('error', reject)
  child.once('spawn', () => {
    child.unref()
    resolve({ pid: child.pid || null })
  })
})

const isProcessAlive = async (processId) => {
  if (!Number.isInteger(processId) || processId <= 0) return false
  try {
    process.kill(processId, 0)
    return true
  } catch {
    return false
  }
}

const wait = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs))

const buildUefnLaunchArguments = (project) => {
  const descriptor = String(project?.descriptorPath || '').trim()
  const descriptorForIni = descriptor.replaceAll('\\', '/')
  const urlPath = String(project?.path || '/mcp').trim()
  if (!descriptor || /[\r\n,\0]/.test(descriptorForIni) || /[\r\n,\0]/.test(urlPath)) {
    throw new Error('Le profil UEFN contient une valeur incompatible avec le lanceur.')
  }
  const iniOverrides = [
    '[/Script/ValkyrieEditor.ValkyrieEditorConfig]:bStartupWithLastProject=True',
    `[/Script/ValkyrieEditor.ValkyrieEditorConfig]:LastProjectFileName=${descriptorForIni}`,
    `[/Script/ModelContextProtocolEngine.ModelContextProtocolSettings]:ServerUrlPath=${urlPath}`,
    `[/Script/ModelContextProtocolEngine.ModelContextProtocolSettings]:ServerPortNumber=${project.port}`,
    '[/Script/ModelContextProtocolEngine.ModelContextProtocolSettings]:bAutoStartServer=True',
    '[/Script/ModelContextProtocolEngine.ModelContextProtocolSettings]:bEnableToolSearch=True',
  ].join(',')
  return [
    `-ValkyrieProject=${descriptorForIni}`,
    `-ini:EditorPerProjectUserSettings:${iniOverrides}`,
    '-ModelContextProtocolStartServer',
    `-ModelContextProtocolPort=${project.port}`,
  ]
}

const emptyState = () => ({ version: STATE_SCHEMA_VERSION, attempts: {} })

const readState = async (file) => {
  try {
    const payload = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
    return payload?.version === STATE_SCHEMA_VERSION && payload.attempts && typeof payload.attempts === 'object'
      ? payload
      : emptyState()
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyState()
    return emptyState()
  }
}

const writeState = async (file, payload) => {
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp`
  await writeFile(temporary, JSON.stringify(payload, null, 2), 'utf8')
  await rename(temporary, file)
}

const publicState = ({
  project,
  destination,
  attemptedDestination,
  foreignPortDestination,
  attempt,
  attemptProcessAlive,
  descriptorAvailable,
  now,
  timeoutMs,
  projectLoadGraceMs,
}) => {
  const exactIdentity = Boolean(destination && normalizeMount(destination.mount) === normalizeMount(project.projectMount))
  const exactPort = Boolean(destination?.connected && destination.port === project.port)
  const verifiedReady = Boolean(exactIdentity && exactPort && destination?.canInstall)
  const attemptAge = attempt?.startedAt ? now - Date.parse(attempt.startedAt) : Number.POSITIVE_INFINITY
  const recentAttempt = attempt?.status === 'LAUNCHING' && attemptAge >= 0 && attemptAge < timeoutMs
  const knownLaunchProcess = Number.isInteger(attempt?.processId) && attempt.processId > 0
  const wrongProjectFromAttempt = Boolean(
    attemptedDestination
    && normalizeMount(attemptedDestination.mount) !== normalizeMount(project.projectMount),
  )

  let state = 'CLOSED'
  let message = `Prêt à lancer sur le port MCP ${project.port}.`
  if (verifiedReady) {
    state = 'READY'
    message = `Projet et outils MCP vérifiés sur le port ${project.port}.`
  } else if (wrongProjectFromAttempt) {
    state = 'WRONG_PROJECT'
    message = `UEFN a ouvert ${attemptedDestination.name || attemptedDestination.mount}, pas ${project.displayName}.`
  } else if (foreignPortDestination) {
    state = 'PORT_IN_USE'
    message = `Le port MCP ${project.port} est occupé par ${foreignPortDestination.name || foreignPortDestination.mount}.`
  } else if (destination?.opened && destination?.connected && !exactPort) {
    state = 'WRONG_PORT'
    message = `Ouvert sur le port ${destination.port}; le profil exige ${project.port}. Ferme-le manuellement avant de relancer.`
  } else if (destination?.opened && destination?.status === 'PORT_MISMATCH') {
    state = 'PORT_CONFLICT'
    message = `Le port ${project.port} n\u2019a pas pu être obtenu. Ferme le projet manuellement avant de relancer.`
  } else if (destination?.opened && recentAttempt) {
    state = 'CONNECTING'
    message = `UEFN est ouvert; validation du serveur MCP ${project.port} en cours.`
  } else if (destination?.opened && destination?.connected && !destination?.canInstall) {
    state = 'CONNECTED_UNSUPPORTED'
    message = 'Le serveur MCP répond mais les outils de transfert requis manquent.'
  } else if (destination?.opened) {
    state = 'OPEN_MCP_UNAVAILABLE'
    message = `Le projet est ouvert sans serveur MCP validé sur ${project.port}. Ferme-le manuellement avant de relancer.`
  } else if (attempt?.status === 'LAUNCHING' && knownLaunchProcess && !attemptProcessAlive) {
    state = 'LAUNCH_FAILED'
    message = 'Le processus UEFN s\u2019est arrêté avant de charger le projet. Tu peux relancer.'
  } else if (
    attempt?.status === 'LAUNCHING'
    && knownLaunchProcess
    && attemptProcessAlive
    && attemptAge >= projectLoadGraceMs
  ) {
    state = 'PROJECT_BROWSER'
    message = `UEFN est ouvert sur le portail, mais ${project.displayName} n\u2019a pas été chargé.`
  } else if (recentAttempt) {
    state = 'LAUNCHING'
    message = `Ouverture UEFN et démarrage du serveur MCP ${project.port}\u2026`
  } else if (attempt?.status === 'LAUNCHING') {
    state = 'LAUNCH_TIMEOUT'
    message = 'Le lancement n\u2019a pas été confirmé. Tu peux réessayer.'
  } else if (!descriptorAvailable) {
    state = 'DESCRIPTOR_MISSING'
    message = 'Le fichier projet configuré est introuvable.'
  }

  return {
    id: project.id,
    portfolioProjectId: project.portfolioProjectId || '',
    displayName: project.displayName,
    platform: project.platform,
    expectedPort: project.port,
    actualPort: destination?.connected ? destination.port : null,
    state,
    message,
    opened: Boolean(destination?.opened || attemptedDestination?.opened || state === 'PROJECT_BROWSER'),
    connected: Boolean(destination?.connected),
    verified: verifiedReady,
    descriptorAvailable,
    canLaunch: descriptorAvailable && ['CLOSED', 'LAUNCH_TIMEOUT', 'LAUNCH_FAILED'].includes(state),
    attemptStartedAt: attempt?.startedAt || null,
    actualProjectMount: destination?.mount || attemptedDestination?.mount || '',
  }
}

export const createProjectLaunchService = ({
  stateFile,
  sessionService,
  connectionRegistry = loadProjectConnectionRegistry,
  executableDiscovery = (options) => discoverUefnEditorExecutable(options),
  executableOverride = process.env.NOBLESSE_UEFN_EDITOR_EXECUTABLE || '',
  fileExists = pathExists,
  portAvailable = isTcpPortAvailable,
  spawnEditor = spawnUefnEditor,
  processAlive = isProcessAlive,
  getUefnProcessIds = listUefnProcessIds,
  settleDelay = wait,
  settleClock = () => Date.now(),
  prepareEditorSettings = prepareUefnEditorLaunchSettings,
  settingsFile,
  settingsBackupDirectory = '',
  now = () => Date.now(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  projectLoadGraceMs = DEFAULT_PROJECT_LOAD_GRACE_MS,
  processSettleTimeoutMs = DEFAULT_PROCESS_SETTLE_TIMEOUT_MS,
  processSettleIntervalMs = DEFAULT_PROCESS_SETTLE_INTERVAL_MS,
} = {}) => {
  if (!stateFile) throw new Error('Le lanceur de projets exige un registre d\u2019état local.')
  if (!sessionService?.listDestinations) throw new Error('Le lanceur de projets exige le service de sessions UEFN.')

  let statePromise = null
  let mutation = Promise.resolve()
  let launchMutation = Promise.resolve()
  const loadState = () => {
    statePromise ||= readState(stateFile)
    return statePromise
  }
  const saveAttempt = async (id, attempt) => {
    mutation = mutation.then(async () => {
      const current = await loadState()
      const next = { version: STATE_SCHEMA_VERSION, attempts: { ...current.attempts, [id]: attempt } }
      await writeState(stateFile, next)
      statePromise = Promise.resolve(next)
    })
    return mutation
  }
  const loadLaunchProjects = async () => {
    const registry = await (typeof connectionRegistry === 'function' ? connectionRegistry() : connectionRegistry)
    return registry.projects.filter((project) => project.launch?.enabled && project.launch.adapter === 'UEFN_EDITOR')
  }
  const waitForStableUefnProcesses = async () => {
    const deadline = settleClock() + processSettleTimeoutMs
    while (true) {
      const [processIds, destinations] = await Promise.all([
        getUefnProcessIds(),
        sessionService.listDestinations(),
      ])
      const represented = new Set(destinations
        .filter((destination) => destination.opened && Number.isInteger(destination.processId))
        .map((destination) => destination.processId))
      const untracked = processIds.filter((processId) => !represented.has(processId))
      if (!untracked.length) return
      if (settleClock() >= deadline) {
        throw new Error('Une fenêtre UEFN est encore en ouverture ou en fermeture. Attends sa stabilisation avant de relancer un projet.')
      }
      await settleDelay(processSettleIntervalMs)
    }
  }

  const getProfiles = async () => {
    const [projects, destinations, state] = await Promise.all([
      loadLaunchProjects(),
      sessionService.listDestinations(),
      loadState(),
    ])
    const destinationsByConnection = new Map(destinations.map((destination) => [destination.connectionId, destination]))
    const destinationsByMount = new Map(destinations.map((destination) => [normalizeMount(destination.mount), destination]))
    const profiles = await Promise.all(projects.map(async (project) => {
      const attempt = state.attempts[project.id]
      const destination = destinationsByConnection.get(project.id)
        || destinationsByMount.get(normalizeMount(project.projectMount))
      const attemptedDestination = Number.isInteger(attempt?.processId)
        ? destinations.find((candidate) => candidate.processId === attempt.processId) || null
        : null
      const foreignPortDestination = destinations.find((candidate) => (
        candidate.connected
        && candidate.port === project.port
        && normalizeMount(candidate.mount) !== normalizeMount(project.projectMount)
      )) || null
      return publicState({
        project,
        destination,
        attemptedDestination,
        foreignPortDestination,
        attempt,
        attemptProcessAlive: attempt?.status === 'LAUNCHING' && Number.isInteger(attempt?.processId)
          ? await processAlive(attempt.processId)
          : false,
        descriptorAvailable: await fileExists(project.descriptorPath),
        now: now(),
        timeoutMs,
        projectLoadGraceMs,
      })
    }))
    for (const profile of profiles) {
      const attempt = state.attempts[profile.id]
      if (profile.state === 'READY' && attempt?.status === 'LAUNCHING') {
        await saveAttempt(profile.id, {
          ...attempt,
          status: 'READY',
          verifiedAt: new Date(now()).toISOString(),
        })
      } else if (profile.state === 'LAUNCH_FAILED' && attempt?.status === 'LAUNCHING') {
        await saveAttempt(profile.id, {
          ...attempt,
          status: 'STOPPED',
          stoppedAt: new Date(now()).toISOString(),
        })
      }
    }
    return profiles
  }

  const launchInternal = async (request) => {
    const requestedId = String(request?.profileId || '').trim()
    const projects = await loadLaunchProjects()
    const project = projects.find((item) => item.id === requestedId)
    if (!project) throw new Error('Profil de lancement UEFN inconnu ou désactivé.')

    const profile = (await getProfiles()).find((item) => item.id === requestedId)
    if (profile?.state === 'READY') return { status: 'ALREADY_READY', profile }
    if (['LAUNCHING', 'CONNECTING'].includes(profile?.state)) return { status: 'ALREADY_LAUNCHING', profile }
    if (profile?.state === 'PORT_IN_USE') throw new Error(profile.message)
    if (profile?.opened) throw new Error(profile.message)
    if (!profile?.descriptorAvailable) throw new Error('Le fichier projet configuré est introuvable.')
    await waitForStableUefnProcesses()
    if (!await portAvailable(project.port, project.host)) {
      throw new Error(`Le port MCP ${project.port} est déjà occupé. Aucun second éditeur n\u2019a été lancé.`)
    }

    const executable = await executableDiscovery({ override: executableOverride })
    const settingsReceipt = await prepareEditorSettings({
      descriptorPath: project.descriptorPath,
      port: project.port,
      urlPath: project.path || '/mcp',
      settingsFile,
      backupDirectory: settingsBackupDirectory,
    })
    const args = buildUefnLaunchArguments(project)
    const startedAt = new Date(now()).toISOString()
    const result = await spawnEditor(executable, args)
    await saveAttempt(project.id, {
      status: 'LAUNCHING',
      startedAt,
      expectedPort: project.port,
      processId: Number.isInteger(result?.pid) ? result.pid : null,
      launchStrategy: LAUNCH_STRATEGY,
      settingsFingerprint: String(settingsReceipt?.fingerprint || ''),
    })
    const refreshed = (await getProfiles()).find((item) => item.id === requestedId)
    return { status: 'LAUNCHED', profile: refreshed }
  }

  const launch = (request) => {
    const queued = launchMutation.then(
      () => launchInternal(request),
      () => launchInternal(request),
    )
    launchMutation = queued.catch(() => {})
    return queued
  }

  return { getProfiles, launch }
}

export const projectLaunchServiceInternals = {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_PROJECT_LOAD_GRACE_MS,
  DEFAULT_PROCESS_SETTLE_TIMEOUT_MS,
  DEFAULT_PROCESS_SETTLE_INTERVAL_MS,
  LAUNCH_STRATEGY,
  buildUefnLaunchArguments,
  isTcpPortAvailable,
  isProcessAlive,
  publicState,
  spawnUefnEditor,
}
