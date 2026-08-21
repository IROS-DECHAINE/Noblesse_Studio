import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, Notification, powerMonitor, protocol, shell, Tray } from 'electron'
import { existsSync, mkdirSync, watch } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createDocumentLibrary } from './lib/documentLibrary.mjs'
import { createCalendarReminderScheduler } from './lib/calendarReminderScheduler.mjs'
import { createCalendarStore } from './lib/calendarStore.mjs'
import { createBackupService } from './lib/backupService.mjs'
import { createDocumentImportService } from './lib/documentImportService.mjs'
import { createFinanceService, financeIpcChannels } from './lib/financeService.mjs'
import { createFortnitePrimebotFetcher } from './lib/fortniteData.mjs'
import { shouldQuitForLocalUpdate } from './lib/localUpdateLifecycle.mjs'
import { createProjectLaunchService } from './lib/projectLaunchService.mjs'
import { createSoundBatchImportService } from './lib/soundBatchImportService.mjs'
import { createSoundLibraryService } from './lib/soundLibraryService.mjs'
import { installVaultAsset } from './lib/uefnInstaller.mjs'
import { prepareUefnSoundHandoff } from './lib/uefnSoundHandoff.mjs'
import { installUnrealNativeAsset } from './lib/unrealNativeInstaller.mjs'
import { createUefnSessionService } from './lib/uefnSessionService.mjs'
import { createVaultTrashService } from './lib/vaultTrashService.mjs'
import { buildWindowsTaskbarDetails, windowsAppId } from './lib/windowsTaskbarIdentity.mjs'
import { createOperationJobStore } from './lib/operationJobStore.mjs'
import { createStudioIpcGateway } from './lib/studioIpcGateway.mjs'
import { listUnrealProjects, loadMaterialPreviewDescriptor, loadVaultAsset, readVaultCatalog, resolveVaultAudioRequest, resolveVaultPreviewRequest, validateVaultIntegrity, vaultRoot } from './lib/vaultService.mjs'
import {
  assertProjectFavoriteRequestV1,
  assertSoundImportRequestV1,
  assertVaultTrashApplyRequestV1,
  assertVaultTrashItemV1,
  assertVaultTrashListResponseV1,
  assertVaultTrashPlanRequestV1,
  assertVaultTrashPlanResponseV1,
  assertVaultTrashRestoreRequestV1,
  assertVaultTrashRestoreResponseV1,
  serializeAssetsResponseV1,
  serializeProjectsResponseV1,
  serializeSoundImportResponseV1,
  serializeSoundSelectionResponseV1,
} from '../shared/publicIpcContracts.mjs'
import { rebuildLibraryIndexes } from '../scripts/rebuild-library-index.mjs'
import {
  studioBackupsRoot,
  studioDocumentsRoot,
  studioFfmpegExecutable,
  studioOperationsRoot,
  studioRuntimeRoot,
  studioStateRoot,
  studioUefnEditorExecutable,
} from './lib/studioPaths.mjs'

app.setName('Noblesse Studio')

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const applicationIconPath = path.join(currentDir, '..', 'assets', 'noblesse-vault.ico')
let cachedApplicationIcon
const loadApplicationIcon = () => {
  if (cachedApplicationIcon !== undefined) return cachedApplicationIcon
  if (!existsSync(applicationIconPath)) {
    cachedApplicationIcon = null
    return cachedApplicationIcon
  }
  try {
    const image = nativeImage.createFromPath(applicationIconPath)
    cachedApplicationIcon = image.isEmpty() ? null : image
  } catch {
    cachedApplicationIcon = null
  }
  return cachedApplicationIcon
}
mkdirSync(studioRuntimeRoot(), { recursive: true })
app.setPath('userData', studioRuntimeRoot())
const documentBootstrapFile = path.join(currentDir, 'data', 'document-bootstrap.v1.json')
const hasSingleInstanceLock = app.requestSingleInstanceLock()
let vaultWatcher = null
let vaultRefreshTimer = null
let documentLibrary = null
let documentImportService = null
let backupService = null
let financeService = null
let calendarStore = null
let calendarScheduler = null
let calendarInboxTimer = null
let calendarTray = null
let calendarRunsInBackground = false
let isQuitting = false
let uefnSessionService = null
let projectLaunchService = null
let operationJobStore = null
let soundLibraryService = null
let soundBatchImportService = null
let vaultTrashService = null
let vaultMutationQueue = Promise.resolve()
const activeCalendarNotifications = new Set()
const trustedWebContents = new Set()
const getFortnitePrimebot = createFortnitePrimebotFetcher()

const withVaultMutation = (task) => {
  const operation = vaultMutationQueue.then(task, task)
  vaultMutationQueue = operation.catch(() => undefined)
  return operation
}

if (process.platform === 'win32') app.setAppUserModelId(windowsAppId)

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'noblesse-doc',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
  {
    scheme: 'noblesse-vault',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
])

const requireUefnSessionService = () => {
  if (!uefnSessionService) throw new Error('La détection des sessions UEFN est indisponible.')
  return uefnSessionService
}

const requireProjectLaunchService = () => {
  if (!projectLaunchService) throw new Error('Le lanceur de projets UEFN est indisponible.')
  return projectLaunchService
}

const getUefnHealth = () => requireUefnSessionService().getHealth()

const getAssets = async () => {
  return readVaultCatalog()
}

const requireStudioSender = (event) => {
  const owner = BrowserWindow.fromWebContents(event.sender)
  if (!owner
    || owner.isDestroyed()
    || !trustedWebContents.has(event.sender.id)
    || event.senderFrame !== event.sender.mainFrame
    || !isAllowedRendererUrl(event.senderFrame?.url)) {
    throw new Error('Client Noblesse Studio non autorisé.')
  }
  return owner
}

const requireFinanceService = () => {
  if (!financeService) throw new Error('Le registre financier local est indisponible.')
  return financeService
}

const requireDocumentLibrary = () => {
  if (!documentLibrary) throw new Error('La bibliothèque de documents locale est indisponible.')
  return documentLibrary
}

const requireDocumentImportService = () => {
  if (!documentImportService) throw new Error('Le gestionnaire d’importations documentaires est indisponible.')
  return documentImportService
}

const requireBackupService = () => {
  if (!backupService) throw new Error('Le service de sauvegarde est indisponible.')
  return backupService
}

const requireSoundLibraryService = () => {
  if (!soundLibraryService) throw new Error('La bibliothèque audio locale est indisponible.')
  return soundLibraryService
}

const requireOperationJobStore = () => {
  if (!operationJobStore) throw new Error('Le journal des opérations locales est indisponible.')
  return operationJobStore
}

const requireSoundBatchImportService = () => {
  if (!soundBatchImportService) throw new Error('Le gestionnaire d’importations audio est indisponible.')
  return soundBatchImportService
}

const requireVaultTrashService = () => {
  if (!vaultTrashService) throw new Error('La corbeille du Coffre est indisponible.')
  return vaultTrashService
}

const requireCalendarStore = () => {
  if (!calendarStore) throw new Error('Le calendrier local est indisponible.')
  return calendarStore
}

const calendarRoot = () => process.env.NOBLESSE_CALENDAR_ROOT
  ? path.resolve(process.env.NOBLESSE_CALENDAR_ROOT)
  : path.join(studioStateRoot(), 'calendar')

const notifyCalendarUpdated = (payload = {}) => {
  for (const targetWindow of BrowserWindow.getAllWindows()) {
    if (!targetWindow.isDestroyed()) targetWindow.webContents.send('noblesse:calendar-updated', payload)
  }
}

const showCalendarSurface = ({ itemId = null } = {}) => {
  const targetWindow = BrowserWindow.getAllWindows()[0] || createWindow()
  if (targetWindow.isMinimized()) targetWindow.restore()
  targetWindow.show()
  const deliverNavigation = () => targetWindow.webContents.send('noblesse:navigate', { section: 'calendar', itemId })
  if (targetWindow.webContents.isLoading()) targetWindow.webContents.once('did-finish-load', deliverNavigation)
  else deliverNavigation()
}

const ensureCalendarTray = () => {
  if (calendarTray || !app.isReady()) return calendarTray
  const trayIcon = loadApplicationIcon()
  if (!trayIcon) {
    console.error(`[Noblesse Studio] Icône système introuvable ou invalide : ${applicationIconPath}`)
    return null
  }
  try {
    const tray = new Tray(trayIcon)
    tray.setToolTip('Noblesse Studio — rappels actifs')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Ouvrir le calendrier', click: () => showCalendarSurface() },
      { type: 'separator' },
      { label: 'Quitter Noblesse Studio', click: () => { isQuitting = true; app.quit() } },
    ]))
    tray.on('double-click', () => showCalendarSurface())
    calendarTray = tray
    return calendarTray
  } catch (error) {
    console.error('[Noblesse Studio] Création de l’icône système impossible.', error)
    calendarTray = null
    return null
  }
}

const updateCalendarRuntime = (settings = {}) => {
  calendarRunsInBackground = Boolean(settings.desktopNotificationsEnabled && settings.runInBackground)
  if (settings.desktopNotificationsEnabled) calendarScheduler?.start()
  else calendarScheduler?.stop()
  if (calendarRunsInBackground && !ensureCalendarTray()) calendarRunsInBackground = false
  else if (calendarTray) {
    calendarTray.destroy()
    calendarTray = null
  }
}

const showCalendarNotification = async (reminder) => {
  const snapshot = await requireCalendarStore().getSnapshot()
  if (!snapshot.settings.desktopNotificationsEnabled) throw new Error('Les notifications calendrier sont désactivées.')
  if (!Notification.isSupported()) throw new Error('Les notifications système ne sont pas prises en charge.')
  const notificationIcon = loadApplicationIcon()
  const notification = new Notification({
    title: reminder.title || 'Rappel Noblesse Studio',
    body: [reminder.projectLabel, reminder.location].filter(Boolean).join(' • ') || 'Un élément du calendrier commence bientôt.',
    ...(notificationIcon ? { icon: notificationIcon } : {}),
    silent: false,
  })
  activeCalendarNotifications.add(notification)
  notification.on('click', () => showCalendarSurface({ itemId: reminder.itemId }))
  notification.on('close', () => activeCalendarNotifications.delete(notification))
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('La notification système n’a pas confirmé son affichage.')), 5000)
    notification.once('show', () => { clearTimeout(timeout); resolve() })
    notification.once('failed', (_event, error) => { clearTimeout(timeout); reject(new Error(String(error || 'Notification refusée par le système.'))) })
    notification.show()
  })
}

const documentsRoot = () => {
  return studioDocumentsRoot()
}

const withPreviewUrl = (document) => ({
  ...document,
  previewUrl: document.available === false ? '' : `noblesse-doc://file/${encodeURIComponent(document.id)}`,
})

const notifyDocumentsUpdated = () => {
  for (const targetWindow of BrowserWindow.getAllWindows()) {
    targetWindow.webContents.send('noblesse:documents-updated')
  }
}

const broadcast = (channel, payload) => {
  for (const targetWindow of BrowserWindow.getAllWindows()) {
    if (!targetWindow.isDestroyed() && trustedWebContents.has(targetWindow.webContents.id)) {
      targetWindow.webContents.send(channel, payload)
    }
  }
}

const notifyOperationUpdated = (job) => broadcast('noblesse:operations-updated', job)
const notifyRecoveryProgress = (progress) => broadcast('noblesse:recovery-progress', progress)

const listDocuments = async (filters) => {
  const documents = await requireDocumentLibrary().list(filters)
  return documents.map(withPreviewUrl)
}

const chooseDocumentFiles = async (event) => {
  const owner = requireStudioSender(event)
  const selection = await dialog.showOpenDialog(owner, {
    title: 'Ajouter des documents à Noblesse Studio',
    buttonLabel: 'Choisir',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Documents et médias', extensions: ['pdf', 'md', 'markdown', 'txt', 'rtf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'm4a'] },
      { name: 'Tous les fichiers', extensions: ['*'] },
    ],
  })
  if (selection.canceled || !selection.filePaths.length) return []
  return requireDocumentLibrary().describeSelection(selection.filePaths)
}

const chooseSoundFiles = async (event) => {
  const owner = BrowserWindow.fromWebContents(event.sender)
  const selection = await dialog.showOpenDialog(owner, {
    title: 'Ajouter des sons au Coffre',
    buttonLabel: 'Choisir ces sons',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio WAV ou MP3', extensions: ['wav', 'mp3'] },
    ],
  })
  if (selection.canceled || !selection.filePaths.length) {
    return { schemaVersion: 1, canceled: true, files: [] }
  }
  return requireSoundLibraryService().describeSelections(selection.filePaths)
}

const openDocument = async (id) => {
  const { filePath } = await requireDocumentLibrary().resolveFile(id)
  const error = await shell.openPath(filePath)
  if (error) throw new Error('Le document ne peut pas être ouvert avec l’application système.')
  return { opened: true }
}

const revealDocument = async (id) => {
  const { filePath } = await requireDocumentLibrary().resolveFile(id)
  shell.showItemInFolder(filePath)
  return { revealed: true }
}

const handleDocumentProtocol = async (request) => {
  try {
    const url = new URL(request.url)
    if (url.hostname !== 'file') return new Response('Introuvable', { status: 404 })
    const documentId = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (!documentId || documentId.includes('/')) return new Response('Introuvable', { status: 404 })
    const { filePath } = await requireDocumentLibrary().resolveFile(documentId)
    return net.fetch(pathToFileURL(filePath).toString(), { headers: request.headers })
  } catch {
    return new Response('Document indisponible', { status: 404 })
  }
}

const handleVaultProtocol = async (request) => {
  try {
    const url = new URL(request.url)
    const token = decodeURIComponent(url.pathname.replace(/^\//, ''))
    const resolved = url.hostname === 'preview'
      ? await resolveVaultPreviewRequest(token)
      : url.hostname === 'audio'
        ? await resolveVaultAudioRequest(token)
        : null
    if (!resolved) return new Response('Introuvable', { status: 404 })
    const { filePath, mimeType } = resolved
    const fileResponse = await net.fetch(pathToFileURL(filePath).toString(), { headers: request.headers })
    const headers = new Headers(fileResponse.headers)
    headers.set('Content-Type', mimeType)
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin')
    return new Response(fileResponse.body, { status: fileResponse.status, headers })
  } catch {
    return new Response('Aperçu indisponible', { status: 404 })
  }
}

const productionRendererFile = path.resolve(currentDir, '..', 'dist', 'index.html')
const configuredDevUrl = String(process.env.VITE_DEV_SERVER_URL || '').trim()
const allowedDevUrl = configuredDevUrl === 'http://127.0.0.1:4178' ? configuredDevUrl : ''

const isAllowedRendererUrl = (value) => {
  try {
    const url = new URL(value)
    if (allowedDevUrl) {
      const expected = new URL(allowedDevUrl)
      if (url.origin === expected.origin
        && url.pathname === expected.pathname
        && !url.search
        && !url.hash) return true
    }
    if (url.protocol !== 'file:') return false
    return !url.search && !url.hash && path.resolve(fileURLToPath(url)) === productionRendererFile
  } catch {
    return false
  }
}

const safeExternalHttpsUrl = (value) => {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || value.length > 2048) return ''
    return url.toString()
  } catch {
    return ''
  }
}

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1536,
    height: 980,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: '#050d16',
    title: 'Noblesse Studio',
    icon: loadApplicationIcon() || undefined,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(currentDir, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
    },
  })
  if (process.platform === 'win32') {
    window.setAppDetails(buildWindowsTaskbarDetails({
      isPackaged: app.isPackaged,
      executablePath: process.execPath,
      applicationPath: path.resolve(currentDir, '..'),
      developmentIconPath: applicationIconPath,
    }))
  }
  trustedWebContents.add(window.webContents.id)
  window.webContents.once('destroyed', () => trustedWebContents.delete(window.webContents.id))
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.once('ready-to-show', () => window.show())
  window.on('close', (event) => {
    if (!isQuitting && calendarRunsInBackground) {
      const tray = ensureCalendarTray()
      if (tray) {
        event.preventDefault()
        window.hide()
      } else {
        calendarRunsInBackground = false
      }
    }
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    const external = safeExternalHttpsUrl(url)
    if (external) shell.openExternal(external).catch(() => undefined)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedRendererUrl(url)) event.preventDefault()
  })
  if (allowedDevUrl) window.loadURL(allowedDevUrl)
  else window.loadFile(productionRendererFile)
  return window
}

const startVaultWatcher = () => {
  vaultWatcher?.close()
  vaultWatcher = watch(vaultRoot(), { recursive: true }, () => {
    clearTimeout(vaultRefreshTimer)
    vaultRefreshTimer = setTimeout(() => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('noblesse:vault-updated')
    }, 220)
  })
}

const studioIpc = createStudioIpcGateway({ ipcMain, authorizeSender: requireStudioSender })

ipcMain.handle('noblesse:fortnite-primebot', (event, options) => {
  requireStudioSender(event)
  return getFortnitePrimebot(options)
})
ipcMain.handle('noblesse:uefn-health', (event) => {
  requireStudioSender(event)
  return getUefnHealth()
})
studioIpc.handle('noblesse:assets', () => getAssets(), {
  serializeResponse: serializeAssetsResponseV1,
})
studioIpc.handle('noblesse:sounds:choose-files', (_request, event) => chooseSoundFiles(event), {
  serializeResponse: serializeSoundSelectionResponseV1,
})
studioIpc.handle('noblesse:sounds:import-batch', (request) => requireSoundBatchImportService().start(request), {
  assertRequest: assertSoundImportRequestV1,
  serializeResponse: serializeSoundImportResponseV1,
})
studioIpc.handle('noblesse:vault-trash:plan', (request) => requireVaultTrashService().plan(request), {
  assertRequest: assertVaultTrashPlanRequestV1,
  serializeResponse: assertVaultTrashPlanResponseV1,
})
studioIpc.handle('noblesse:vault-trash:apply', async (request) => {
  const result = await requireVaultTrashService().apply(request)
  broadcast('noblesse:vault-updated', { reason: 'vault-trash' })
  return result
}, {
  assertRequest: assertVaultTrashApplyRequestV1,
  serializeResponse: assertVaultTrashItemV1,
})
studioIpc.handle('noblesse:vault-trash:list', () => requireVaultTrashService().list(), {
  serializeResponse: assertVaultTrashListResponseV1,
})
studioIpc.handle('noblesse:vault-trash:restore', async (request) => {
  const result = await requireVaultTrashService().restore(request)
  broadcast('noblesse:vault-updated', { reason: 'vault-trash-restore' })
  return result
}, {
  assertRequest: assertVaultTrashRestoreRequestV1,
  serializeResponse: assertVaultTrashRestoreResponseV1,
})
ipcMain.handle('noblesse:material-preview', (event, request) => {
  requireStudioSender(event)
  return loadMaterialPreviewDescriptor(request?.assetId)
})
ipcMain.handle('noblesse:vault-health', (event) => {
  requireStudioSender(event)
  return validateVaultIntegrity()
})
studioIpc.handle('noblesse:projects', async () => {
  const [uefnProjects, unrealProjects] = await Promise.all([
    requireUefnSessionService().listDestinations(),
    listUnrealProjects(),
  ])
  return [...uefnProjects, ...unrealProjects]
}, {
  serializeResponse: serializeProjectsResponseV1,
})
studioIpc.handle('noblesse:project-favorite', (request) => {
  return requireUefnSessionService().setFavorite(request)
}, {
  assertRequest: assertProjectFavoriteRequestV1,
  serializeResponse: serializeProjectsResponseV1,
})
ipcMain.handle('noblesse:project-launch-profiles', (event) => {
  requireStudioSender(event)
  return requireProjectLaunchService().getProfiles()
})
ipcMain.handle('noblesse:project-launch', (event, request) => {
  requireStudioSender(event)
  return requireProjectLaunchService().launch({ profileId: request?.profileId })
})
ipcMain.handle('noblesse:install-asset', async (event, request) => {
  requireStudioSender(event)
  const asset = await loadVaultAsset(request?.assetId)
  if (asset.asset_type === 'SoundWave') {
    const { handoffFile, ...result } = await prepareUefnSoundHandoff(request, {
      sessionService: requireUefnSessionService(),
    })
    shell.showItemInFolder(handoffFile)
    return result
  }
  if (asset.install_mode === 'UNREAL_NATIVE_BUNDLE') return installUnrealNativeAsset(request)
  return installVaultAsset(request, { sessionService: requireUefnSessionService() })
})
ipcMain.handle('noblesse:documents:list', (event, filters) => {
  requireStudioSender(event)
  return listDocuments(filters)
})
ipcMain.handle('noblesse:documents:read-text', (event, request) => {
  requireStudioSender(event)
  return requireDocumentLibrary().readText(request?.id)
})
ipcMain.handle('noblesse:documents:choose-files', chooseDocumentFiles)
ipcMain.handle('noblesse:documents:register-drop', (event, request) => {
  requireStudioSender(event)
  return requireDocumentLibrary().describeSelection(request?.filePaths)
})
ipcMain.handle('noblesse:documents:import', async (event, request) => {
  requireStudioSender(event)
  if (request?.filePaths !== undefined) throw new Error('Les chemins directs ne sont pas acceptés depuis l’interface.')
  return requireDocumentImportService().start(request)
})
ipcMain.handle('noblesse:documents:plan-delete', (event, request) => {
  requireStudioSender(event)
  return requireDocumentLibrary().planDelete(request?.id)
})
ipcMain.handle('noblesse:documents:delete', async (event, confirmation) => {
  requireStudioSender(event)
  const result = await requireDocumentLibrary().applyDelete(confirmation)
  notifyDocumentsUpdated()
  return result
})
ipcMain.handle('noblesse:documents:restore', async (event, request) => {
  requireStudioSender(event)
  const result = await requireDocumentLibrary().restore(request?.id)
  notifyDocumentsUpdated()
  return withPreviewUrl(result)
})
ipcMain.handle('noblesse:documents:history', (event, request) => {
  requireStudioSender(event)
  return requireDocumentLibrary().listHistory(request?.id)
})
ipcMain.handle('noblesse:documents:replace-version', async (event, request) => {
  requireStudioSender(event)
  const result = await requireDocumentLibrary().replaceVersion(request?.id, request?.selectionToken)
  notifyDocumentsUpdated()
  return withPreviewUrl(result)
})
ipcMain.handle('noblesse:documents:revert-version', async (event, request) => {
  requireStudioSender(event)
  const result = await requireDocumentLibrary().revertVersion(request?.id, request?.revision)
  notifyDocumentsUpdated()
  return withPreviewUrl(result)
})
ipcMain.handle('noblesse:operations:list', (event) => {
  requireStudioSender(event)
  return requireOperationJobStore().list({ limit: 100 })
})
ipcMain.handle('noblesse:operations:resume', async (event, request) => {
  requireStudioSender(event)
  const job = await requireOperationJobStore().get(request?.jobId)
  if (job.type === 'DOCUMENT_IMPORT') return requireDocumentImportService().resume(job.id)
  if (job.type === 'SOUND_IMPORT') return requireSoundBatchImportService().resume(job.id)
  throw new Error('Cette opération ne peut pas être reprise depuis l’interface.')
})
ipcMain.handle('noblesse:operations:cancel', async (event, request) => {
  requireStudioSender(event)
  const job = await requireOperationJobStore().get(request?.jobId)
  if (job.type === 'DOCUMENT_IMPORT') return requireDocumentImportService().cancel(job.id)
  if (job.type === 'SOUND_IMPORT') return requireSoundBatchImportService().cancel(job.id)
  throw new Error('Cette opération ne peut pas être annulée depuis l’interface.')
})
ipcMain.handle('noblesse:recovery:status', (event) => {
  requireStudioSender(event)
  return requireBackupService().status()
})
ipcMain.handle('noblesse:recovery:create-snapshot', (event, request) => {
  requireStudioSender(event)
  return requireBackupService().createSnapshot({
    reason: 'manual',
    label: request?.label,
    onProgress: notifyRecoveryProgress,
  })
})
ipcMain.handle('noblesse:recovery:verify-snapshot', (event, request) => {
  requireStudioSender(event)
  return requireBackupService().verifySnapshot(request?.snapshotId, { onProgress: notifyRecoveryProgress })
})
ipcMain.handle('noblesse:recovery:reveal', async (event) => {
  requireStudioSender(event)
  await requireBackupService().ensure()
  shell.showItemInFolder(studioBackupsRoot())
  return { revealed: true }
})
ipcMain.handle('noblesse:documents:open', (event, request) => {
  requireStudioSender(event)
  return openDocument(request?.id)
})
ipcMain.handle('noblesse:documents:reveal', (event, request) => {
  requireStudioSender(event)
  return revealDocument(request?.id)
})
ipcMain.handle(financeIpcChannels.dashboard, (event, options) => {
  requireStudioSender(event)
  return requireFinanceService().getDashboard({ range: options?.range, currency: 'EUR' })
})
ipcMain.handle(financeIpcChannels.listTransactions, (event, options) => {
  requireStudioSender(event)
  return requireFinanceService().listTransactions(options)
})
ipcMain.handle(financeIpcChannels.planTransaction, (event, draft) => {
  requireStudioSender(event)
  return requireFinanceService().planManualTransaction({
    ...(draft && typeof draft === 'object' ? draft : {}),
    flow: 'OUTFLOW',
    kind: 'OPERATING_EXPENSE',
    currency: 'EUR',
    financialStatus: 'PAID',
    settlement: 'PAID',
  })
})
ipcMain.handle(financeIpcChannels.applyTransaction, async (event, confirmation) => {
  requireStudioSender(event)
  const transaction = confirmation?.plan?.transaction
  if (transaction?.flow !== 'OUTFLOW'
    || transaction?.kind !== 'OPERATING_EXPENSE'
    || transaction?.currency !== 'EUR'
    || transaction?.financial_status !== 'PAID'
    || transaction?.settlement !== 'PAID'
    || transaction?.source?.type !== 'MANUAL') {
    throw new Error('Seules les dépenses manuelles préparées par Noblesse Studio peuvent être confirmées.')
  }
  const result = await requireFinanceService().applyTransactionPlan(confirmation)
  if (result.status === 'APPLIED') {
    for (const targetWindow of BrowserWindow.getAllWindows()) {
      targetWindow.webContents.send(financeIpcChannels.changed, { ledgerRevision: result.ledgerRevision })
    }
  }
  return result
})

ipcMain.handle('noblesse:calendar:snapshot', async (event) => {
  requireStudioSender(event)
  const drained = await requireCalendarStore().drainInbox()
  if (drained.processed.length) notifyCalendarUpdated({ revision: drained.snapshot.revision, source: 'inbox' })
  return drained.snapshot
})
ipcMain.handle('noblesse:calendar:create', async (event, request) => {
  requireStudioSender(event)
  const result = await requireCalendarStore().createItem(request)
  notifyCalendarUpdated({ revision: result.snapshot.revision, source: 'human' })
  return result
})
ipcMain.handle('noblesse:calendar:update', async (event, request) => {
  requireStudioSender(event)
  const result = await requireCalendarStore().updateItem(request?.id, request?.patch)
  notifyCalendarUpdated({ revision: result.snapshot.revision, source: 'human' })
  return result
})
ipcMain.handle('noblesse:calendar:delete', async (event, request) => {
  requireStudioSender(event)
  const result = await requireCalendarStore().deleteItem(request?.id)
  notifyCalendarUpdated({ revision: result.snapshot.revision, source: 'human' })
  return result
})
ipcMain.handle('noblesse:calendar:import-legacy', async (event, request) => {
  requireStudioSender(event)
  const result = await requireCalendarStore().importLegacy(request?.items)
  if (result.status !== 'ALREADY_IMPORTED') notifyCalendarUpdated({ revision: result.snapshot.revision, source: 'migration' })
  return result
})
ipcMain.handle('noblesse:calendar:update-settings', async (event, patch) => {
  requireStudioSender(event)
  const result = await requireCalendarStore().updateSettings(patch)
  updateCalendarRuntime(result.snapshot.settings)
  notifyCalendarUpdated({ revision: result.snapshot.revision, source: 'settings' })
  return result
})
ipcMain.handle('noblesse:calendar:test-notification', async (event) => {
  requireStudioSender(event)
  await showCalendarNotification({
    itemId: null,
    title: 'Noblesse Studio',
    projectLabel: 'Les rappels du calendrier sont prêts.',
    location: '',
  })
  return { supported: true, shown: true }
})

if (!hasSingleInstanceLock) app.quit()

if (hasSingleInstanceLock) app.whenReady().then(async () => {
  uefnSessionService = createUefnSessionService({
    favoritesFile: path.join(studioStateRoot(), 'uefn-project-favorites.v1.json'),
  })
  projectLaunchService = createProjectLaunchService({
    stateFile: path.join(studioStateRoot(), 'project-launches.v1.json'),
    sessionService: uefnSessionService,
    executableOverride: studioUefnEditorExecutable(),
    settingsBackupDirectory: path.join(studioBackupsRoot(), 'uefn-editor-settings'),
  })
  calendarStore = createCalendarStore({ rootDir: calendarRoot() })
  try {
    const initializedCalendar = await calendarStore.init()
    calendarScheduler = createCalendarReminderScheduler({
      store: calendarStore,
      notify: showCalendarNotification,
      initialLookbackMs: 24 * 60 * 60 * 1000,
      onError: (error) => console.error('[Noblesse Calendar] Scheduler indisponible', error),
    })
    updateCalendarRuntime(initializedCalendar.snapshot.settings)
    calendarInboxTimer = setInterval(async () => {
      try {
        const drained = await calendarStore.drainInbox()
        if (drained.processed.length) {
          notifyCalendarUpdated({ revision: drained.snapshot.revision, source: 'inbox' })
          await calendarScheduler.tick()
        }
      } catch (error) {
        console.error('[Noblesse Calendar] Inbox indisponible', error)
      }
    }, 5000)
    calendarInboxTimer.unref?.()
    powerMonitor.on('resume', () => calendarScheduler?.tick().catch((error) => console.error('[Noblesse Calendar] Reprise impossible', error)))
    powerMonitor.on('unlock-screen', () => calendarScheduler?.tick().catch(() => undefined))
  } catch (error) {
    console.error('[Noblesse Calendar] Initialisation impossible', error)
  }
  documentLibrary = createDocumentLibrary({ root: documentsRoot(), bootstrapFile: documentBootstrapFile })
  backupService = createBackupService({
    backupRoot: studioBackupsRoot(),
    roots: {
      vault: vaultRoot(),
      documents: documentsRoot(),
      state: studioStateRoot(),
    },
  })
  operationJobStore = createOperationJobStore({ root: studioOperationsRoot() })
  documentImportService = createDocumentImportService({
    documentLibrary,
    jobStore: operationJobStore,
    onChanged: (job) => {
      notifyOperationUpdated(job)
      if (job?.progress?.completed) notifyDocumentsUpdated()
    },
  })
  soundLibraryService = createSoundLibraryService({
    vaultRoot: vaultRoot(),
    rebuildIndexes: rebuildLibraryIndexes,
    ffmpegOverride: studioFfmpegExecutable(),
    withMutation: withVaultMutation,
  })
  soundBatchImportService = createSoundBatchImportService({
    soundLibrary: soundLibraryService,
    jobStore: operationJobStore,
    rebuildIndexes: () => withVaultMutation(() => rebuildLibraryIndexes()),
    onChanged: notifyOperationUpdated,
    onAssetImported: (result) => {
      broadcast('noblesse:vault-updated', { reason: 'sound-import', assetId: result.assetId })
    },
  })
  vaultTrashService = createVaultTrashService({
    vaultRoot: vaultRoot(),
    rebuildIndexes: rebuildLibraryIndexes,
    withMutation: withVaultMutation,
  })
  try {
    await protocol.handle('noblesse-vault', handleVaultProtocol)
  } catch (error) {
    console.error('[Noblesse Vault] Aperçus indisponibles', error)
  }
  try {
    await documentLibrary.ensure()
    await documentLibrary.bootstrap()
    await documentImportService.initialize()
    await soundBatchImportService.initialize()
    await vaultTrashService.initialize()
    await protocol.handle('noblesse-doc', handleDocumentProtocol)
  } catch (error) {
    console.error('[Noblesse Documents] Initialisation impossible', error)
  }
  financeService = createFinanceService({ dataDirectory: path.join(studioStateRoot(), 'finance') })
  try {
    await financeService.initialize()
  } catch (error) {
    console.error('[Noblesse Finance] Initialisation impossible', error)
  }
  startVaultWatcher()
  createWindow()
  app.on('activate', () => {
    const existingWindow = BrowserWindow.getAllWindows()[0]
    if (existingWindow) existingWindow.show()
    else createWindow()
  })
})

app.on('second-instance', (_event, commandLine) => {
  if (shouldQuitForLocalUpdate({ commandLine, isPackaged: app.isPackaged })) {
    isQuitting = true
    app.quit()
    return
  }
  if (app.isReady()) showCalendarSurface()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !calendarRunsInBackground) app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  vaultWatcher?.close()
  calendarScheduler?.stop()
  if (calendarInboxTimer) clearInterval(calendarInboxTimer)
  calendarInboxTimer = null
  calendarTray?.destroy()
  calendarTray = null
  activeCalendarNotifications.clear()
})
