import { spawn } from 'node:child_process'
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { loadProjectConnectionRegistry } from './projectConnectionRegistry.mjs'
import { discoverUefnEditorExecutable } from './uefnExecutableDiscovery.mjs'

const STATE_SCHEMA_VERSION = 1
const DEFAULT_TIMEOUT_MS = 180_000

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

const publicState = ({ project, destination, attempt, descriptorAvailable, now, timeoutMs }) => {
  const exactIdentity = Boolean(destination && normalizeMount(destination.mount) === normalizeMount(project.projectMount))
  const exactPort = Boolean(destination?.connected && destination.port === project.port)
  const verifiedReady = Boolean(exactIdentity && exactPort && destination?.canInstall)
  const attemptAge = attempt?.startedAt ? now - Date.parse(attempt.startedAt) : Number.POSITIVE_INFINITY
  const recentAttempt = attempt?.status === 'LAUNCHING' && attemptAge >= 0 && attemptAge < timeoutMs

  let state = 'CLOSED'
  let message = `Prêt à lancer sur le port MCP ${project.port}.`
  if (verifiedReady) {
    state = 'READY'
    message = `Projet et outils MCP vérifiés sur le port ${project.port}.`
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
    opened: Boolean(destination?.opened),
    connected: Boolean(destination?.connected),
    verified: verifiedReady,
    descriptorAvailable,
    canLaunch: descriptorAvailable && (state === 'CLOSED' || state === 'LAUNCH_TIMEOUT'),
    attemptStartedAt: attempt?.startedAt || null,
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
  now = () => Date.now(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) => {
  if (!stateFile) throw new Error('Le lanceur de projets exige un registre d\u2019état local.')
  if (!sessionService?.listDestinations) throw new Error('Le lanceur de projets exige le service de sessions UEFN.')

  let statePromise = null
  let mutation = Promise.resolve()
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

  const getProfiles = async () => {
    const [projects, destinations, state] = await Promise.all([
      loadLaunchProjects(),
      sessionService.listDestinations(),
      loadState(),
    ])
    const destinationsByConnection = new Map(destinations.map((destination) => [destination.connectionId, destination]))
    const destinationsByMount = new Map(destinations.map((destination) => [normalizeMount(destination.mount), destination]))
    const profiles = await Promise.all(projects.map(async (project) => {
      const destination = destinationsByConnection.get(project.id)
        || destinationsByMount.get(normalizeMount(project.projectMount))
      return publicState({
        project,
        destination,
        attempt: state.attempts[project.id],
        descriptorAvailable: await fileExists(project.descriptorPath),
        now: now(),
        timeoutMs,
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
      }
    }
    return profiles
  }

  const launch = async (request) => {
    const requestedId = String(request?.profileId || '').trim()
    const projects = await loadLaunchProjects()
    const project = projects.find((item) => item.id === requestedId)
    if (!project) throw new Error('Profil de lancement UEFN inconnu ou désactivé.')

    const profile = (await getProfiles()).find((item) => item.id === requestedId)
    if (profile?.state === 'READY') return { status: 'ALREADY_READY', profile }
    if (['LAUNCHING', 'CONNECTING'].includes(profile?.state)) return { status: 'ALREADY_LAUNCHING', profile }
    if (profile?.opened) throw new Error(profile.message)
    if (!profile?.descriptorAvailable) throw new Error('Le fichier projet configuré est introuvable.')
    if (!await portAvailable(project.port, project.host)) {
      throw new Error(`Le port MCP ${project.port} est déjà occupé. Aucun second éditeur n\u2019a été lancé.`)
    }

    const executable = await executableDiscovery({ override: executableOverride })
    const args = [
      project.descriptorPath,
      '-ModelContextProtocolStartServer',
      `-ModelContextProtocolPort=${project.port}`,
    ]
    const startedAt = new Date(now()).toISOString()
    const result = await spawnEditor(executable, args)
    await saveAttempt(project.id, {
      status: 'LAUNCHING',
      startedAt,
      expectedPort: project.port,
      processId: Number.isInteger(result?.pid) ? result.pid : null,
    })
    const refreshed = (await getProfiles()).find((item) => item.id === requestedId)
    return { status: 'LAUNCHED', profile: refreshed }
  }

  return { getProfiles, launch }
}

export const projectLaunchServiceInternals = {
  DEFAULT_TIMEOUT_MS,
  isTcpPortAvailable,
  publicState,
  spawnUefnEditor,
}
