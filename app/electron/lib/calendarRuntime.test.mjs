import assert from 'node:assert/strict'
import test from 'node:test'
import { formatCalendarNotificationBody, reconcileCalendarRuntime } from './calendarRuntime.mjs'

const schedulerProbe = () => {
  const calls = []
  return {
    calls,
    scheduler: {
      start: () => calls.push('start'),
      stop: () => calls.push('stop'),
    },
  }
}

test('conserve l’icône système lorsque les rappels tournent en arrière-plan', () => {
  const { calls, scheduler } = schedulerProbe()
  const tray = { destroyed: false, destroy() { this.destroyed = true } }
  const runtime = reconcileCalendarRuntime({
    settings: { desktopNotificationsEnabled: true, runInBackground: true },
    scheduler,
    tray: null,
    createTray: () => tray,
  })

  assert.deepEqual(calls, ['start'])
  assert.equal(runtime.runsInBackground, true)
  assert.equal(runtime.tray, tray)
  assert.equal(tray.destroyed, false)
})

test('désactive proprement le mode arrière-plan si aucune icône système ne peut être créée', () => {
  const { scheduler } = schedulerProbe()
  const runtime = reconcileCalendarRuntime({
    settings: { desktopNotificationsEnabled: true, runInBackground: true },
    scheduler,
    createTray: () => null,
  })
  assert.equal(runtime.notificationsEnabled, true)
  assert.equal(runtime.runsInBackground, false)
  assert.equal(runtime.tray, null)
})

test('arrête le scheduler et détruit l’icône lorsque les rappels sont désactivés', () => {
  const { calls, scheduler } = schedulerProbe()
  const tray = { destroyed: false, destroy() { this.destroyed = true } }
  const runtime = reconcileCalendarRuntime({
    settings: { desktopNotificationsEnabled: false, runInBackground: false },
    scheduler,
    tray,
    createTray: () => tray,
  })
  assert.deepEqual(calls, ['stop'])
  assert.equal(runtime.runsInBackground, false)
  assert.equal(runtime.tray, null)
  assert.equal(tray.destroyed, true)
})

test('la notification annonce l’horaire concret du rendez-vous', () => {
  const body = formatCalendarNotificationBody({
    occurrenceStart: '2026-08-31T16:00:00.000Z',
    timeZone: 'Europe/Paris',
    projectLabel: 'HOW MANY BOXES',
    location: 'Visio',
  })
  assert.match(body, /31 août/)
  assert.match(body, /18:00/)
  assert.match(body, /HOW MANY BOXES/)
  assert.match(body, /Visio/)
})
