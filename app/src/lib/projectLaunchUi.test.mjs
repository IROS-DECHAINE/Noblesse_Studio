import assert from 'node:assert/strict'
import test from 'node:test'
import { getProjectLaunchAction } from './projectLaunchUi.js'

const profile = {
  expectedPort: 8000,
  canLaunch: true,
  opened: false,
  message: 'Prêt.',
}

test('a closed project exposes an enabled launch action', () => {
  const action = getProjectLaunchAction({ ...profile, state: 'CLOSED' })
  assert.equal(action.disabled, false)
  assert.match(action.label, /Lancer UEFN.*8000/)
})

test('only an exact verified profile receives the green ready treatment', () => {
  const ready = getProjectLaunchAction({ ...profile, state: 'READY' })
  const wrong = getProjectLaunchAction({ ...profile, state: 'WRONG_PORT', opened: true })
  assert.equal(ready.tone, 'ready')
  assert.equal(wrong.tone, 'error')
  assert.equal(wrong.disabled, true)
})

test('launching and connecting profiles block repeated clicks', () => {
  assert.equal(getProjectLaunchAction({ ...profile, state: 'LAUNCHING' }).disabled, true)
  assert.equal(getProjectLaunchAction({ ...profile, state: 'CONNECTING' }).busy, true)
})
