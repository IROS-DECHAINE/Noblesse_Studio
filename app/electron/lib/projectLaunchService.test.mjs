import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createProjectLaunchService } from './projectLaunchService.mjs'

const connection = {
  id: 'uefn:primebot',
  displayName: 'PrimeBot Rush',
  portfolioProjectId: 'primebot-rush',
  platform: 'UEFN',
  projectMount: 'STEAL_THE_RIFT_BOTS',
  descriptorPath: 'D:\\Projects\\PrimeBot\\PrimeBot.uefnproject',
  host: '127.0.0.1',
  port: 8000,
  launch: { enabled: true, adapter: 'UEFN_EDITOR' },
}

const makeService = async (t, overrides = {}) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-project-launch-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return createProjectLaunchService({
    stateFile: path.join(root, 'state.json'),
    sessionService: { listDestinations: async () => [] },
    connectionRegistry: { version: 1, projects: [connection] },
    fileExists: async () => true,
    portAvailable: async () => true,
    executableDiscovery: async () => 'D:\\Fortnite\\UnrealEditorFortnite-Win64-Shipping.exe',
    spawnEditor: async () => ({ pid: 42 }),
    now: () => Date.parse('2026-08-21T18:00:00.000Z'),
    ...overrides,
  })
}

test('a trusted profile launches UEFN with an exact descriptor and dedicated MCP port', async (t) => {
  const calls = []
  const service = await makeService(t, {
    spawnEditor: async (executable, args) => {
      calls.push({ executable, args })
      return { pid: 4242 }
    },
  })
  const result = await service.launch({ profileId: connection.id, injectedPath: 'C:\\Windows\\cmd.exe' })
  assert.equal(result.status, 'LAUNCHED')
  assert.deepEqual(calls, [{
    executable: 'D:\\Fortnite\\UnrealEditorFortnite-Win64-Shipping.exe',
    args: [
      connection.descriptorPath,
      '-ModelContextProtocolStartServer',
      '-ModelContextProtocolPort=8000',
    ],
  }])
  assert.equal((await service.getProfiles())[0].state, 'LAUNCHING')
})

test('a verified exact MCP identity is ready and never starts a duplicate editor', async (t) => {
  let spawns = 0
  const service = await makeService(t, {
    sessionService: { listDestinations: async () => [{
      connectionId: connection.id,
      mount: connection.projectMount,
      opened: true,
      connected: true,
      canInstall: true,
      port: 8000,
    }] },
    spawnEditor: async () => { spawns += 1 },
  })
  const [profile] = await service.getProfiles()
  assert.equal(profile.state, 'READY')
  assert.equal(profile.verified, true)
  assert.equal((await service.launch({ profileId: connection.id })).status, 'ALREADY_READY')
  assert.equal(spawns, 0)
})

test('a validated launch receipt does not create a ghost launching state after the editor closes', async (t) => {
  let destination = null
  const service = await makeService(t, {
    sessionService: { listDestinations: async () => destination ? [destination] : [] },
  })
  await service.launch({ profileId: connection.id })
  destination = {
    connectionId: connection.id,
    mount: connection.projectMount,
    opened: true,
    connected: true,
    canInstall: true,
    port: 8000,
  }
  assert.equal((await service.getProfiles())[0].state, 'READY')
  destination = null
  assert.equal((await service.getProfiles())[0].state, 'CLOSED')
})

test('an already open project on the wrong port is explicit and blocks duplicate launch', async (t) => {
  let spawns = 0
  const service = await makeService(t, {
    sessionService: { listDestinations: async () => [{
      connectionId: connection.id,
      mount: connection.projectMount,
      opened: true,
      connected: true,
      canInstall: true,
      port: 8002,
    }] },
    spawnEditor: async () => { spawns += 1 },
  })
  const [profile] = await service.getProfiles()
  assert.equal(profile.state, 'WRONG_PORT')
  assert.match(profile.message, /8002.*8000/)
  await assert.rejects(() => service.launch({ profileId: connection.id }), /Ferme-le manuellement/)
  assert.equal(spawns, 0)
})

test('an occupied assigned port blocks launch before spawning UEFN', async (t) => {
  let spawns = 0
  const service = await makeService(t, {
    portAvailable: async () => false,
    spawnEditor: async () => { spawns += 1 },
  })
  await assert.rejects(() => service.launch({ profileId: connection.id }), /port MCP 8000 est déjà occupé/i)
  assert.equal(spawns, 0)
})

test('the launcher rejects every renderer-supplied unknown profile', async (t) => {
  const service = await makeService(t)
  await assert.rejects(() => service.launch({ profileId: 'uefn:unknown' }), /inconnu ou désactivé/)
})
