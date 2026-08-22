import { createHash, randomBytes } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { addCivilDays, instantFromZonedParts, parseCivilDate } from '../../shared/calendarDomain.mjs'

const STATE_FILE_NAME = 'google-calendar.v1.json'
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const GOOGLE_SCOPES = Object.freeze([
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
])
const MAX_CREDENTIAL_FILE_BYTES = 64 * 1024
const MAX_SYNC_ITEMS = 500

const clone = (value) => JSON.parse(JSON.stringify(value))
const nowIso = (now) => new Date(now()).toISOString()
const cleanError = (error) => String(error instanceof Error ? error.message : error || 'Erreur inconnue').replace(/\s+/g, ' ').slice(0, 360)

const emptyState = () => ({
  schemaVersion: 1,
  encryptedCredentials: '',
  configuredAt: null,
  encryptedRefreshToken: '',
  connectedAt: null,
  accountEmail: '',
  calendarId: 'primary',
  mappings: {},
  pendingItemIds: [],
  pendingDeleteIds: [],
  lastSyncAt: null,
  lastError: '',
})

const normalizeStringList = (value, max = MAX_SYNC_ITEMS) => [...new Set((Array.isArray(value) ? value : [])
  .filter((entry) => typeof entry === 'string' && entry.length > 0 && entry.length <= 200)
  .slice(0, max))]

const normalizeState = (value) => {
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1) throw new Error('État Google Calendar incompatible.')
  const mappings = {}
  for (const [itemId, mapping] of Object.entries(value.mappings || {}).slice(0, MAX_SYNC_ITEMS)) {
    if (typeof itemId !== 'string' || !itemId || itemId.length > 200 || !mapping || typeof mapping !== 'object') continue
    if (typeof mapping.googleEventId !== 'string' || !mapping.googleEventId || mapping.googleEventId.length > 1024) continue
    mappings[itemId] = {
      googleEventId: mapping.googleEventId,
      etag: typeof mapping.etag === 'string' ? mapping.etag.slice(0, 500) : '',
      syncedAt: typeof mapping.syncedAt === 'string' ? mapping.syncedAt : null,
      sourceUpdatedAt: typeof mapping.sourceUpdatedAt === 'string' ? mapping.sourceUpdatedAt : null,
    }
  }
  return {
    ...emptyState(),
    encryptedCredentials: typeof value.encryptedCredentials === 'string' ? value.encryptedCredentials : '',
    configuredAt: typeof value.configuredAt === 'string' ? value.configuredAt : null,
    encryptedRefreshToken: typeof value.encryptedRefreshToken === 'string' ? value.encryptedRefreshToken : '',
    connectedAt: typeof value.connectedAt === 'string' ? value.connectedAt : null,
    accountEmail: typeof value.accountEmail === 'string' ? value.accountEmail.slice(0, 320) : '',
    calendarId: 'primary',
    mappings,
    pendingItemIds: normalizeStringList(value.pendingItemIds),
    pendingDeleteIds: normalizeStringList(value.pendingDeleteIds),
    lastSyncAt: typeof value.lastSyncAt === 'string' ? value.lastSyncAt : null,
    lastError: typeof value.lastError === 'string' ? value.lastError.slice(0, 360) : '',
  }
}

const base64Url = (value) => Buffer.from(value).toString('base64url')
const googleEventIdForItem = (itemId) => `n${createHash('sha256').update(`noblesse-studio:${itemId}`).digest('hex').slice(0, 48)}`
const basicUtc = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')

const recurrenceRuleFor = (item) => {
  const frequency = item?.recurrence?.frequency || 'none'
  if (frequency === 'none') return undefined
  const googleFrequency = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }[frequency]
  if (!googleFrequency) return undefined
  const interval = Math.max(1, Math.min(365, Number(item.recurrence?.interval) || 1))
  let rule = `RRULE:FREQ=${googleFrequency};INTERVAL=${interval}`
  if (item.recurrence?.until) {
    if (item.time?.kind === 'allDay') {
      rule += `;UNTIL=${item.recurrence.until.replaceAll('-', '')}`
    } else {
      const parts = parseCivilDate(item.recurrence.until)
      const endOfUntil = instantFromZonedParts({ ...parts, hour: 23, minute: 59, second: 59 }, item.time?.timeZone || 'Europe/Paris')
      rule += `;UNTIL=${basicUtc(endOfUntil)}`
    }
  }
  return [rule]
}

export const buildGoogleCalendarEventResource = (item) => {
  if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || typeof item.title !== 'string' || !item.title.trim()) {
    throw new Error('Élément calendrier invalide pour Google Calendar.')
  }
  const timeZone = item.time?.timeZone || 'Europe/Paris'
  const start = item.time?.kind === 'allDay'
    ? { date: item.time.startDate }
    : { dateTime: new Date(item.time?.start).toISOString(), timeZone }
  const end = item.time?.kind === 'allDay'
    ? { date: item.time.endDateExclusive || addCivilDays(item.time.startDate, 1) }
    : { dateTime: new Date(item.time?.end).toISOString(), timeZone }
  if ((!start.date && !Number.isFinite(new Date(start.dateTime).getTime())) || (!end.date && !Number.isFinite(new Date(end.dateTime).getTime()))) {
    throw new Error('Horaire calendrier invalide pour Google Calendar.')
  }
  const reminders = ['completed', 'cancelled'].includes(item.status)
    ? []
    : (item.reminders || []).slice(0, 5).flatMap((reminder) => {
        const minutes = Number(reminder.offsetMinutes)
        return Number.isSafeInteger(minutes) && minutes >= 0 && minutes <= 40_320 ? [{ method: 'popup', minutes }] : []
      })
  const recurrence = recurrenceRuleFor(item)
  return {
    id: googleEventIdForItem(item.id),
    summary: `${item.status === 'completed' ? '✓ ' : ''}${item.title.trim()}`.slice(0, 1024),
    description: String(item.notes || '').slice(0, 8192),
    location: String(item.location || '').slice(0, 1024),
    start,
    end,
    ...(recurrence ? { recurrence } : {}),
    reminders: { useDefault: false, overrides: reminders },
    extendedProperties: {
      private: {
        noblesseStudioItemId: item.id.slice(0, 200),
        noblesseStudioUpdatedAt: String(item.updatedAt || item.createdAt || '').slice(0, 200),
      },
    },
  }
}

const credentialsFromDocument = (document) => {
  const source = document?.installed
  if (!source || typeof source !== 'object') throw new Error('Le fichier choisi n’est pas un client OAuth Google de type « Application de bureau ».')
  const clientId = String(source.client_id || '').trim()
  const clientSecret = String(source.client_secret || '').trim()
  if (!clientId || clientId.length > 600 || clientSecret.length > 600) throw new Error('Identifiants OAuth Google invalides.')
  if (source.token_uri && source.token_uri !== GOOGLE_TOKEN_URL) throw new Error('Le fournisseur OAuth de ce fichier n’est pas Google.')
  return { clientId, clientSecret }
}

const parseJsonResponse = async (response, label) => {
  const text = await response.text()
  let payload = {}
  try { payload = text ? JSON.parse(text) : {} } catch { throw new Error(`${label} a renvoyé une réponse illisible.`) }
  if (!response.ok) {
    const detail = payload?.error_description || payload?.error?.message || payload?.error || `HTTP ${response.status}`
    throw new Error(`${label} : ${String(detail).slice(0, 240)}`)
  }
  return payload
}

const listen = (server) => new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    server.removeListener('error', reject)
    resolve(server.address())
  })
})

const closeServer = (server) => new Promise((resolve) => server.close(() => resolve()))

const createOAuthCallback = async ({ expectedState, timeoutMs = 180_000 }) => {
  let settle
  let fail
  const result = new Promise((resolve, reject) => { settle = resolve; fail = reject })
  const server = createServer((request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1')
      if (url.pathname !== '/oauth2/callback') {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end('Introuvable')
        return
      }
      const state = url.searchParams.get('state') || ''
      const code = url.searchParams.get('code') || ''
      const oauthError = url.searchParams.get('error') || ''
      if (state !== expectedState) throw new Error('La réponse Google ne correspond pas à cette demande de connexion.')
      if (oauthError) throw new Error(oauthError === 'access_denied' ? 'Connexion Google annulée.' : `Connexion Google refusée (${oauthError}).`)
      if (!code) throw new Error('Google n’a pas renvoyé de code d’autorisation.')
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      response.end('<!doctype html><meta charset="utf-8"><title>Noblesse Studio</title><body style="font-family:Segoe UI,sans-serif;background:#07131f;color:#eef4f8;padding:48px"><h1>Google Calendar est connecté</h1><p>Tu peux fermer cette page et revenir dans Noblesse Studio.</p></body>')
      settle({ code })
    } catch (error) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
      response.end('Connexion Google impossible. Retourne dans Noblesse Studio.')
      fail(error)
    }
  })
  const address = await listen(server)
  const timeout = setTimeout(() => fail(new Error('La connexion Google a expiré.')), timeoutMs)
  timeout.unref?.()
  return {
    redirectUri: `http://127.0.0.1:${address.port}/oauth2/callback`,
    result,
    close: async () => { clearTimeout(timeout); await closeServer(server).catch(() => undefined) },
  }
}

export const createGoogleCalendarSyncService = ({
  rootDir,
  encryptString,
  decryptString,
  encryptionAvailable = true,
  fetchImpl = globalThis.fetch,
  openExternal,
  now = () => new Date(),
} = {}) => {
  if (typeof rootDir !== 'string' || !rootDir.trim()) throw new TypeError('rootDir Google Calendar requis.')
  if (typeof encryptString !== 'function' || typeof decryptString !== 'function') throw new TypeError('Chiffrement Google Calendar requis.')
  if (typeof fetchImpl !== 'function' || typeof openExternal !== 'function') throw new TypeError('Dépendances réseau Google Calendar invalides.')

  const directory = path.resolve(rootDir)
  const statePath = path.join(directory, STATE_FILE_NAME)
  const backupPath = `${statePath}.backup`
  let state = emptyState()
  let initialized = false
  let writer = Promise.resolve()
  let accessToken = null

  const protect = (value) => Buffer.from(encryptString(String(value))).toString('base64')
  const reveal = (value) => decryptString(Buffer.from(value, 'base64'))
  const enqueueWrite = (operation) => {
    const result = writer.then(operation, operation)
    writer = result.catch(() => undefined)
    return result
  }

  const persist = () => enqueueWrite(async () => {
    await mkdir(directory, { recursive: true })
    const temporaryPath = path.join(directory, `.${STATE_FILE_NAME}.${process.pid}.${Date.now()}.tmp`)
    const normalized = normalizeState(state)
    try {
      await writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
      await copyFile(statePath, backupPath).catch((error) => { if (error?.code !== 'ENOENT') throw error })
      await rename(temporaryPath, statePath)
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  })

  const initialize = async () => {
    if (initialized) return publicStatus()
    await mkdir(directory, { recursive: true })
    try {
      state = normalizeState(JSON.parse(await readFile(statePath, 'utf8')))
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        try { state = normalizeState(JSON.parse(await readFile(backupPath, 'utf8'))) } catch { throw error }
      } else {
        state = emptyState()
        await persist()
      }
    }
    initialized = true
    return publicStatus()
  }

  const requireInitialized = async () => { if (!initialized) await initialize() }
  const publicStatus = () => Object.freeze({
    schemaVersion: 1,
    available: Boolean(encryptionAvailable),
    configured: Boolean(state.encryptedCredentials),
    connected: Boolean(encryptionAvailable && state.encryptedCredentials && state.encryptedRefreshToken),
    accountEmail: state.accountEmail || '',
    calendarName: 'Agenda principal',
    direction: 'NOBLESSE_TO_GOOGLE',
    lastSyncAt: state.lastSyncAt,
    lastError: state.lastError || '',
    pendingCount: new Set([...state.pendingItemIds, ...state.pendingDeleteIds]).size,
  })

  const credentials = () => {
    if (!encryptionAvailable) throw new Error('Le chiffrement système Windows est indisponible.')
    if (!state.encryptedCredentials) throw new Error('Configure d’abord le client OAuth Google Calendar.')
    return JSON.parse(reveal(state.encryptedCredentials))
  }

  const configureCredentials = async (document) => {
    await requireInitialized()
    if (!encryptionAvailable) throw new Error('Le chiffrement système Windows est indisponible.')
    const nextCredentials = credentialsFromDocument(document)
    state.encryptedCredentials = protect(JSON.stringify(nextCredentials))
    state.configuredAt = nowIso(now)
    state.encryptedRefreshToken = ''
    state.connectedAt = null
    state.accountEmail = ''
    state.mappings = {}
    state.pendingItemIds = []
    state.pendingDeleteIds = []
    state.lastSyncAt = null
    state.lastError = ''
    accessToken = null
    await persist()
    return publicStatus()
  }

  const configureCredentialsFile = async (filePath) => {
    const info = await stat(filePath)
    if (!info.isFile() || info.size < 2 || info.size > MAX_CREDENTIAL_FILE_BYTES) throw new Error('Fichier OAuth Google invalide ou trop volumineux.')
    let document
    try { document = JSON.parse(await readFile(filePath, 'utf8')) } catch { throw new Error('Le fichier OAuth Google n’est pas un JSON valide.') }
    return configureCredentials(document)
  }

  const connect = async () => {
    await requireInitialized()
    const { clientId, clientSecret } = credentials()
    const verifier = base64Url(randomBytes(48))
    const challenge = base64Url(createHash('sha256').update(verifier).digest())
    const oauthState = base64Url(randomBytes(32))
    const callback = await createOAuthCallback({ expectedState: oauthState })
    try {
      const authorization = new URL(GOOGLE_AUTH_URL)
      authorization.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: callback.redirectUri,
        response_type: 'code',
        scope: GOOGLE_SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        state: oauthState,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }).toString()
      await openExternal(authorization.toString())
      const { code } = await callback.result
      const body = new URLSearchParams({
        code,
        client_id: clientId,
        redirect_uri: callback.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      })
      if (clientSecret) body.set('client_secret', clientSecret)
      const tokenResponse = await fetchImpl(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(15_000),
      })
      const tokens = await parseJsonResponse(tokenResponse, 'Google OAuth')
      if (!tokens.access_token || !tokens.refresh_token) throw new Error('Google n’a pas fourni de jeton de connexion durable.')
      accessToken = { value: tokens.access_token, expiresAt: Date.now() + (Math.max(60, Number(tokens.expires_in) || 3600) * 1000) }
      let email = ''
      try {
        const userResponse = await fetchImpl(GOOGLE_USERINFO_URL, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
          signal: AbortSignal.timeout(10_000),
        })
        email = String((await parseJsonResponse(userResponse, 'Profil Google')).email || '').slice(0, 320)
      } catch {
        // La synchronisation Calendar reste valide même si le libellé du compte est indisponible.
      }
      state.encryptedRefreshToken = protect(tokens.refresh_token)
      state.connectedAt = nowIso(now)
      state.accountEmail = email
      state.lastError = ''
      await persist()
      return publicStatus()
    } catch (error) {
      state.lastError = cleanError(error)
      await persist().catch(() => undefined)
      throw error
    } finally {
      await callback.close()
    }
  }

  const disconnect = async () => {
    await requireInitialized()
    state.encryptedRefreshToken = ''
    state.connectedAt = null
    state.accountEmail = ''
    state.mappings = {}
    state.pendingItemIds = []
    state.pendingDeleteIds = []
    state.lastError = ''
    accessToken = null
    await persist()
    return publicStatus()
  }

  const ensureAccessToken = async () => {
    if (accessToken && accessToken.expiresAt > Date.now() + 60_000) return accessToken.value
    const { clientId, clientSecret } = credentials()
    if (!state.encryptedRefreshToken) throw new Error('Le compte Google Calendar n’est pas connecté.')
    const body = new URLSearchParams({
      client_id: clientId,
      refresh_token: reveal(state.encryptedRefreshToken),
      grant_type: 'refresh_token',
    })
    if (clientSecret) body.set('client_secret', clientSecret)
    const response = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15_000),
    })
    const tokens = await parseJsonResponse(response, 'Renouvellement Google OAuth')
    if (!tokens.access_token) throw new Error('Google n’a pas renouvelé la connexion Calendar.')
    accessToken = { value: tokens.access_token, expiresAt: Date.now() + (Math.max(60, Number(tokens.expires_in) || 3600) * 1000) }
    return accessToken.value
  }

  const calendarFetch = async (url, init = {}, retry = true) => {
    const token = await ensureAccessToken()
    const response = await fetchImpl(url, {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (response.status === 401 && retry) {
      accessToken = null
      return calendarFetch(url, init, false)
    }
    return response
  }

  const addPending = async (field, itemId) => {
    state[field] = normalizeStringList([...state[field], itemId])
    await persist()
  }

  const syncItem = async (item) => {
    await requireInitialized()
    if (!publicStatus().connected) return { status: 'NOT_CONNECTED', publicStatus: publicStatus() }
    try {
      await addPending('pendingItemIds', item.id)
      const resource = buildGoogleCalendarEventResource(item)
      const calendarId = encodeURIComponent(state.calendarId)
      const eventId = state.mappings[item.id]?.googleEventId || resource.id
      const updateUrl = `${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events/${encodeURIComponent(eventId)}?sendUpdates=none`
      let response
      if (state.mappings[item.id]) {
        response = await calendarFetch(updateUrl, { method: 'PUT', body: JSON.stringify({ ...resource, id: eventId }) })
      } else {
        const insertUrl = `${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events?sendUpdates=none`
        response = await calendarFetch(insertUrl, { method: 'POST', body: JSON.stringify(resource) })
        if (response.status === 409) response = await calendarFetch(updateUrl, { method: 'PUT', body: JSON.stringify({ ...resource, id: eventId }) })
      }
      if (!response.ok) await parseJsonResponse(response, 'Synchronisation Google Calendar')
      const googleEvent = await response.json()
      const syncedAt = nowIso(now)
      state.mappings[item.id] = {
        googleEventId: String(googleEvent.id || eventId),
        etag: String(googleEvent.etag || ''),
        syncedAt,
        sourceUpdatedAt: item.updatedAt || item.createdAt || null,
      }
      state.pendingItemIds = state.pendingItemIds.filter((id) => id !== item.id)
      state.lastSyncAt = syncedAt
      state.lastError = ''
      await persist()
      return { status: 'SYNCED', itemId: item.id, syncedAt, publicStatus: publicStatus() }
    } catch (error) {
      state.lastError = cleanError(error)
      await persist().catch(() => undefined)
      return { status: 'PENDING', itemId: item.id, error: state.lastError, publicStatus: publicStatus() }
    }
  }

  const deleteItem = async (itemId) => {
    await requireInitialized()
    if (!publicStatus().connected) return { status: 'NOT_CONNECTED', publicStatus: publicStatus() }
    try {
      await addPending('pendingDeleteIds', itemId)
      const eventId = state.mappings[itemId]?.googleEventId || googleEventIdForItem(itemId)
      const url = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(state.calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`
      const response = await calendarFetch(url, { method: 'DELETE' })
      if (!response.ok && response.status !== 404 && response.status !== 410) await parseJsonResponse(response, 'Suppression Google Calendar')
      delete state.mappings[itemId]
      state.pendingDeleteIds = state.pendingDeleteIds.filter((id) => id !== itemId)
      state.pendingItemIds = state.pendingItemIds.filter((id) => id !== itemId)
      state.lastSyncAt = nowIso(now)
      state.lastError = ''
      await persist()
      return { status: 'DELETED', itemId, publicStatus: publicStatus() }
    } catch (error) {
      state.lastError = cleanError(error)
      await persist().catch(() => undefined)
      return { status: 'PENDING_DELETE', itemId, error: state.lastError, publicStatus: publicStatus() }
    }
  }

  const syncAll = async (items = []) => {
    await requireInitialized()
    if (!publicStatus().connected) return { status: 'NOT_CONNECTED', results: [], publicStatus: publicStatus() }
    const boundedItems = (Array.isArray(items) ? items : []).slice(0, MAX_SYNC_ITEMS)
    const results = []
    for (const itemId of [...state.pendingDeleteIds]) results.push(await deleteItem(itemId))
    for (const item of boundedItems) results.push(await syncItem(item))
    const successful = new Set(['SYNCED', 'DELETED'])
    return { status: results.every((result) => successful.has(result.status)) ? 'SYNCED' : 'PARTIAL', results, publicStatus: publicStatus() }
  }

  return Object.freeze({
    initialize,
    status: async () => { await requireInitialized(); return publicStatus() },
    configureCredentials,
    configureCredentialsFile,
    connect,
    disconnect,
    syncItem,
    deleteItem,
    syncAll,
    paths: Object.freeze({ directory, statePath, backupPath }),
  })
}
