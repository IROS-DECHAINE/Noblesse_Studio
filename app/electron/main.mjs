import { app, BrowserWindow, dialog, ipcMain, Menu, net, Notification, powerMonitor, protocol, shell, Tray } from 'electron'
import { mkdirSync, watch } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createDocumentLibrary } from './lib/documentLibrary.mjs'
import { createCalendarReminderScheduler } from './lib/calendarReminderScheduler.mjs'
import { createCalendarStore } from './lib/calendarStore.mjs'
import { createFinanceService, financeIpcChannels } from './lib/financeService.mjs'
import { createFortnitePrimebotFetcher } from './lib/fortniteData.mjs'
import { installVaultAsset } from './lib/uefnInstaller.mjs'
import { installUnrealNativeAsset } from './lib/unrealNativeInstaller.mjs'
import { createUefnSessionService } from './lib/uefnSessionService.mjs'
import { listUnrealProjects, loadMaterialPreviewDescriptor, loadVaultAsset, readVaultCatalog, resolveVaultPreviewSource, validateVaultIntegrity, vaultRoot } from './lib/vaultService.mjs'
import { studioDocumentsRoot, studioRuntimeRoot, studioStateRoot } from './lib/studioPaths.mjs'

app.setName('Noblesse Studio')

const currentDir = path.dirname(fileURLToPath(import.meta.url))
mkdirSync(studioRuntimeRoot(), { recursive: true })
app.setPath('userData', studioRuntimeRoot())
const documentBootstrapFile = path.join(currentDir, 'data', 'document-bootstrap.v1.json')
const hasSingleInstanceLock = app.requestSingleInstanceLock()
let vaultWatcher = null
let vaultRefreshTimer = null
let documentLibrary = null
let financeService = null
let calendarStore = null
let calendarScheduler = null
let calendarInboxTimer = null
let calendarTray = null
let calendarRunsInBackground = false
let isQuitting = false
let uefnSessionService = null
const activeCalendarNotifications = new Set()
const getFortnitePrimebot = createFortnitePrimebotFetcher()

if (process.platform === 'win32') app.setAppUserModelId('studio.noblesse.desktop')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'noblesse-doc',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
  {
    scheme: 'noblesse-vault',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

const requireUefnSessionService = () => {
  if (!uefnSessionService) throw new Error('La détection des sessions UEFN est indisponible.')
  return uefnSessionService
}

const getUefnHealth = () => requireUefnSessionService().getHealth()

const getAssets = async () => {
  return readVaultCatalog()
}

const requireStudioSender = (event) => {
  const owner = BrowserWindow.fromWebContents(event.sender)
  if (!owner || owner.isDestroyed()) throw new Error('Client Noblesse Studio non autorisé.')
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
  calendarTray = new Tray(path.join(currentDir, '..', 'assets', 'noblesse-vault.ico'))
  calendarTray.setToolTip('Noblesse Studio — rappels actifs')
  calendarTray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Ouvrir le calendrier', click: () => showCalendarSurface() },
    { type: 'separator' },
    { label: 'Quitter Noblesse Studio', click: () => { isQuitting = true; app.quit() } },
  ]))
  calendarTray.on('double-click', () => showCalendarSurface())
  return calendarTray
}

const updateCalendarRuntime = (settings = {}) => {
  calendarRunsInBackground = Boolean(settings.desktopNotificationsEnabled && settings.runInBackground)
  if (settings.desktopNotificationsEnabled) calendarScheduler?.start()
  else calendarScheduler?.stop()
  if (calendarRunsInBackground) ensureCalendarTray()
  else if (calendarTray) {
    calendarTray.destroy()
    calendarTray = null
  }
}

const showCalendarNotification = async (reminder) => {
  const snapshot = await requireCalendarStore().getSnapshot()
  if (!snapshot.settings.desktopNotificationsEnabled) throw new Error('Les notifications calendrier sont désactivées.')
  if (!Notification.isSupported()) throw new Error('Les notifications système ne sont pas prises en charge.')
  const notification = new Notification({
    title: reminder.title || 'Rappel Noblesse Studio',
    body: [reminder.projectLabel, reminder.location].filter(Boolean).join(' • ') || 'Un élément du calendrier commence bientôt.',
    icon: path.join(currentDir, '..', 'assets', 'noblesse-vault.ico'),
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

const handleVaultPreviewProtocol = async (request) => {
  try {
    const url = new URL(request.url)
    if (url.hostname !== 'preview') return new Response('Introuvable', { status: 404 })
    const relativePath = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (!relativePath || !/\.(?:png|jpe?g|webp)$/i.test(relativePath)) {
      return new Response('Aperçu invalide', { status: 404 })
    }
    const { filePath, mimeType } = await resolveVaultPreviewSource(relativePath)
    const fileResponse = await net.fetch(pathToFileURL(filePath).toString(), { headers: request.headers })
    const headers = new Headers(fileResponse.headers)
    headers.set('Content-Type', mimeType)
    headers.set('X-Content-Type-Options', 'nosniff')
    return new Response(fileResponse.body, { status: fileResponse.status, headers })
  } catch {
    return new Response('Aperçu indisponible', { status: 404 })
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
    icon: path.join(currentDir, '..', 'assets', 'noblesse-vault.ico'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(currentDir, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.once('ready-to-show', () => window.show())
  window.on('close', (event) => {
    if (!isQuitting && calendarRunsInBackground) {
      event.preventDefault()
      window.hide()
      ensureCalendarTray()
    }
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const allowed = url.startsWith('file://') || url.startsWith('http://127.0.0.1:4178')
    if (!allowed) event.preventDefault()
  })
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) window.loadURL(devUrl)
  else window.loadFile(path.join(currentDir, '..', 'dist', 'index.html'))
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

ipcMain.handle('noblesse:fortnite-primebot', (_event, options) => getFortnitePrimebot(options))
ipcMain.handle('noblesse:uefn-health', (event) => {
  requireStudioSender(event)
  return getUefnHealth()
})
ipcMain.handle('noblesse:assets', getAssets)
ipcMain.handle('noblesse:material-preview', (event, request) => {
  requireStudioSender(event)
  return loadMaterialPreviewDescriptor(request?.assetId)
})
ipcMain.handle('noblesse:vault-health', () => validateVaultIntegrity())
ipcMain.handle('noblesse:projects', async (event) => {
  requireStudioSender(event)
  const [uefnProjects, unrealProjects] = await Promise.all([
    requireUefnSessionService().listDestinations(),
    listUnrealProjects(),
  ])
  return [...uefnProjects, ...unrealProjects]
})
ipcMain.handle('noblesse:project-favorite', (event, request) => {
  requireStudioSender(event)
  return requireUefnSessionService().setFavorite(request)
})
ipcMain.handle('noblesse:install-asset', async (event, request) => {
  requireStudioSender(event)
  const asset = await loadVaultAsset(request?.assetId)
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
  const result = await requireDocumentLibrary().import(request)
  notifyDocumentsUpdated()
  return Array.isArray(result) ? result.map(withPreviewUrl) : result
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
  try {
    await protocol.handle('noblesse-vault', handleVaultPreviewProtocol)
  } catch (error) {
    console.error('[Noblesse Vault] Aperçus indisponibles', error)
  }
  try {
    await documentLibrary.ensure()
    await documentLibrary.bootstrap()
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

app.on('second-instance', () => {
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
