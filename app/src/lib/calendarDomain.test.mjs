import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addCivilDays,
  civilDaySpan,
  collectDueReminderDeliveries,
  expandCalendarOccurrences,
  startOfCivilDayInstant,
  zonedPartsFromInstant,
} from '../../shared/calendarDomain.mjs'

const baseItem = (overrides = {}) => ({
  id: 'calendar-item-1',
  kind: 'event',
  title: 'Revue production',
  projectId: 'primebot-rush',
  projectLabel: 'PRIMEBOT RUSH',
  status: 'open',
  notes: '',
  location: '',
  time: {
    kind: 'timed',
    start: '2026-03-22T08:00:00.000Z',
    end: '2026-03-22T09:00:00.000Z',
    timeZone: 'Europe/Paris',
  },
  recurrence: { frequency: 'weekly', interval: 1 },
  reminders: [],
  createdAt: '2026-03-01T12:00:00.000Z',
  updatedAt: '2026-03-01T12:00:00.000Z',
  ...overrides,
})

test('la recurrence conserve 09:00 en Europe/Paris pendant le passage DST', () => {
  const occurrences = expandCalendarOccurrences(
    baseItem(),
    '2026-03-20T00:00:00.000Z',
    '2026-04-06T00:00:00.000Z',
  )
  assert.deepEqual(occurrences.map((entry) => entry.time.start), [
    '2026-03-22T08:00:00.000Z',
    '2026-03-29T07:00:00.000Z',
    '2026-04-05T07:00:00.000Z',
  ])
  assert.deepEqual(occurrences.map((entry) => zonedPartsFromInstant(entry.time.start, 'Europe/Paris').hour), [9, 9, 9])
})

test('un rendez-vous nocturne recurrent garde sa fin au jour civil suivant', () => {
  const item = baseItem({
    time: {
      kind: 'timed',
      start: '2026-08-21T21:30:00.000Z',
      end: '2026-08-21T23:30:00.000Z',
      timeZone: 'Europe/Paris',
    },
    recurrence: { frequency: 'daily', interval: 1, until: '2026-08-23' },
  })
  const occurrences = expandCalendarOccurrences(item, '2026-08-21T00:00:00.000Z', '2026-08-25T00:00:00.000Z')
  assert.equal(occurrences.length, 3)
  const secondStart = zonedPartsFromInstant(occurrences[1].time.start, 'Europe/Paris')
  const secondEnd = zonedPartsFromInstant(occurrences[1].time.end, 'Europe/Paris')
  assert.deepEqual([secondStart.day, secondStart.hour, secondStart.minute], [22, 23, 30])
  assert.deepEqual([secondEnd.day, secondEnd.hour, secondEnd.minute], [23, 1, 30])
})

test('les dates toute-journee restent civiles et non des durees fixes de 24 h', () => {
  assert.equal(addCivilDays('2026-03-29', 1), '2026-03-30')
  assert.equal(civilDaySpan('2026-03-28', '2026-03-30'), 2)
  const start = startOfCivilDayInstant('2026-03-29', 'Europe/Paris')
  const end = startOfCivilDayInstant('2026-03-30', 'Europe/Paris')
  assert.equal(end.getTime() - start.getTime(), 23 * 60 * 60 * 1000)

  const item = baseItem({
    time: { kind: 'allDay', startDate: '2026-03-28', endDateExclusive: '2026-03-30', timeZone: 'Europe/Paris' },
    recurrence: { frequency: 'weekly', interval: 1 },
  })
  const [first, second] = expandCalendarOccurrences(item, '2026-03-27T00:00:00.000Z', '2026-04-07T00:00:00.000Z')
  assert.deepEqual([first.time.startDate, first.time.endDateExclusive], ['2026-03-28', '2026-03-30'])
  assert.deepEqual([second.time.startDate, second.time.endDateExclusive], ['2026-04-04', '2026-04-06'])
})

test('les rappels recurrents ont une cle stable et respectent la fenetre due', () => {
  const item = baseItem({
    recurrence: { frequency: 'none', interval: 1 },
    reminders: [{ id: 'before-30', channel: 'desktop', offsetMinutes: 30 }],
  })
  const due = collectDueReminderDeliveries([item], {
    from: '2026-03-22T07:29:00.000Z',
    to: '2026-03-22T07:31:00.000Z',
  })
  assert.equal(due.length, 1)
  assert.equal(due[0].scheduledAt, '2026-03-22T07:30:00.000Z')
  assert.equal(collectDueReminderDeliveries([item], {
    from: '2026-03-22T07:29:00.000Z',
    to: '2026-03-22T07:31:00.000Z',
    deliveredIds: [due[0].deliveryId],
  }).length, 0)
})
