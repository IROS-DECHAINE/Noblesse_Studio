import { calendarWebRepository } from './calendarWebRepository.js'
import { documentPreviewFallback } from '../data/documentProjects.js'

const baseUrl = import.meta.env?.BASE_URL || '/'
let projectLauncherPreviewStartedAt = 0

const projectLauncherPreviewEnabled = () => Boolean(
  import.meta.env?.DEV
  && globalThis.location
  && new URLSearchParams(globalThis.location.search).get('projectLauncherPreview') === '1',
)

const projectLauncherPreviewProfiles = () => {
  const elapsed = projectLauncherPreviewStartedAt ? Date.now() - projectLauncherPreviewStartedAt : 0
  const forcedState = globalThis.location
    ? new URLSearchParams(globalThis.location.search).get('projectLauncherState')
    : ''
  const primebotState = forcedState || (!projectLauncherPreviewStartedAt ? 'CLOSED' : elapsed < 1_200 ? 'LAUNCHING' : 'READY')
  const primebotMessage = {
    READY: 'Projet et outils MCP vérifiés sur le port 8000.',
    LAUNCHING: 'Ouverture UEFN et démarrage du serveur MCP 8000…',
    PROJECT_BROWSER: 'UEFN est ouvert sur le portail, mais PrimeBot Rush n\u2019a pas été chargé.',
    WRONG_PROJECT: 'UEFN a ouvert Prime Industry, pas PrimeBot Rush.',
    LAUNCH_FAILED: 'Le processus UEFN s\u2019est arrêté avant de charger le projet. Tu peux relancer.',
    PORT_IN_USE: 'Le port MCP 8000 est occupé par Prime Industry.',
  }[primebotState] || 'Prêt à lancer sur le port MCP 8000.'
  return [
    {
      id: 'uefn:steal_the_rift_bots',
      portfolioProjectId: 'primebot-rush',
      displayName: 'PrimeBot Rush',
      expectedPort: 8000,
      actualPort: primebotState === 'READY' ? 8000 : null,
      state: primebotState,
      message: primebotMessage,
      opened: ['READY', 'PROJECT_BROWSER', 'WRONG_PROJECT'].includes(primebotState),
      connected: primebotState === 'READY',
      verified: primebotState === 'READY',
      descriptorAvailable: true,
      canLaunch: ['CLOSED', 'LAUNCH_FAILED'].includes(primebotState),
    },
    {
      id: 'uefn:wtf_idle_tycoon',
      portfolioProjectId: 'prime-industry',
      displayName: 'Prime Industry',
      expectedPort: 8001,
      actualPort: 8002,
      state: 'WRONG_PORT',
      message: 'Ouvert sur le port 8002; le profil exige 8001. Ferme-le manuellement avant de relancer.',
      opened: true,
      connected: true,
      verified: false,
      descriptorAvailable: true,
      canLaunch: false,
    },
  ]
}

const fetchJson = async (path, init) => {
  const response = await fetch(`${baseUrl}${path.replace(/^\/+/, '')}`, init)
  if (!response.ok) throw new Error(`Requête impossible (${response.status})`)
  return response.json()
}

export const publicAsset = (path) => `${baseUrl}${path.replace(/^\/+/, '')}`

const safeVaultPreviewSource = (source) => {
  const normalized = String(source || '').trim().replaceAll('\\', '/')
  if (!normalized || normalized.includes('\0') || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(normalized)) return ''
  const segments = normalized.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return ''
  if (!/\.(?:png|jpe?g|webp)$/i.test(normalized)) return ''
  return normalized
}

export const vaultPreviewSourceUrl = (source) => {
  const safeSource = safeVaultPreviewSource(source)
  if (!safeSource) return ''
  if (globalThis.window?.noblesseDesktop) {
    return `noblesse-vault://preview/${encodeURIComponent(safeSource)}`
  }
  return `${baseUrl}api/vault-preview?source=${encodeURIComponent(safeSource)}`
}

export const resolveMaterialPreviewSources = (descriptor) => {
  if (!descriptor || typeof descriptor !== 'object') return descriptor
  const resolved = {
    ...descriptor,
    previewUrl: vaultPreviewSourceUrl(descriptor.previewSource),
  }
  if (descriptor.maps && typeof descriptor.maps === 'object') {
    resolved.maps = Object.fromEntries(Object.entries(descriptor.maps).map(([key, map]) => [
      key,
      map?.source ? { ...map, url: vaultPreviewSourceUrl(map.source) } : map,
    ]))
  }
  if (descriptor.graph && typeof descriptor.graph === 'object') {
    resolved.graph = {
      ...descriptor.graph,
      textures: (descriptor.graph.textures || []).map((texture) => ({
        ...texture,
        url: vaultPreviewSourceUrl(texture.source),
      })),
    }
  }
  return resolved
}

export const vaultPreview = (asset) => {
  if (!asset?.preview_url && !asset?.preview_source && !asset?.preview_asset) return ''
  const desktopAvailable = Boolean(globalThis.window?.noblesseDesktop)
  if (desktopAvailable && asset.preview_url) return asset.preview_url
  if (desktopAvailable && asset.preview_source) {
    return `noblesse-vault://preview/${encodeURIComponent(asset.preview_source)}`
  }
  if (asset.preview_source) return vaultPreviewSourceUrl(asset.preview_source)
  return asset.preview_asset ? publicAsset(asset.preview_asset) : ''
}

export const vaultAudio = (asset) => {
  if (!asset?.audio_url) return ''
  return globalThis.window?.noblesseDesktop ? asset.audio_url : ''
}

export const unwrapPublicItemsV1 = (payload, label) => {
  if (!payload
    || payload.schemaVersion !== 1
    || !Array.isArray(payload.items)) {
    throw new Error(`Contrat public ${label} non pris en charge.`)
  }
  return payload.items
}

export const studioApi = {
  assets: async () => {
    if (window.noblesseDesktop?.getAssets) {
      return unwrapPublicItemsV1(await window.noblesseDesktop.getAssets(), 'assets v1')
    }
    return fetchJson('data/vault-assets.json').then((payload) => payload.assets || [])
  },
  materialPreview: async (assetId) => {
    const descriptor = globalThis.window?.noblesseDesktop?.getMaterialPreview
      ? await globalThis.window.noblesseDesktop.getMaterialPreview(assetId)
      : await fetchJson(`api/material-preview?assetId=${encodeURIComponent(assetId)}`)
    return resolveMaterialPreviewSources(descriptor)
  },
  projects: async () => window.noblesseDesktop?.listProjects
    ? unwrapPublicItemsV1(await window.noblesseDesktop.listProjects(), 'projets v1')
    : [],
  setProjectFavorite: async (request) => window.noblesseDesktop?.setProjectFavorite
    ? unwrapPublicItemsV1(await window.noblesseDesktop.setProjectFavorite(request), 'projets v1')
    : [],
  projectLaunchProfiles: () => window.noblesseDesktop?.listProjectLaunchProfiles?.()
    ?? Promise.resolve(projectLauncherPreviewEnabled() ? projectLauncherPreviewProfiles() : []),
  launchProject: (profileId) => {
    if (window.noblesseDesktop?.launchProject) return window.noblesseDesktop.launchProject(profileId)
    if (projectLauncherPreviewEnabled() && profileId === 'uefn:steal_the_rift_bots') {
      projectLauncherPreviewStartedAt = Date.now()
      return Promise.resolve({
        status: 'LAUNCHED',
        profile: projectLauncherPreviewProfiles()[0],
      })
    }
    return Promise.reject(new Error('Le lancement est disponible uniquement dans l\u2019application Noblesse Studio.'))
  },
  vaultHealth: () => window.noblesseDesktop?.getVaultHealth?.() ?? Promise.resolve(null),
  chooseSoundFiles: () => {
    if (!window.noblesseDesktop?.chooseSoundFiles) throw new Error('La sélection audio est disponible uniquement dans l’application desktop.')
    return window.noblesseDesktop.chooseSoundFiles()
  },
  importSounds: (request) => {
    if (!window.noblesseDesktop?.importSounds) throw new Error('L’import audio est disponible uniquement dans l’application desktop.')
    return window.noblesseDesktop.importSounds(request)
  },
  planVaultTrash: (assetIds) => window.noblesseDesktop?.planVaultTrash?.(assetIds)
    ?? Promise.reject(new Error('La corbeille est disponible uniquement dans l’application desktop.')),
  applyVaultTrash: (request) => window.noblesseDesktop?.applyVaultTrash?.(request)
    ?? Promise.reject(new Error('La corbeille est disponible uniquement dans l’application desktop.')),
  vaultTrash: () => window.noblesseDesktop?.listVaultTrash?.() ?? Promise.resolve({ schemaVersion: 1, items: [] }),
  restoreVaultTrash: (trashId) => window.noblesseDesktop?.restoreVaultTrash?.(trashId)
    ?? Promise.reject(new Error('La restauration est disponible uniquement dans l’application desktop.')),
  fortnitePrimebot: (options = {}) => window.noblesseDesktop?.getFortnitePrimebot?.(options)
    ?? fetchJson(`api/fortnite-primebot${options.force ? '?force=1' : ''}`),
  uefnHealth: () => window.noblesseDesktop?.getUefnHealth?.() ?? fetchJson('api/uefn-health'),
  installAsset: (request) => {
    if (!window.noblesseDesktop?.installAsset) {
      throw new Error('Installation disponible uniquement dans l’application Noblesse Studio')
    }
    return window.noblesseDesktop.installAsset(request)
  },
  documents: () => window.noblesseDesktop?.listDocuments?.() ?? Promise.resolve(documentPreviewFallback),
  documentTrash: async () => {
    const documents = await (window.noblesseDesktop?.listDeletedDocuments?.() ?? Promise.resolve([]))
    return (Array.isArray(documents) ? documents : []).filter((document) => Boolean(document?.deletedAt))
  },
  documentText: (id) => window.noblesseDesktop?.readDocumentText?.(id)
    ?? Promise.resolve({ id, text: documentPreviewFallback.find((item) => item.id === id)?.previewText || '' }),
  chooseDocumentFiles: () => {
    if (!window.noblesseDesktop?.chooseDocumentFiles) throw new Error('La sélection de fichiers est disponible dans l’application desktop.')
    return window.noblesseDesktop.chooseDocumentFiles()
  },
  registerDroppedDocumentFiles: (files) => {
    if (!window.noblesseDesktop?.registerDroppedDocumentFiles) throw new Error('Le dépôt de fichiers est disponible dans l’application desktop.')
    return window.noblesseDesktop.registerDroppedDocumentFiles(files)
  },
  importDocuments: (request) => {
    if (!window.noblesseDesktop?.importDocuments) throw new Error('L’import est disponible dans l’application desktop.')
    return window.noblesseDesktop.importDocuments(request)
  },
  documentHistory: (id) => window.noblesseDesktop?.getDocumentHistory?.(id)
    ?? Promise.reject(new Error('L’historique est disponible dans l’application desktop.')),
  replaceDocumentVersion: (id, selectionToken) => window.noblesseDesktop?.replaceDocumentVersion?.(id, selectionToken)
    ?? Promise.reject(new Error('Le versionnage est disponible dans l’application desktop.')),
  revertDocumentVersion: (id, revision) => window.noblesseDesktop?.revertDocumentVersion?.(id, revision)
    ?? Promise.reject(new Error('Le versionnage est disponible dans l’application desktop.')),
  planDeleteDocument: (id) => {
    if (!window.noblesseDesktop?.planDeleteDocument) throw new Error('La suppression est disponible dans l’application desktop.')
    return window.noblesseDesktop.planDeleteDocument(id)
  },
  deleteDocument: (confirmation) => {
    if (!window.noblesseDesktop?.deleteDocument) throw new Error('La suppression est disponible dans l’application desktop.')
    return window.noblesseDesktop.deleteDocument(confirmation)
  },
  restoreDocument: (id) => window.noblesseDesktop?.restoreDocument?.(id) ?? Promise.reject(new Error('La restauration est disponible dans l’application desktop.')),
  openDocument: (id) => window.noblesseDesktop?.openDocument?.(id) ?? Promise.reject(new Error('L’ouverture locale est disponible dans l’application desktop.')),
  revealDocument: (id) => window.noblesseDesktop?.revealDocument?.(id) ?? Promise.reject(new Error('L’accès au dossier est disponible dans l’application desktop.')),
  operations: () => window.noblesseDesktop?.listOperations?.() ?? Promise.resolve([]),
  resumeOperation: (jobId) => window.noblesseDesktop?.resumeOperation?.(jobId)
    ?? Promise.reject(new Error('La reprise est disponible dans l’application desktop.')),
  cancelOperation: (jobId) => window.noblesseDesktop?.cancelOperation?.(jobId)
    ?? Promise.reject(new Error('L’annulation est disponible dans l’application desktop.')),
  recoveryStatus: () => window.noblesseDesktop?.recoveryStatus?.()
    ?? Promise.reject(new Error('Les sauvegardes sont disponibles dans l’application desktop.')),
  createRecoverySnapshot: (label) => window.noblesseDesktop?.createRecoverySnapshot?.(label)
    ?? Promise.reject(new Error('Les sauvegardes sont disponibles dans l’application desktop.')),
  verifyRecoverySnapshot: (snapshotId) => window.noblesseDesktop?.verifyRecoverySnapshot?.(snapshotId)
    ?? Promise.reject(new Error('La vérification est disponible dans l’application desktop.')),
  revealRecoveryRepository: () => window.noblesseDesktop?.revealRecoveryRepository?.()
    ?? Promise.reject(new Error('Le dépôt de sauvegarde est disponible dans l’application desktop.')),
  financeDashboard: (options) => window.noblesseDesktop?.getFinanceDashboard?.(options)
    ?? Promise.reject(new Error('Finances disponibles uniquement dans l’application Noblesse Studio')),
  financeTransactions: (options) => window.noblesseDesktop?.listFinanceTransactions?.(options)
    ?? Promise.reject(new Error('Finances disponibles uniquement dans l’application Noblesse Studio')),
  financePlanExpense: (draft) => window.noblesseDesktop?.planFinanceTransaction?.(draft)
    ?? Promise.reject(new Error('Finances disponibles uniquement dans l’application Noblesse Studio')),
  financeApplyOperation: (confirmation) => window.noblesseDesktop?.applyFinanceTransaction?.(confirmation)
    ?? Promise.reject(new Error('Finances disponibles uniquement dans l’application Noblesse Studio')),
  onFinanceChanged: (callback) => window.noblesseDesktop?.onFinanceChanged?.(callback) || (() => {}),
  calendarSnapshot: () => window.noblesseDesktop?.calendarSnapshot?.() ?? calendarWebRepository.snapshot(),
  calendarCreate: (input) => window.noblesseDesktop?.calendarCreate?.(input) ?? calendarWebRepository.create(input),
  calendarUpdate: (id, patch) => window.noblesseDesktop?.calendarUpdate?.(id, patch) ?? calendarWebRepository.update(id, patch),
  calendarDelete: (id) => window.noblesseDesktop?.calendarDelete?.(id) ?? calendarWebRepository.delete(id),
  calendarImportLegacy: (items) => window.noblesseDesktop?.calendarImportLegacy?.(items) ?? calendarWebRepository.importLegacy(items),
  calendarUpdateSettings: (patch) => window.noblesseDesktop?.calendarUpdateSettings?.(patch) ?? calendarWebRepository.updateSettings(patch),
  calendarTestNotification: () => window.noblesseDesktop?.calendarTestNotification?.() ?? calendarWebRepository.testNotification(),
  onCalendarUpdated: (callback) => window.noblesseDesktop?.onCalendarUpdated?.(callback) || calendarWebRepository.onUpdated(callback),
  onNavigate: (callback) => window.noblesseDesktop?.onNavigate?.(callback) || (() => {}),
  onDocumentsUpdated: (callback) => window.noblesseDesktop?.onDocumentsUpdated?.(callback) || (() => {}),
  onOperationsUpdated: (callback) => window.noblesseDesktop?.onOperationsUpdated?.(callback) || (() => {}),
  onRecoveryProgress: (callback) => window.noblesseDesktop?.onRecoveryProgress?.(callback) || (() => {}),
  onVaultUpdated: (callback) => window.noblesseDesktop?.onVaultUpdated?.(callback) || (() => {}),
}
