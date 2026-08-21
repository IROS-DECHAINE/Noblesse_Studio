const STORAGE_KEY = 'noblesse:calendar:web:v1'
const events = new EventTarget()
const nowIso = () => new Date().toISOString()
const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`

const emptyDocument = () => ({
  schemaVersion: 1,
  revision: 0,
  createdAt: nowIso(),
  updatedAt: nowIso(),
  items: [],
  settings: {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
    desktopNotificationsEnabled: false,
    runInBackground: false,
    emailEnabled: false,
  },
  deliveries: [],
  migrations: {},
})

const clone = (value) => JSON.parse(JSON.stringify(value))

const read = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (stored?.schemaVersion === 1 && Array.isArray(stored.items)) return stored
  } catch {
    // A corrupted browser fallback must not prevent the app from opening.
  }
  return emptyDocument()
}

const write = (document) => {
  const next = { ...document, revision: (document.revision || 0) + 1, updatedAt: nowIso() }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  events.dispatchEvent(new Event('updated'))
  return clone(next)
}

const updateDocument = (updater) => write(updater(read()))

const projectIdForLegacy = (value = '') => {
  const normalized = value.toLowerCase()
  if (normalized.includes('primebot')) return 'primebot-rush'
  if (normalized.includes('industry')) return 'prime-industry'
  if (normalized.includes('many') || normalized.includes('box')) return 'how-many-boxes-can-you-carry'
  return 'noblesse-studio'
}

const addDays = (dateKey, amount) => {
  const date = new Date(`${dateKey}T12:00:00`)
  date.setDate(date.getDate() + amount)
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const calendarWebRepository = {
  snapshot: async () => clone(read()),
  create: async (input) => updateDocument((document) => ({
    ...document,
    items: [...document.items, { ...clone(input), id: makeId(), createdAt: nowIso(), updatedAt: nowIso(), revision: 1, createdBy: 'human:web' }],
  })),
  update: async (id, patch) => updateDocument((document) => ({
    ...document,
    items: document.items.map((item) => item.id === id ? { ...item, ...clone(patch), id: item.id, revision: (item.revision || 0) + 1, updatedAt: nowIso() } : item),
  })),
  delete: async (id) => updateDocument((document) => ({ ...document, items: document.items.filter((item) => item.id !== id) })),
  importLegacy: async (legacyItems) => updateDocument((document) => {
    if (document.migrations?.planningV1) return document
    const existingLegacyIds = new Set(document.items.map((item) => item.legacySourceId).filter(Boolean))
    const imported = legacyItems
      .filter((item) => item?.id && item?.title && item?.date && !existingLegacyIds.has(item.id))
      .map((item) => ({
        id: makeId(),
        kind: 'task',
        title: String(item.title).slice(0, 160),
        projectId: projectIdForLegacy(item.project),
        projectLabel: item.project || 'NOBLESSE STUDIO',
        status: item.done ? 'completed' : 'open',
        priority: String(item.priority || 'Normale').toLowerCase(),
        notes: '',
        location: '',
        time: { kind: 'allDay', startDate: item.date, endDateExclusive: addDays(item.date, 1), timeZone: 'Europe/Paris' },
        recurrence: { frequency: 'none', interval: 1 },
        reminders: [],
        legacySourceId: item.id,
        createdAt: item.createdAt || nowIso(),
        updatedAt: nowIso(),
        revision: 1,
        createdBy: 'migration:planning-v1',
      }))
    return {
      ...document,
      items: [...document.items, ...imported],
      migrations: { ...document.migrations, planningV1: { importedAt: nowIso(), count: imported.length } },
    }
  }),
  updateSettings: async (patch) => updateDocument((document) => ({ ...document, settings: { ...document.settings, ...clone(patch) } })),
  testNotification: async () => {
    if (!('Notification' in window)) throw new Error('Les notifications système ne sont pas disponibles dans ce navigateur.')
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
    if (permission !== 'granted') throw new Error('Autorisation de notification refusée dans le navigateur.')
    new Notification('Noblesse Studio', { body: 'Les rappels du calendrier sont prêts.' })
    return { supported: true, shown: true }
  },
  onUpdated: (callback) => {
    const listener = () => callback()
    events.addEventListener('updated', listener)
    return () => events.removeEventListener('updated', listener)
  },
}
