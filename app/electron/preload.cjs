const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('noblesseDesktop', Object.freeze({
  platform: process.platform,
  getAssets: () => ipcRenderer.invoke('noblesse:assets'),
  getMaterialPreview: (assetId) => ipcRenderer.invoke('noblesse:material-preview', { assetId }),
  getVaultHealth: () => ipcRenderer.invoke('noblesse:vault-health'),
  chooseSoundFiles: () => ipcRenderer.invoke('noblesse:sounds:choose-files'),
  importSounds: (request) => ipcRenderer.invoke('noblesse:sounds:import-batch', request),
  planVaultTrash: (assetIds) => ipcRenderer.invoke('noblesse:vault-trash:plan', { assetIds }),
  applyVaultTrash: (request) => ipcRenderer.invoke('noblesse:vault-trash:apply', request),
  listVaultTrash: () => ipcRenderer.invoke('noblesse:vault-trash:list'),
  restoreVaultTrash: (trashId) => ipcRenderer.invoke('noblesse:vault-trash:restore', { trashId }),
  listProjects: () => ipcRenderer.invoke('noblesse:projects'),
  setProjectFavorite: (request) => ipcRenderer.invoke('noblesse:project-favorite', request),
  listProjectLaunchProfiles: () => ipcRenderer.invoke('noblesse:project-launch-profiles'),
  launchProject: (profileId) => ipcRenderer.invoke('noblesse:project-launch', { profileId }),
  getFortnitePrimebot: (options) => ipcRenderer.invoke('noblesse:fortnite-primebot', options),
  getUefnHealth: () => ipcRenderer.invoke('noblesse:uefn-health'),
  installAsset: (request) => ipcRenderer.invoke('noblesse:install-asset', request),
  listDocuments: (filters) => ipcRenderer.invoke('noblesse:documents:list', filters),
  listDeletedDocuments: () => ipcRenderer.invoke('noblesse:documents:list', { includeDeleted: true }),
  readDocumentText: (id) => ipcRenderer.invoke('noblesse:documents:read-text', { id }),
  chooseDocumentFiles: () => ipcRenderer.invoke('noblesse:documents:choose-files'),
  registerDroppedDocumentFiles: (files) => {
    const filePaths = Array.from(files || [], (file) => webUtils.getPathForFile(file)).filter(Boolean)
    return ipcRenderer.invoke('noblesse:documents:register-drop', { filePaths })
  },
  importDocuments: (request) => ipcRenderer.invoke('noblesse:documents:import', request),
  getDocumentHistory: (id) => ipcRenderer.invoke('noblesse:documents:history', { id }),
  replaceDocumentVersion: (id, selectionToken) => ipcRenderer.invoke('noblesse:documents:replace-version', { id, selectionToken }),
  revertDocumentVersion: (id, revision) => ipcRenderer.invoke('noblesse:documents:revert-version', { id, revision }),
  planDeleteDocument: (id) => ipcRenderer.invoke('noblesse:documents:plan-delete', { id }),
  deleteDocument: (confirmation) => ipcRenderer.invoke('noblesse:documents:delete', confirmation),
  restoreDocument: (id) => ipcRenderer.invoke('noblesse:documents:restore', { id }),
  openDocument: (id) => ipcRenderer.invoke('noblesse:documents:open', { id }),
  revealDocument: (id) => ipcRenderer.invoke('noblesse:documents:reveal', { id }),
  listOperations: () => ipcRenderer.invoke('noblesse:operations:list'),
  resumeOperation: (jobId) => ipcRenderer.invoke('noblesse:operations:resume', { jobId }),
  cancelOperation: (jobId) => ipcRenderer.invoke('noblesse:operations:cancel', { jobId }),
  recoveryStatus: () => ipcRenderer.invoke('noblesse:recovery:status'),
  createRecoverySnapshot: (label) => ipcRenderer.invoke('noblesse:recovery:create-snapshot', { label }),
  verifyRecoverySnapshot: (snapshotId) => ipcRenderer.invoke('noblesse:recovery:verify-snapshot', { snapshotId }),
  revealRecoveryRepository: () => ipcRenderer.invoke('noblesse:recovery:reveal'),
  getFinanceDashboard: (options) => ipcRenderer.invoke('finance:get-dashboard', options),
  listFinanceTransactions: (options) => ipcRenderer.invoke('finance:list-transactions', options),
  planFinanceTransaction: (draft) => ipcRenderer.invoke('finance:plan-transaction', draft),
  applyFinanceTransaction: (confirmation) => ipcRenderer.invoke('finance:apply-transaction', confirmation),
  onFinanceChanged: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('finance:changed', listener)
    return () => ipcRenderer.removeListener('finance:changed', listener)
  },
  calendarSnapshot: () => ipcRenderer.invoke('noblesse:calendar:snapshot'),
  calendarCreate: (request) => ipcRenderer.invoke('noblesse:calendar:create', request),
  calendarUpdate: (id, patch) => ipcRenderer.invoke('noblesse:calendar:update', { id, patch }),
  calendarDelete: (id) => ipcRenderer.invoke('noblesse:calendar:delete', { id }),
  calendarImportLegacy: (items) => ipcRenderer.invoke('noblesse:calendar:import-legacy', { items }),
  calendarUpdateSettings: (patch) => ipcRenderer.invoke('noblesse:calendar:update-settings', patch),
  calendarTestNotification: () => ipcRenderer.invoke('noblesse:calendar:test-notification'),
  onCalendarUpdated: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('noblesse:calendar-updated', listener)
    return () => ipcRenderer.removeListener('noblesse:calendar-updated', listener)
  },
  onNavigate: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('noblesse:navigate', listener)
    return () => ipcRenderer.removeListener('noblesse:navigate', listener)
  },
  onDocumentsUpdated: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('noblesse:documents-updated', listener)
    return () => ipcRenderer.removeListener('noblesse:documents-updated', listener)
  },
  onOperationsUpdated: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('noblesse:operations-updated', listener)
    return () => ipcRenderer.removeListener('noblesse:operations-updated', listener)
  },
  onRecoveryProgress: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('noblesse:recovery-progress', listener)
    return () => ipcRenderer.removeListener('noblesse:recovery-progress', listener)
  },
  onVaultUpdated: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('noblesse:vault-updated', listener)
    return () => ipcRenderer.removeListener('noblesse:vault-updated', listener)
  },
}))
