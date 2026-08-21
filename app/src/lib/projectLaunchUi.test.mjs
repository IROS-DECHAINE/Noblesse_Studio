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

test('the UEFN project browser is never presented as an opened project', () => {
  const action = getProjectLaunchAction({ ...profile, state: 'PROJECT_BROWSER', opened: true, canLaunch: false })
  assert.equal(action.label, 'Portail UEFN ouvert')
  assert.equal(action.tone, 'warning')
  assert.equal(action.disabled, true)
})

test('a stopped process clears the stale failure and permits a retry', () => {
  const action = getProjectLaunchAction({ ...profile, state: 'LAUNCH_FAILED', canLaunch: true })
  assert.match(action.label, /Relancer UEFN.*8000/)
  assert.equal(action.disabled, false)
})

test('an opened project with the wrong identity is explicit', () => {
  const action = getProjectLaunchAction({ ...profile, state: 'WRONG_PROJECT', opened: true, canLaunch: false })
  assert.equal(action.label, 'Mauvais projet ouvert')
  assert.equal(action.tone, 'error')
})

test('a foreign project owning the assigned port names the conflict before click', () => {
  const action = getProjectLaunchAction({ ...profile, state: 'PORT_IN_USE', canLaunch: false })
  assert.equal(action.label, 'Port MCP 8000 occupé')
  assert.equal(action.tone, 'error')
  assert.equal(action.disabled, true)
})
