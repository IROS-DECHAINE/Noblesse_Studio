import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const PROJECT_CONNECTION_SCHEMA_VERSION = 1
export const DEFAULT_PROJECT_CONNECTIONS_FILE = fileURLToPath(
  new URL('../data/project-connections.v1.json', import.meta.url),
)

const normalizeMount = (value = '') => String(value).trim().replace(/^\/+|\/+$/g, '')
const mountKey = (value = '') => normalizeMount(value).toLocaleLowerCase('en-US')

const validateProject = (rawProject, index) => {
  const project = rawProject && typeof rawProject === 'object' ? rawProject : {}
  const id = String(project.id || '').trim()
  const platform = String(project.platform || '').trim()
  const transport = String(project.transport || '').trim()
  if (!id) throw new Error(`Connexion projet ${index}: identifiant manquant`)
  if (!['UEFN', 'Unreal', 'Roblox'].includes(platform)) {
    throw new Error(`Connexion ${id}: plateforme non prise en charge`)
  }
  if (!['STREAMABLE_HTTP', 'STDIO'].includes(transport)) {
    throw new Error(`Connexion ${id}: transport non pris en charge`)
  }
  if (transport === 'STREAMABLE_HTTP') {
    if (project.host !== '127.0.0.1') throw new Error(`Connexion ${id}: seul l'hôte local est autorisé`)
    if (!Number.isInteger(project.port) || project.port < 1 || project.port > 65_535) {
      throw new Error(`Connexion ${id}: port invalide`)
    }
    if (project.path !== '/mcp') throw new Error(`Connexion ${id}: chemin MCP invalide`)
  } else if (project.port !== null) {
    throw new Error(`Connexion ${id}: un transport stdio ne doit pas avoir de port`)
  }
  return {
    ...project,
    id,
    platform,
    transport,
    projectMount: normalizeMount(project.projectMount),
  }
}

export const validateProjectConnectionRegistry = (payload) => {
  if (payload?.version !== PROJECT_CONNECTION_SCHEMA_VERSION) {
    throw new Error(`Version de registre de connexions non prise en charge: ${payload?.version ?? 'absente'}`)
  }
  const projects = (Array.isArray(payload.projects) ? payload.projects : []).map(validateProject)
  const ids = new Set()
  const ports = new Map()
  for (const project of projects) {
    if (ids.has(project.id)) throw new Error(`Identifiant de connexion dupliqué: ${project.id}`)
    ids.add(project.id)
    if (project.transport !== 'STREAMABLE_HTTP') continue
    if (ports.has(project.port)) {
      throw new Error(`Port MCP ${project.port} affecté à ${ports.get(project.port)} et ${project.id}`)
    }
    ports.set(project.port, project.id)
  }
  return {
    version: PROJECT_CONNECTION_SCHEMA_VERSION,
    projects,
    reservations: Array.isArray(payload.reservations) ? payload.reservations : [],
  }
}

export const loadProjectConnectionRegistry = async (file = DEFAULT_PROJECT_CONNECTIONS_FILE) => {
  const payload = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
  return validateProjectConnectionRegistry(payload)
}

export const findProjectConnection = (registry, { mount, platform }) => {
  const key = mountKey(mount)
  return registry.projects.find((project) => (
    project.platform === platform && key && mountKey(project.projectMount) === key
  )) || null
}

export const projectConnectionInternals = { mountKey, normalizeMount }
