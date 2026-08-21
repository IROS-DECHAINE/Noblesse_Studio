import { calendarWebRepository } from './calendarWebRepository.js'
import { documentPreviewFallback } from '../data/documentProjects.js'

const baseUrl = import.meta.env?.BASE_URL || '/'

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
  if (!asset?.preview_source && !asset?.preview_asset) return ''
  const desktopAvailable = Boolean(globalThis.window?.noblesseDesktop)
  if (desktopAvailable && asset.preview_source) {
    return `noblesse-vault://preview/${encodeURIComponent(asset.preview_source)}`
  }
  if (asset.preview_source) return vaultPreviewSourceUrl(asset.preview_source)
  return asset.preview_asset ? publicAsset(asset.preview_asset) : ''
}

export const studioApi = {
  assets: async () => {
    if (window.noblesseDesktop?.getAssets) return window.noblesseDesktop.getAssets()
    return fetchJson('data/vault-assets.json').then((payload) => payload.assets || [])
  },
  materialPreview: async (assetId) => {
    const descriptor = globalThis.window?.noblesseDesktop?.getMaterialPreview
      ? await globalThis.window.noblesseDesktop.getMaterialPreview(assetId)
      : await fetchJson(`api/material-preview?assetId=${encodeURIComponent(assetId)}`)
    return resolveMaterialPreviewSources(descriptor)
  },
  projects: () => window.noblesseDesktop?.listProjects?.() ?? Promise.resolve([]),
  setProjectFavorite: (request) => window.noblesseDesktop?.setProjectFavorite?.(request) ?? Promise.resolve([]),
  vaultHealth: () => window.noblesseDesktop?.getVaultHealth?.() ?? Promise.resolve(null),
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
  onVaultUpdated: (callback) => window.noblesseDesktop?.onVaultUpdated?.(callback) || (() => {}),
}
