import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildGoogleCalendarEventResource, createGoogleCalendarSyncService } from './googleCalendarSyncService.mjs'

const temporaryRoot = async (t) => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'noblesse-google-calendar-'))
  t.after(async () => rm(rootDir, { recursive: true, force: true }))
  return rootDir
}

const encryptString = (value) => Buffer.from(`protected:${value}`, 'utf8')
const decryptString = (buffer) => buffer.toString('utf8').replace(/^protected:/, '')
const protectedValue = (value) => encryptString(value).toString('base64')

const calendarItem = (overrides = {}) => ({
  id: 'calendar-item-1',
  kind: 'event',
  title: 'Sortie PrimeBot',
  projectId: 'primebot-rush',
  projectLabel: 'PRIMEBOT RUSH',
  status: 'open',
  notes: 'Préparer la publication.',
  location: 'Studio',
  time: {
    kind: 'timed',
    start: '2026-08-31T16:00:00.000Z',
    end: '2026-08-31T17:00:00.000Z',
    timeZone: 'Europe/Paris',
  },
  recurrence: { frequency: 'weekly', interval: 1, until: '2026-09-30' },
  reminders: [
    { id: 'day', channel: 'desktop', offsetMinutes: 1440 },
    { id: 'hour', channel: 'desktop', offsetMinutes: 60 },
  ],
  createdAt: '2026-08-22T00:00:00.000Z',
  updatedAt: '2026-08-22T01:00:00.000Z',
  ...overrides,
})

test('projette un élément Noblesse vers un événement Google avec rappels mobiles', () => {
  const resource = buildGoogleCalendarEventResource(calendarItem())
  assert.match(resource.id, /^[a-v0-9]{5,1024}$/)
  assert.equal(resource.summary, 'Sortie PrimeBot')
  assert.deepEqual(resource.start, { dateTime: '2026-08-31T16:00:00.000Z', timeZone: 'Europe/Paris' })
  assert.deepEqual(resource.reminders.overrides, [
    { method: 'popup', minutes: 1440 },
    { method: 'popup', minutes: 60 },
  ])
  assert.match(resource.recurrence[0], /^RRULE:FREQ=WEEKLY;INTERVAL=1;UNTIL=\d{8}T\d{6}Z$/)
  assert.equal(resource.extendedProperties.private.noblesseStudioItemId, 'calendar-item-1')
})

test('les tâches terminées ne conservent pas de rappel Google', () => {
  const resource = buildGoogleCalendarEventResource(calendarItem({ status: 'completed' }))
  assert.match(resource.summary, /^✓ /)
  assert.deepEqual(resource.reminders.overrides, [])
})

test('configure le client OAuth sans exposer les identifiants dans le statut public', async (t) => {
  const rootDir = await temporaryRoot(t)
  const service = createGoogleCalendarSyncService({
    rootDir,
    encryptString,
    decryptString,
    fetchImpl: async () => { throw new Error('Réseau inattendu') },
    openExternal: async () => undefined,
  })
  await service.initialize()
  const status = await service.configureCredentials({ installed: { client_id: 'desktop.apps.googleusercontent.com', client_secret: 'client-secret', token_uri: 'https://oauth2.googleapis.com/token' } })
  assert.equal(status.available, true)
  assert.equal(status.configured, true)
  assert.equal(status.connected, false)
  assert.equal('clientId' in status, false)
  const stored = await readFile(service.paths.statePath, 'utf8')
  assert.doesNotMatch(stored, /client-secret/)
  assert.doesNotMatch(stored, /desktop\.apps/)
})

test('synchronise un élément et ne persiste jamais le refresh token en clair', async (t) => {
  const rootDir = await temporaryRoot(t)
  const statePath = path.join(rootDir, 'google-calendar.v1.json')
  await writeFile(statePath, JSON.stringify({
    schemaVersion: 1,
    encryptedCredentials: protectedValue(JSON.stringify({ clientId: 'client-id', clientSecret: 'client-secret' })),
    configuredAt: '2026-08-22T00:00:00.000Z',
    encryptedRefreshToken: protectedValue('refresh-secret'),
    connectedAt: '2026-08-22T00:01:00.000Z',
    accountEmail: 'studio@example.com',
    calendarId: 'primary',
    mappings: {},
    pendingItemIds: [],
    pendingDeleteIds: [],
    lastSyncAt: null,
    lastError: '',
  }, null, 2))

  const requests = []
  const service = createGoogleCalendarSyncService({
    rootDir,
    encryptString,
    decryptString,
    now: () => new Date('2026-08-22T02:00:00.000Z'),
    openExternal: async () => undefined,
    fetchImpl: async (url, init = {}) => {
      requests.push({ url: String(url), method: init.method || 'GET', body: init.body ? String(init.body) : '' })
      if (String(url).includes('/token')) return new Response(JSON.stringify({ access_token: 'access-secret', expires_in: 3600 }), { status: 200 })
      return new Response(JSON.stringify({ id: JSON.parse(init.body).id, etag: 'etag-1' }), { status: 200 })
    },
  })
  const result = await service.syncItem(calendarItem())
  assert.equal(result.status, 'SYNCED')
  assert.equal(requests[0].url, 'https://oauth2.googleapis.com/token')
  assert.equal(requests[1].method, 'POST')
  assert.match(requests[1].url, /calendar\/v3\/calendars\/primary\/events/)
  const stored = await readFile(service.paths.statePath, 'utf8')
  assert.doesNotMatch(stored, /refresh-secret/)
  assert.doesNotMatch(stored, /access-secret/)
  assert.equal((await service.status()).pendingCount, 0)
  assert.equal((await service.status()).lastError, '')
})

test('conserve une synchronisation en attente lorsque Google est hors ligne', async (t) => {
  const rootDir = await temporaryRoot(t)
  await writeFile(path.join(rootDir, 'google-calendar.v1.json'), JSON.stringify({
    schemaVersion: 1,
    encryptedCredentials: protectedValue(JSON.stringify({ clientId: 'client-id', clientSecret: 'client-secret' })),
    configuredAt: '2026-08-22T00:00:00.000Z',
    encryptedRefreshToken: protectedValue('refresh-secret'),
    connectedAt: '2026-08-22T00:01:00.000Z',
    accountEmail: 'studio@example.com',
    calendarId: 'primary',
    mappings: {},
    pendingItemIds: [],
    pendingDeleteIds: [],
    lastSyncAt: null,
    lastError: '',
  }, null, 2))
  const service = createGoogleCalendarSyncService({
    rootDir,
    encryptString,
    decryptString,
    openExternal: async () => undefined,
    fetchImpl: async () => { throw new Error('Réseau indisponible') },
  })
  const result = await service.syncItem(calendarItem())
  assert.equal(result.status, 'PENDING')
  assert.equal(result.publicStatus.pendingCount, 1)
  assert.match(result.error, /Réseau indisponible/)
})

test('supprime la copie Google et nettoie son association locale', async (t) => {
  const rootDir = await temporaryRoot(t)
  const statePath = path.join(rootDir, 'google-calendar.v1.json')
  await writeFile(statePath, JSON.stringify({
    schemaVersion: 1,
    encryptedCredentials: protectedValue(JSON.stringify({ clientId: 'client-id', clientSecret: 'client-secret' })),
    configuredAt: '2026-08-22T00:00:00.000Z',
    encryptedRefreshToken: protectedValue('refresh-secret'),
    connectedAt: '2026-08-22T00:01:00.000Z',
    accountEmail: 'studio@example.com',
    calendarId: 'primary',
    mappings: {
      'calendar-item-1': {
        googleEventId: 'google-event-1',
        etag: 'etag-1',
        syncedAt: '2026-08-22T01:00:00.000Z',
        sourceUpdatedAt: '2026-08-22T01:00:00.000Z',
      },
    },
    pendingItemIds: ['calendar-item-1'],
    pendingDeleteIds: [],
    lastSyncAt: '2026-08-22T01:00:00.000Z',
    lastError: '',
  }, null, 2))

  const requests = []
  const service = createGoogleCalendarSyncService({
    rootDir,
    encryptString,
    decryptString,
    now: () => new Date('2026-08-22T03:00:00.000Z'),
    openExternal: async () => undefined,
    fetchImpl: async (url, init = {}) => {
      requests.push({ url: String(url), method: init.method || 'GET' })
      if (String(url).includes('/token')) return new Response(JSON.stringify({ access_token: 'access-secret', expires_in: 3600 }), { status: 200 })
      return new Response(null, { status: 204 })
    },
  })

  const result = await service.deleteItem('calendar-item-1')
  assert.equal(result.status, 'DELETED')
  assert.equal(requests[1].method, 'DELETE')
  assert.match(requests[1].url, /calendars\/primary\/events\/google-event-1\?sendUpdates=none$/)
  const stored = JSON.parse(await readFile(statePath, 'utf8'))
  assert.deepEqual(stored.mappings, {})
  assert.deepEqual(stored.pendingItemIds, [])
  assert.deepEqual(stored.pendingDeleteIds, [])
  assert.equal(result.publicStatus.pendingCount, 0)
})

test('garde une suppression Google en attente puis la rejoue sans erreur', async (t) => {
  const rootDir = await temporaryRoot(t)
  await writeFile(path.join(rootDir, 'google-calendar.v1.json'), JSON.stringify({
    schemaVersion: 1,
    encryptedCredentials: protectedValue(JSON.stringify({ clientId: 'client-id', clientSecret: 'client-secret' })),
    configuredAt: '2026-08-22T00:00:00.000Z',
    encryptedRefreshToken: protectedValue('refresh-secret'),
    connectedAt: '2026-08-22T00:01:00.000Z',
    accountEmail: 'studio@example.com',
    calendarId: 'primary',
    mappings: {
      'calendar-item-1': {
        googleEventId: 'google-event-1',
        etag: 'etag-1',
        syncedAt: '2026-08-22T01:00:00.000Z',
        sourceUpdatedAt: '2026-08-22T01:00:00.000Z',
      },
    },
    pendingItemIds: [],
    pendingDeleteIds: [],
    lastSyncAt: '2026-08-22T01:00:00.000Z',
    lastError: '',
  }, null, 2))

  let offline = true
  const service = createGoogleCalendarSyncService({
    rootDir,
    encryptString,
    decryptString,
    openExternal: async () => undefined,
    fetchImpl: async (url) => {
      if (offline) throw new Error('Réseau indisponible')
      if (String(url).includes('/token')) return new Response(JSON.stringify({ access_token: 'access-secret', expires_in: 3600 }), { status: 200 })
      return new Response(null, { status: 404 })
    },
  })

  const pending = await service.deleteItem('calendar-item-1')
  assert.equal(pending.status, 'PENDING_DELETE')
  assert.equal(pending.publicStatus.pendingCount, 1)

  offline = false
  const retried = await service.syncAll([])
  assert.equal(retried.status, 'SYNCED')
  assert.equal(retried.results[0].status, 'DELETED')
  assert.equal(retried.publicStatus.pendingCount, 0)
})
