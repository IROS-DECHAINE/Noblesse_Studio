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
    prepareEditorSettings: async ({ descriptorPath, port }) => ({
      changed: true,
      fingerprint: `${descriptorPath}:${port}`,
    }),
    spawnEditor: async () => ({ pid: 42 }),
    processAlive: async () => true,
    getUefnProcessIds: async () => [],
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
      '-ValkyrieProject=D:/Projects/PrimeBot/PrimeBot.uefnproject',
      `-ini:EditorPerProjectUserSettings:[/Script/ValkyrieEditor.ValkyrieEditorConfig]:bStartupWithLastProject=True,[/Script/ValkyrieEditor.ValkyrieEditorConfig]:LastProjectFileName=D:/Projects/PrimeBot/PrimeBot.uefnproject,[/Script/ModelContextProtocolEngine.ModelContextProtocolSettings]:ServerUrlPath=/mcp,[/Script/ModelContextProtocolEngine.ModelContextProtocolSettings]:ServerPortNumber=8000,[/Script/ModelContextProtocolEngine.ModelContextProtocolSettings]:bAutoStartServer=True,[/Script/ModelContextProtocolEngine.ModelContextProtocolSettings]:bEnableToolSearch=True`,
      '-ModelContextProtocolStartServer',
      '-ModelContextProtocolPort=8000',
    ],
  }])
  assert.equal((await service.getProfiles())[0].state, 'LAUNCHING')
})

test('the persistent UEFN handoff is prepared before the editor process starts', async (t) => {
  const order = []
  const service = await makeService(t, {
    prepareEditorSettings: async (request) => {
      order.push({ type: 'settings', request })
      return { fingerprint: 'prepared-v2' }
    },
    spawnEditor: async () => {
      order.push({ type: 'spawn' })
      return { pid: 4242 }
    },
    settingsFile: 'C:\\UEFN\\EditorPerProjectUserSettings.ini',
    settingsBackupDirectory: 'D:\\Noblesse\\Backups',
  })
  await service.launch({ profileId: connection.id })
  assert.equal(order[0].type, 'settings')
  assert.deepEqual(order[0].request, {
    descriptorPath: connection.descriptorPath,
    port: 8000,
    urlPath: '/mcp',
    settingsFile: 'C:\\UEFN\\EditorPerProjectUserSettings.ini',
    backupDirectory: 'D:\\Noblesse\\Backups',
  })
  assert.equal(order[1].type, 'spawn')
})

test('concurrent clicks serialize and only spawn one UEFN editor', async (t) => {
  let spawns = 0
  let releaseSettings
  const settingsGate = new Promise((resolve) => { releaseSettings = resolve })
  const service = await makeService(t, {
    prepareEditorSettings: async () => {
      await settingsGate
      return { fingerprint: 'serialized' }
    },
    spawnEditor: async () => {
      spawns += 1
      return { pid: 4242 }
    },
  })
  const first = service.launch({ profileId: connection.id })
  const second = service.launch({ profileId: connection.id })
  releaseSettings()
  assert.equal((await first).status, 'LAUNCHED')
  assert.equal((await second).status, 'ALREADY_LAUNCHING')
  assert.equal(spawns, 1)
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
  let alive = true
  const service = await makeService(t, {
    sessionService: { listDestinations: async () => destination ? [destination] : [] },
    processAlive: async () => alive,
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
  alive = false
  assert.equal((await service.getProfiles())[0].state, 'CLOSED')
})

test('an alive UEFN process without an opened project is reported as the project browser', async (t) => {
  let currentTime = Date.parse('2026-08-21T18:00:00.000Z')
  const service = await makeService(t, {
    now: () => currentTime,
    projectLoadGraceMs: 30_000,
    processAlive: async () => true,
  })
  await service.launch({ profileId: connection.id })
  currentTime += 31_000
  const [profile] = await service.getProfiles()
  assert.equal(profile.state, 'PROJECT_BROWSER')
  assert.equal(profile.opened, true)
  assert.equal(profile.canLaunch, false)
  assert.match(profile.message, /portail.*pas été chargé/i)
})

test('a different project opened by the launched process is reported explicitly', async (t) => {
  let destination = null
  const service = await makeService(t, {
    sessionService: { listDestinations: async () => destination ? [destination] : [] },
    processAlive: async () => true,
  })
  await service.launch({ profileId: connection.id })
  destination = {
    processId: 42,
    mount: 'ANOTHER_PROJECT',
    name: 'Another Project',
    opened: true,
    connected: true,
    canInstall: true,
    port: 8000,
  }
  const [profile] = await service.getProfiles()
  assert.equal(profile.state, 'WRONG_PROJECT')
  assert.equal(profile.actualProjectMount, 'ANOTHER_PROJECT')
  assert.match(profile.message, /Another Project.*PrimeBot Rush/)
})

test('a stopped launch process reports one retryable failure then resets to closed', async (t) => {
  let alive = true
  const service = await makeService(t, { processAlive: async () => alive })
  await service.launch({ profileId: connection.id })
  alive = false
  const [failed] = await service.getProfiles()
  assert.equal(failed.state, 'LAUNCH_FAILED')
  assert.equal(failed.canLaunch, true)
  const [reset] = await service.getProfiles()
  assert.equal(reset.state, 'CLOSED')
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

test('a foreign project owning the assigned port is explicit before click', async (t) => {
  let spawns = 0
  const service = await makeService(t, {
    sessionService: { listDestinations: async () => [{
      connectionId: 'uefn:industry',
      mount: 'WTF_IDLE_TYCOON',
      name: 'Prime Industry',
      processId: 77,
      opened: true,
      connected: true,
      canInstall: false,
      port: 8000,
    }] },
    spawnEditor: async () => { spawns += 1 },
  })
  const [profile] = await service.getProfiles()
  assert.equal(profile.state, 'PORT_IN_USE')
  assert.equal(profile.canLaunch, false)
  assert.match(profile.message, /8000.*Prime Industry/)
  await assert.rejects(() => service.launch({ profileId: connection.id }), /8000.*Prime Industry/)
  assert.equal(spawns, 0)
})

test('launch waits for an untracked closing UEFN process before patching shared settings', async (t) => {
  let scans = 0
  let delays = 0
  const service = await makeService(t, {
    getUefnProcessIds: async () => (++scans === 1 ? [99] : []),
    settleDelay: async () => { delays += 1 },
  })
  const result = await service.launch({ profileId: connection.id })
  assert.equal(result.status, 'LAUNCHED')
  assert.equal(delays, 1)
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
