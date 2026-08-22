import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addDaysKey,
  addMonthsKey,
  createDefaultForm,
  dateFromZonedWallTime,
  expandItemsForRange,
  formatOccurrencePeriod,
  formFromItem,
  itemInputFromForm,
  layoutAllDayBars,
  monthGridDateKeys,
  reminderScheduleForOccurrence,
  startOfWeekKey,
  timedLayoutForDay,
  validateForm,
  weekDateKeys,
} from '../components/calendar/calendarModel.js'

test('la semaine commence le lundi et traverse les mois', () => {
  assert.equal(startOfWeekKey('2026-08-21'), '2026-08-17')
  assert.deepEqual(weekDateKeys('2026-08-31'), [
    '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06',
  ])
  assert.equal(addDaysKey('2028-02-28', 1), '2028-02-29')
})

test('la vue mensuelle expose toujours six semaines complètes du lundi au dimanche', () => {
  const august = monthGridDateKeys('2026-08-21')
  assert.equal(august.length, 42)
  assert.equal(august[0], '2026-07-27')
  assert.equal(august[41], '2026-09-06')

  const february = monthGridDateKeys('2028-02-14')
  assert.equal(february[0], '2028-01-31')
  assert.equal(february[41], '2028-03-12')
})

test('la navigation mensuelle borne correctement les fins de mois', () => {
  assert.equal(addMonthsKey('2026-01-31', 1), '2026-02-28')
  assert.equal(addMonthsKey('2028-01-31', 1), '2028-02-29')
  assert.equal(addMonthsKey('2026-12-15', 1), '2027-01-15')
})

test('une période toute la journée utilise une fin exclusive', () => {
  const form = { ...createDefaultForm('2026-08-21'), allDay: true, endDate: '2026-08-23', title: 'Sprint studio' }
  const input = itemInputFromForm(form)
  assert.deepEqual(input.time, {
    kind: 'allDay', startDate: '2026-08-21', endDateExclusive: '2026-08-24', timeZone: 'Europe/Paris',
  })
  const occurrences = expandItemsForRange([{ ...input, id: 'sprint' }], '2026-08-17', '2026-08-24')
  const layout = layoutAllDayBars(occurrences, weekDateKeys('2026-08-21'))
  assert.equal(layout.bars.length, 1)
  assert.equal(layout.bars[0].startIndex, 4)
  assert.equal(layout.bars[0].endIndex, 7)
})

test('une récurrence hebdomadaire est projetée sans dupliquer la source', () => {
  const source = {
    id: 'weekly-review', kind: 'event', title: 'Revue', projectId: 'noblesse-studio', status: 'open',
    time: { kind: 'timed', start: '2026-08-17T07:00:00.000Z', end: '2026-08-17T08:00:00.000Z', timeZone: 'Europe/Paris' },
    recurrence: { frequency: 'weekly', interval: 1, until: '2026-09-30' }, reminders: [],
  }
  const occurrences = expandItemsForRange([source], '2026-08-17', '2026-09-07')
  assert.equal(occurrences.length, 3)
  assert.equal(new Set(occurrences.map((entry) => entry.occurrenceId)).size, 3)
})

test('les rendez-vous simultanés occupent des colonnes distinctes', () => {
  const make = (id, start, end) => ({
    id, title: id, projectId: 'noblesse-studio', status: 'open', reminders: [], recurrence: { frequency: 'none', interval: 1 },
    time: { kind: 'timed', start, end, timeZone: 'Europe/Paris' },
  })
  const occurrences = expandItemsForRange([
    make('a', '2026-08-21T08:00:00.000Z', '2026-08-21T10:00:00.000Z'),
    make('b', '2026-08-21T09:00:00.000Z', '2026-08-21T11:00:00.000Z'),
  ], '2026-08-21', '2026-08-22')
  const layout = timedLayoutForDay(occurrences, '2026-08-21')
  assert.equal(layout.length, 2)
  assert.deepEqual(layout.map((entry) => entry.columns), [2, 2])
  assert.deepEqual(layout.map((entry) => entry.column), [0, 1])
})

test('le formulaire refuse une fin antérieure au début', () => {
  const form = { ...createDefaultForm('2026-08-21'), title: 'Erreur', endTime: '08:00' }
  assert.match(validateForm(form), /fin/i)
})

test('les heures IANA conservent l’heure murale et refusent une heure DST inexistante', () => {
  const winter = dateFromZonedWallTime('2026-01-15', '09:00', 'Europe/Paris')
  const summer = dateFromZonedWallTime('2026-07-15', '09:00', 'Europe/Paris')
  assert.equal(winter.toISOString(), '2026-01-15T08:00:00.000Z')
  assert.equal(summer.toISOString(), '2026-07-15T07:00:00.000Z')
  assert.throws(() => dateFromZonedWallTime('2026-03-29', '02:30', 'Europe/Paris'), /n’existe pas/)
})

test('une récurrence hebdomadaire garde 09:00 lors du passage à l’heure d’été', () => {
  const source = {
    id: 'dst-weekly', kind: 'event', title: 'Point équipe', projectId: 'noblesse-studio', status: 'open',
    time: { kind: 'timed', start: '2026-03-23T08:00:00.000Z', end: '2026-03-23T09:00:00.000Z', timeZone: 'Europe/Paris' },
    recurrence: { frequency: 'weekly', interval: 1, until: '2026-04-15' }, reminders: [],
  }
  const occurrences = expandItemsForRange([source], '2026-03-23', '2026-04-07')
  assert.equal(occurrences[1].time.start, '2026-03-30T07:00:00.000Z')
  assert.equal(formFromItem(occurrences[1]).startTime, '09:00')
})

test('la fiche détail rend visibles les dates concrètes de chaque rappel', () => {
  const occurrence = {
    id: 'release',
    itemId: 'release',
    kind: 'event',
    title: 'Sortie du jeu',
    time: {
      kind: 'timed',
      start: '2026-08-31T16:00:00.000Z',
      end: '2026-08-31T17:00:00.000Z',
      timeZone: 'Europe/Paris',
    },
    reminders: [
      { id: 'two-days', channel: 'desktop', offsetMinutes: 2880 },
      { id: 'one-day', channel: 'desktop', offsetMinutes: 1440 },
      { id: 'start', channel: 'desktop', offsetMinutes: 0 },
    ],
  }
  const schedule = reminderScheduleForOccurrence(occurrence, new Date('2026-08-22T00:00:00.000Z'))
  assert.equal(schedule.length, 3)
  assert.deepEqual(schedule.map((entry) => entry.scheduledAt), [
    '2026-08-29T16:00:00.000Z',
    '2026-08-30T16:00:00.000Z',
    '2026-08-31T16:00:00.000Z',
  ])
  assert.match(schedule[0].when, /29 août/)
  assert.match(schedule[0].when, /18:00/)
  assert.match(formatOccurrencePeriod(occurrence), /31 août 2026/)
  assert.match(formatOccurrencePeriod(occurrence), /18:00–19:00/)
})
