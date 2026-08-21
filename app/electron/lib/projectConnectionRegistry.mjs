import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PROJECT_CONNECTION_SCHEMA_VERSION = 1
export const DEFAULT_PROJECT_CONNECTIONS_FILE = fileURLToPath(
  new URL('../data/project-connections.v1.json', import.meta.url),
)

const normalizeMount = (value = '') => String(value).trim().replace(/^\/+|\/+$/g, '')
const mountKey = (value = '') => normalizeMount(value).toLocaleLowerCase('en-US')
const descriptorKey = (value = '') => {
  const descriptor = String(value || '').trim()
  if (!descriptor || !path.win32.isAbsolute(descriptor)) return ''
  return path.win32.normalize(descriptor).toLocaleLowerCase('en-US')
}
const LAUNCH_ADAPTERS = new Set(['UEFN_EDITOR'])

const validateProject = (rawProject, index) => {
  const project = rawProject && typeof rawProject === 'object' ? rawProject : {}
  const id = String(project.id || '').trim()
  const platform = String(project.platform || '').trim()
  const transport = String(project.transport || '').trim()
  if (!id) throw new Error(`Connexion projet ${index}: identifiant manquant`)
  if (!['UEFN', 'Unreal', 'Roblox'].includes(platform)) {
    throw new Error(`Connexion ${id}: plateforme non prise en charge`)
  }
  if (!['STREAMABLE_HTTP', 'STDIO', 'LOCAL'].includes(transport)) {
    throw new Error(`Connexion ${id}: transport non pris en charge`)
  }
  if (transport === 'STREAMABLE_HTTP') {
    if (project.host !== '127.0.0.1') throw new Error(`Connexion ${id}: seul l'hôte local est autorisé`)
    if (!Number.isInteger(project.port) || project.port < 1 || project.port > 65_535) {
      throw new Error(`Connexion ${id}: port invalide`)
    }
    if (project.path !== '/mcp') throw new Error(`Connexion ${id}: chemin MCP invalide`)
  } else if (project.port !== null) {
    throw new Error(`Connexion ${id}: un transport sans serveur ne doit pas avoir de port`)
  }
  if (transport === 'LOCAL' && platform !== 'Unreal') {
    throw new Error(`Connexion ${id}: le transport local est réservé aux projets Unreal`)
  }
  const launch = project.launch && typeof project.launch === 'object'
    ? {
        enabled: project.launch.enabled === true,
        adapter: String(project.launch.adapter || '').trim(),
      }
    : null
  if (launch?.enabled) {
    if (!LAUNCH_ADAPTERS.has(launch.adapter)) throw new Error(`Connexion ${id}: adaptateur de lancement invalide`)
    if (platform !== 'UEFN' || launch.adapter !== 'UEFN_EDITOR') {
      throw new Error(`Connexion ${id}: le lanceur UEFN exige une connexion UEFN`)
    }
    if (!path.win32.isAbsolute(String(project.descriptorPath || '')) || !/\.uefnproject$/i.test(project.descriptorPath)) {
      throw new Error(`Connexion ${id}: descripteur UEFN absolu requis pour le lancement`)
    }
  }
  if (platform === 'Unreal'
    && (!descriptorKey(project.descriptorPath) || !/\.uproject$/i.test(String(project.descriptorPath || '')))) {
    throw new Error(`Connexion ${id}: descripteur Unreal absolu requis`)
  }
  return {
    ...project,
    id,
    platform,
    transport,
    portfolioProjectId: String(project.portfolioProjectId || '').trim(),
    projectMount: normalizeMount(project.projectMount),
    launch,
  }
}

export const validateProjectConnectionRegistry = (payload) => {
  if (payload?.version !== PROJECT_CONNECTION_SCHEMA_VERSION) {
    throw new Error(`Version de registre de connexions non prise en charge: ${payload?.version ?? 'absente'}`)
  }
  const projects = (Array.isArray(payload.projects) ? payload.projects : []).map(validateProject)
  const ids = new Set()
  const ports = new Map()
  const portfolioIds = new Set()
  for (const project of projects) {
    if (ids.has(project.id)) throw new Error(`Identifiant de connexion dupliqué: ${project.id}`)
    ids.add(project.id)
    if (project.portfolioProjectId) {
      if (portfolioIds.has(project.portfolioProjectId)) {
        throw new Error(`Projet portefeuille dupliqué: ${project.portfolioProjectId}`)
      }
      portfolioIds.add(project.portfolioProjectId)
    }
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

export const findProjectConnectionByDescriptor = (registry, { descriptorPath, platform }) => {
  const key = descriptorKey(descriptorPath)
  return registry.projects.find((project) => (
    project.platform === platform && key && descriptorKey(project.descriptorPath) === key
  )) || null
}

export const projectConnectionInternals = { descriptorKey, mountKey, normalizeMount }
