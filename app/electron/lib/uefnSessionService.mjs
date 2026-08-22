import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { findProjectConnection, loadProjectConnectionRegistry } from './projectConnectionRegistry.mjs'
import { UefnMcpClient } from './uefnMcpClient.mjs'
import { discoverOpenUefnProjects } from './uefnOpenProjectDiscovery.mjs'
import { createUefnPortOwnershipVerifier } from './uefnProcessInspector.mjs'
import { MATERIAL_RECIPE_REQUIREMENTS, SOUND_HANDOFF_REQUIREMENTS, STATIC_MESH_REQUIREMENTS, summarizeTransferCapabilities } from './uefnTransferContract.mjs'
import { listUefnProjects } from './vaultService.mjs'

const FAVORITES_SCHEMA_VERSION = 1
const DEFAULT_PORT_START = 8000
const DEFAULT_PORT_END = 8031
const DEFAULT_MCP_PATH = '/mcp'

const normalizeMount = (value = '') => String(value).trim().replace(/^\/+|\/+$/g, '')
const projectKey = (mount = '') => normalizeMount(mount).toLocaleLowerCase('en-US')
const projectId = (mount = '') => `uefn:${projectKey(mount)}`
const RESERVED_MOUNTS = new Set(['game', 'engine', 'script', 'temp', 'memory'])
const isUefnProjectMount = (mount = '') => {
  const key = projectKey(mount)
  return Boolean(key && !RESERVED_MOUNTS.has(key))
}

const portsFromEnvironment = () => {
  const configured = String(process.env.NOBLESSE_UEFN_MCP_PORTS || '')
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0 && value <= 65_535)
  if (configured.length) return [...new Set(configured)].toSorted((left, right) => left - right)
  return Array.from({ length: DEFAULT_PORT_END - DEFAULT_PORT_START + 1 }, (_, index) => DEFAULT_PORT_START + index)
}

const emptyFavorites = () => ({ version: FAVORITES_SCHEMA_VERSION, favorites: [] })

const normalizeFavorite = (favorite) => {
  const mount = normalizeMount(favorite?.mount || favorite?.name)
  if (!isUefnProjectMount(mount)) return null
  return {
    id: projectId(mount),
    mount,
    name: String(favorite?.name || mount),
    path: typeof favorite?.path === 'string' ? favorite.path : '',
    preferredPort: Number.isInteger(favorite?.preferredPort) ? favorite.preferredPort : null,
    addedAt: typeof favorite?.addedAt === 'string' ? favorite.addedAt : new Date().toISOString(),
  }
}

const readFavoritesFile = async (file) => {
  try {
    const payload = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
    const rawFavorites = Array.isArray(payload?.favorites) ? payload.favorites : []
    const favorites = rawFavorites.map(normalizeFavorite).filter(Boolean)
    return { version: FAVORITES_SCHEMA_VERSION, favorites, pruned: favorites.length !== rawFavorites.length }
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyFavorites()
    throw error
  }
}

const writeFavoritesFile = async (file, payload) => {
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp`
  await writeFile(temporary, JSON.stringify(payload, null, 2), 'utf8')
  await rename(temporary, file)
}

const createDefaultProbe = ({ timeoutMs = 700, verifyPortOwner = createUefnPortOwnershipVerifier() } = {}) => {
  const clients = new Map()
  return async (port) => {
    const endpoint = `http://127.0.0.1:${port}${DEFAULT_MCP_PATH}`
    const owner = await verifyPortOwner(port)
    if (!owner?.verified) return null
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json, text/event-stream' },
        signal: AbortSignal.timeout(Math.min(timeoutMs, 450)),
      })
      if (!response) return null
    } catch {
      clients.delete(port)
      return null
    }

    const startedAt = Date.now()
    const client = clients.get(port) || new UefnMcpClient(endpoint, { timeoutMs })
    clients.set(port, client)
    try {
      await client.initialize()
      const contentBrowserPath = await client.call('EditorToolset.EditorAppToolset', 'GetContentBrowserPath', {})
      const mount = normalizeMount(String(contentBrowserPath || '').split('/').filter(Boolean)[0])
      if (!isUefnProjectMount(mount)) throw new Error('Le serveur MCP ne correspond pas à un projet UEFN')
      const toolsets = await client.listToolsets()
      const capabilities = summarizeTransferCapabilities(toolsets)
      if (capabilities.materialRecipe) {
        const missingTools = await client.missingTools(MATERIAL_RECIPE_REQUIREMENTS)
        capabilities.materialRecipe = missingTools.length === 0
      }
      if (capabilities.soundHandoff) {
        const missingTools = await client.missingTools(SOUND_HANDOFF_REQUIREMENTS)
        capabilities.soundHandoff = missingTools.length === 0
      }
      if (capabilities.staticMesh) {
        const missingTools = await client.missingTools(STATIC_MESH_REQUIREMENTS)
        capabilities.staticMesh = missingTools.length === 0
      }
      return {
        id: projectId(mount),
        mount,
        name: mount,
        port,
        endpoint,
        contentBrowserPath,
        latencyMs: Date.now() - startedAt,
        processId: owner.pid,
        capabilities,
      }
    } catch {
      clients.delete(port)
      return null
    }
  }
}

const mergeKnownProject = (session, knownByKey) => {
  const known = knownByKey.get(projectKey(session.mount))
  return {
    ...session,
    name: known?.name || session.name,
    path: known?.path || '',
    folder: known?.folder || '',
    updatedAt: known?.updatedAt || null,
  }
}

const compareDestinations = (left, right) => {
  if (left.connected !== right.connected) return left.connected ? -1 : 1
  if (left.favorite !== right.favorite) return left.favorite ? -1 : 1
  return left.name.localeCompare(right.name, 'fr')
}

export const createUefnSessionService = ({
  favoritesFile,
  ports = portsFromEnvironment(),
  probePort = createDefaultProbe(),
  projectIndex = listUefnProjects,
  openProjectDiscovery = discoverOpenUefnProjects,
  connectionRegistry = loadProjectConnectionRegistry,
} = {}) => {
  if (!favoritesFile) throw new Error('Le registre de favoris UEFN a besoin d\u2019un chemin local')

  let favoritesPromise = null
  let connectionRegistryPromise = null
  let scanPromise = null
  const loadConnections = () => {
    connectionRegistryPromise ||= Promise.resolve(
      typeof connectionRegistry === 'function' ? connectionRegistry() : connectionRegistry,
    )
    return connectionRegistryPromise
  }
  const loadFavorites = () => {
    favoritesPromise ||= readFavoritesFile(favoritesFile).then(async ({ pruned, ...payload }) => {
      if (pruned) await writeFavoritesFile(favoritesFile, payload)
      return payload
    })
    return favoritesPromise
  }
  const saveFavorites = async (payload) => {
    await writeFavoritesFile(favoritesFile, payload)
    favoritesPromise = Promise.resolve(payload)
  }

  const scanActiveSessions = async () => {
    if (scanPromise) return scanPromise
    scanPromise = (async () => {
      const [favorites, registry] = await Promise.all([loadFavorites(), loadConnections()])
      const favoritePorts = favorites.favorites
        .map((item) => item.preferredPort)
        .filter((port) => Number.isInteger(port))
      const assignedPorts = registry.projects
        .filter((project) => project.platform === 'UEFN' && project.transport === 'STREAMABLE_HTTP')
        .map((project) => project.port)
      const portsToProbe = [...new Set([...ports, ...favoritePorts, ...assignedPorts])]
      const probes = await Promise.all(portsToProbe.map((port) => probePort(port)))
      const byProject = new Map()
      for (const session of probes.filter(Boolean).toSorted((left, right) => left.port - right.port)) {
        if (!isUefnProjectMount(session.mount)) continue
        const key = projectKey(session.mount)
        if (!byProject.has(key)) byProject.set(key, session)
      }
      return [...byProject.values()]
    })().finally(() => { scanPromise = null })
    return scanPromise
  }

  const listDestinations = async () => {
    const [favoritesPayload, registry, knownProjects, activeSessions, openProjects] = await Promise.all([
      loadFavorites(),
      loadConnections(),
      projectIndex(),
      scanActiveSessions(),
      openProjectDiscovery(),
    ])
    const knownByKey = new Map()
    for (const project of knownProjects) {
      const key = projectKey(project.name)
      if (!knownByKey.has(key)) knownByKey.set(key, project)
    }
    const favoritesByKey = new Map(favoritesPayload.favorites.map((item) => [projectKey(item.mount), item]))
    const activeKeys = new Set()
    const destinations = activeSessions.map((rawSession) => {
      const session = mergeKnownProject(rawSession, knownByKey)
      const key = projectKey(session.mount)
      activeKeys.add(key)
      const favorite = favoritesByKey.get(key)
      const assignment = findProjectConnection(registry, { mount: session.mount, platform: 'UEFN' })
      const assignedPort = assignment?.port || null
      const portMatchesAssignment = !assignedPort || assignedPort === session.port
      // The MCP mount proves project identity, while the versioned profile port
      // proves routing identity. Both must match before an asset can be transferred.
      const toolsetReady = session.capabilities?.materialRecipe === true
        || session.capabilities?.soundHandoff === true
        || session.capabilities?.staticMesh === true
      const portMismatch = !portMatchesAssignment
        ? { code: 'PORT_MISMATCH', expectedPort: assignedPort, actualPort: session.port }
        : null
      const canInstall = toolsetReady && !portMismatch
      return {
        ...session,
        id: assignment?.id || projectId(session.mount),
        name: assignment?.displayName || session.name,
        path: session.path || favorite?.path || '',
        platform: 'UEFN',
        opened: true,
        connected: true,
        canInstall,
        transferReady: canInstall,
        favorite: Boolean(favorite),
        registered: Boolean(assignment),
        assignedPort,
        preferredPort: assignedPort,
        connectionId: assignment?.id || null,
        portMatchesAssignment,
        status: portMismatch ? 'PORT_MISMATCH' : canInstall ? 'READY' : 'MCP_CONNECTED_UNSUPPORTED',
        protection: portMismatch
          ? 'PROJECT_PORT_MISMATCH'
          : canInstall ? 'INSTALL_ALLOWED' : 'MISSING_TRANSFER_CAPABILITY',
        mcpIssue: portMismatch,
        mcpWarning: null,
      }
    })
    const openKeys = new Set(activeKeys)
    for (const rawProject of openProjects) {
      const key = projectKey(rawProject.mount || rawProject.name)
      if (!key || openKeys.has(key)) continue
      openKeys.add(key)
      const known = knownByKey.get(key)
      const favorite = favoritesByKey.get(key)
      const mount = normalizeMount(rawProject.mount || rawProject.name)
      const assignment = findProjectConnection(registry, { mount, platform: 'UEFN' })
      const assignedPort = assignment?.port || favorite?.preferredPort || null
      const rawIssue = rawProject.mcpIssue || null
      const mcpIssue = rawIssue?.code === 'PORT_CONFLICT' && assignedPort && rawIssue.port !== assignedPort
        ? { code: 'PORT_MISMATCH', expectedPort: assignedPort, actualPort: rawIssue.port, cause: 'PORT_CONFLICT' }
        : rawIssue
      destinations.push({
        ...rawProject,
        id: assignment?.id || projectId(mount),
        mount,
        name: assignment?.displayName || known?.name || rawProject.name || mount,
        path: rawProject.path || known?.path || favorite?.path || '',
        folder: rawProject.folder || known?.folder || '',
        platform: 'UEFN',
        opened: true,
        connected: false,
        canInstall: false,
        transferReady: false,
        favorite: Boolean(favorite),
        registered: Boolean(assignment),
        port: assignedPort,
        assignedPort,
        connectionId: assignment?.id || null,
        endpoint: '',
        latencyMs: null,
        status: mcpIssue?.code === 'PORT_MISMATCH' ? 'PORT_MISMATCH' : 'MCP_UNAVAILABLE',
        protection: mcpIssue?.code === 'PORT_MISMATCH' ? 'PROJECT_PORT_MISMATCH' : 'MCP_UNAVAILABLE',
        mcpIssue,
      })
    }
    for (const favorite of favoritesPayload.favorites) {
      const key = projectKey(favorite.mount)
      if (openKeys.has(key)) continue
      const known = knownByKey.get(key)
      const assignment = findProjectConnection(registry, { mount: favorite.mount, platform: 'UEFN' })
      const assignedPort = assignment?.port || favorite.preferredPort || null
      destinations.push({
        id: assignment?.id || projectId(favorite.mount),
        mount: favorite.mount,
        name: assignment?.displayName || known?.name || favorite.name,
        path: known?.path || favorite.path || '',
        folder: known?.folder || '',
        platform: 'UEFN',
        opened: false,
        connected: false,
        canInstall: false,
        transferReady: false,
        favorite: true,
        registered: Boolean(assignment),
        port: assignedPort,
        assignedPort,
        connectionId: assignment?.id || null,
        endpoint: '',
        latencyMs: null,
        status: 'OFFLINE',
        protection: 'PROJECT_CLOSED',
      })
    }
    return destinations.toSorted(compareDestinations)
  }

  const setFavorite = async ({ projectId: requestedId, favorite }) => {
    const destinations = await listDestinations()
    const selected = destinations.find((item) => item.id === requestedId)
    if (!selected) throw new Error('Projet UEFN introuvable')
    const payload = await loadFavorites()
    const key = projectKey(selected.mount)
    const remaining = payload.favorites.filter((item) => projectKey(item.mount) !== key)
    if (favorite) {
      if (!selected.opened && !selected.connected) throw new Error('Ouvre le projet une premi\u00e8re fois avant de l\u2019ajouter aux favoris')
      const registry = await loadConnections()
      const assignment = findProjectConnection(registry, { mount: selected.mount, platform: 'UEFN' })
      remaining.push({
        id: projectId(selected.mount),
        mount: selected.mount,
        name: selected.name,
        path: selected.path || '',
        preferredPort: assignment?.port || selected.port,
        addedAt: new Date().toISOString(),
      })
    }
    await saveFavorites({ version: FAVORITES_SCHEMA_VERSION, favorites: remaining })
    return listDestinations()
  }

  const resolveActiveSession = async (requestedId, { capability = 'materialRecipe' } = {}) => {
    const destinations = await listDestinations()
    const selected = destinations.find((item) => item.id === requestedId)
    if (!selected) throw new Error('Choisis un projet UEFN ouvert')
    if (!selected.connected || !selected.canInstall || !selected.endpoint || selected.capabilities?.[capability] !== true) {
      throw new Error(`${selected.name} est ferm\u00e9 ou son serveur MCP ne r\u00e9pond pas`)
    }
    return selected
  }

  const getHealth = async () => {
    const destinations = await listDestinations()
    const active = destinations.filter((item) => item.connected)
    return {
      connected: active.length > 0,
      sessionCount: active.length,
      sessions: active.map(({ id, name, mount, port, latencyMs }) => ({ id, name, mount, port, latencyMs })),
    }
  }

  return { getHealth, listDestinations, resolveActiveSession, setFavorite }
}

export const uefnSessionInternals = { isUefnProjectMount, normalizeMount, projectId, projectKey }
