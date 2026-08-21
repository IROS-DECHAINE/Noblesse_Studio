import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createCalendarStore, enqueueCalendarInboxOperation } from '../../electron/lib/calendarStore.mjs'
import { createCalendarReminderScheduler } from '../../electron/lib/calendarReminderScheduler.mjs'
import { runCalendarCli } from '../../scripts/calendar-cli.mjs'

const temporaryRoot = async (t) => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'noblesse-calendar-'))
  t.after(async () => rm(rootDir, { recursive: true, force: true }))
  return rootDir
}

const ids = () => {
  let index = 0
  return () => `calendar-test-${++index}`
}

const input = (overrides = {}) => ({
  kind: 'event',
  title: 'Point calendrier',
  projectId: 'noblesse-studio',
  projectLabel: 'NOBLESSE STUDIO',
  status: 'open',
  notes: '',
  location: '',
  time: {
    kind: 'timed',
    start: '2026-08-21T12:00:00.000Z',
    end: '2026-08-21T13:00:00.000Z',
    timeZone: 'Europe/Paris',
  },
  recurrence: { frequency: 'none', interval: 1 },
  reminders: [{ id: 'before-30', channel: 'desktop', offsetMinutes: 30 }],
  ...overrides,
})

test('persiste atomiquement, recharge et rend les rappels idempotents', async (t) => {
  const rootDir = await temporaryRoot(t)
  let clock = new Date('2026-08-21T10:00:00.000Z')
  const store = createCalendarStore({ rootDir, now: () => clock, randomUUID: ids() })
  const initialized = await store.init()
  assert.equal(initialized.snapshot.revision, 0)

  const created = await store.createItem(input())
  assert.equal(created.snapshot.revision, 1)
  assert.equal(created.snapshot.items.length, 1)

  clock = new Date('2026-08-21T11:31:00.000Z')
  const due = await store.collectDueReminders({ from: '2026-08-21T11:29:00.000Z', to: clock })
  assert.equal(due.length, 1)
  assert.equal((await store.markDelivery(due[0])).status, 'DELIVERED')
  assert.equal((await store.markDelivery(due[0])).status, 'ALREADY_DELIVERED')
  assert.equal((await store.collectDueReminders({ from: '2026-08-21T11:29:00.000Z', to: clock })).length, 0)

  const reloaded = createCalendarStore({ rootDir, now: () => clock, randomUUID: ids() })
  const snapshot = await reloaded.getSnapshot()
  assert.equal(snapshot.items[0].title, 'Point calendrier')
  assert.equal(snapshot.deliveries.length, 1)
  assert.equal((await readdir(rootDir)).some((name) => name.endsWith('.tmp')), false)
})

test('migre planning v1 une seule fois', async (t) => {
  const rootDir = await temporaryRoot(t)
  const store = createCalendarStore({
    rootDir,
    now: () => new Date('2026-08-21T12:00:00.000Z'),
    randomUUID: ids(),
  })
  await store.init()
  const legacy = [{ id: 'old-1', title: 'Ancienne tache', date: '2026-08-25', project: 'PrimeBot Rush', done: true }]
  const first = await store.importLegacy(legacy)
  const second = await store.importLegacy(legacy)
  assert.equal(first.status, 'IMPORTED')
  assert.equal(first.importedCount, 1)
  assert.equal(second.status, 'ALREADY_IMPORTED')
  assert.equal(second.snapshot.revision, first.snapshot.revision)
  assert.equal(second.snapshot.items.length, 1)
  assert.equal(second.snapshot.items[0].status, 'completed')
  assert.equal(second.snapshot.items[0].time.endDateExclusive, '2026-08-26')
})

test('draine les mutations inbox et ignore leur rejeu', async (t) => {
  const rootDir = await temporaryRoot(t)
  const clock = () => new Date('2026-08-21T12:00:00.000Z')
  const store = createCalendarStore({ rootDir, now: clock, randomUUID: ids() })
  await store.init()

  await enqueueCalendarInboxOperation({
    rootDir,
    type: 'create',
    operationId: 'operation-1',
    now: clock,
    payload: { input: { ...input(), id: 'from-inbox' } },
  })
  const first = await store.drainInbox()
  assert.equal(first.failed.length, 0)
  assert.equal(first.processed.length, 1)
  assert.equal(first.snapshot.items[0].id, 'from-inbox')

  await enqueueCalendarInboxOperation({
    rootDir,
    type: 'create',
    operationId: 'operation-1',
    now: clock,
    payload: { input: { ...input(), id: 'would-duplicate' } },
  })
  const replay = await store.drainInbox()
  assert.deepEqual(replay.skipped, ['operation-1'])
  assert.equal(replay.snapshot.items.length, 1)
  assert.deepEqual(await readdir(store.paths.inboxDirectory), [])
})

test('serialise les mutations concurrentes sans perte', async (t) => {
  const rootDir = await temporaryRoot(t)
  const store = createCalendarStore({ rootDir, now: () => new Date('2026-08-21T12:00:00.000Z'), randomUUID: ids() })
  await store.init()
  await Promise.all([
    store.createItem(input({ title: 'A', reminders: [] })),
    store.createItem(input({ title: 'B', reminders: [] })),
  ])
  const snapshot = await store.getSnapshot()
  assert.equal(snapshot.revision, 2)
  assert.deepEqual(snapshot.items.map((item) => item.title).sort(), ['A', 'B'])
})

test('le CLI conserve un operation-id fourni par une automatisation', async (t) => {
  const rootDir = await temporaryRoot(t)
  let output = ''
  const code = await runCalendarCli([
    '--root', rootDir,
    '--operation-id', 'ai-job-20260821-001',
    'create',
    '--json', JSON.stringify(input({ reminders: [] })),
  ], {
    stdout: { write: (chunk) => { output += chunk } },
    stderr: { write: () => undefined },
    now: () => new Date('2026-08-21T12:00:00.000Z'),
    createId: ids(),
  })
  assert.equal(code, 0)
  assert.equal(JSON.parse(output).operationId, 'ai-job-20260821-001')
  const store = createCalendarStore({ rootDir, now: () => new Date('2026-08-21T12:00:00.000Z'), randomUUID: ids() })
  assert.equal((await store.drainInbox()).processed[0].operationId, 'ai-job-20260821-001')
})

test('le scheduler pur notifie puis laisse le store bloquer un doublon', async (t) => {
  const rootDir = await temporaryRoot(t)
  const store = createCalendarStore({ rootDir, now: () => new Date('2026-08-21T11:31:00.000Z'), randomUUID: ids() })
  await store.createItem(input())
  const notifications = []
  const scheduler = createCalendarReminderScheduler({
    store,
    notify: async (reminder) => { notifications.push(reminder.deliveryId) },
    now: () => new Date('2026-08-21T11:31:00.000Z'),
    initialLookbackMs: 2 * 60_000,
  })
  assert.equal((await scheduler.tick()).delivered.length, 1)
  assert.equal((await scheduler.tick()).delivered.length, 0)
  assert.equal(notifications.length, 1)
})
