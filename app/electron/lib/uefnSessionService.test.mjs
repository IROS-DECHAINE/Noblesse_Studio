import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createUefnSessionService } from './uefnSessionService.mjs'

const makeSession = (port, mount = 'STEAL_THE_RIFT_BOTS') => ({
  id: `uefn:${mount.toLowerCase()}`,
  mount,
  name: mount,
  port,
  endpoint: `http://127.0.0.1:${port}/mcp`,
  contentBrowserPath: `/${mount}`,
  latencyMs: 4,
  capabilities: { materialRecipe: true, nativeUassetMigration: false },
})

test('only open UEFN sessions are destinations and a favorite stays visible but locked offline', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-uefn-sessions-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  let online = true
  const favoritesFile = path.join(root, 'favorites.json')
  const service = createUefnSessionService({
    favoritesFile,
    ports: [8000, 8001],
    probePort: async (port) => online && port === 8000 ? makeSession(port) : null,
    openProjectDiscovery: async () => [],
    projectIndex: async () => [{
      name: 'STEAL_THE_RIFT_BOTS',
      path: 'D:\\Projects\\STEAL_THE_RIFT_BOTS\\STEAL_THE_RIFT_BOTS.uefnproject',
      folder: 'D:\\Projects\\STEAL_THE_RIFT_BOTS',
      updatedAt: '2026-08-21T00:00:00.000Z',
    }],
  })

  const opened = await service.listDestinations()
  assert.equal(opened.length, 1)
  assert.equal(opened[0].connected, true)
  assert.equal(opened[0].canInstall, true)
  assert.equal(opened[0].protection, 'INSTALL_ALLOWED')
  assert.equal(opened[0].path.endsWith('STEAL_THE_RIFT_BOTS.uefnproject'), true)

  const favorited = await service.setFavorite({ projectId: opened[0].id, favorite: true })
  assert.equal(favorited[0].favorite, true)
  const persisted = JSON.parse(await readFile(favoritesFile, 'utf8'))
  assert.equal(persisted.version, 1)
  assert.equal(persisted.favorites[0].preferredPort, 8000)

  online = false
  const offline = await service.listDestinations()
  assert.equal(offline.length, 1)
  assert.equal(offline[0].favorite, true)
  assert.equal(offline[0].connected, false)
  assert.equal(offline[0].canInstall, false)
  assert.equal(offline[0].protection, 'PROJECT_CLOSED')
  await assert.rejects(() => service.resolveActiveSession(offline[0].id), /fermé|MCP/i)

  const removed = await service.setFavorite({ projectId: offline[0].id, favorite: false })
  assert.deepEqual(removed, [])
})

test('the same project discovered on multiple ports is exposed once using the lowest live port', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-uefn-dedup-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const service = createUefnSessionService({
    favoritesFile: path.join(root, 'favorites.json'),
    ports: [8004, 8002],
    probePort: async (port) => makeSession(port, 'FUTURE_PROJECT'),
    openProjectDiscovery: async () => [],
    projectIndex: async () => [],
    connectionRegistry: { version: 1, projects: [] },
  })

  const destinations = await service.listDestinations()
  assert.equal(destinations.length, 1)
  assert.equal(destinations[0].id, 'uefn:future_project')
  assert.equal(destinations[0].port, 8002)
  assert.equal(destinations[0].canInstall, true)
})

test('a verified project on the wrong profile port stays visible but transfer is blocked', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-uefn-port-mismatch-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const service = createUefnSessionService({
    favoritesFile: path.join(root, 'favorites.json'),
    ports: [8002],
    probePort: async () => makeSession(8002, 'WTF_IDLE_TYCOON'),
    openProjectDiscovery: async () => [],
    projectIndex: async () => [],
  })

  const destinations = await service.listDestinations()
  assert.equal(destinations.length, 1)
  const [destination] = destinations
  assert.equal(destination.mount, 'WTF_IDLE_TYCOON')
  assert.equal(destination.connected, true)
  assert.equal(destination.canInstall, false)
  assert.equal(destination.transferReady, false)
  assert.equal(destination.assignedPort, 8001)
  assert.equal(destination.port, 8002)
  assert.equal(destination.status, 'PORT_MISMATCH')
  assert.equal(destination.protection, 'PROJECT_PORT_MISMATCH')
  assert.deepEqual(destination.mcpIssue, {
    code: 'PORT_MISMATCH',
    expectedPort: 8001,
    actualPort: 8002,
  })
  assert.equal(destination.mcpWarning, null)
  await assert.rejects(() => service.resolveActiveSession(destination.id), /fermé|MCP/i)
})

test('a favorite assigned to a live port stays offline when a different project owns that endpoint', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-uefn-port-identity-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const favoritesFile = path.join(root, 'favorites.json')
  await writeFile(favoritesFile, JSON.stringify({
    version: 1,
    favorites: [{
      mount: 'NOBLESSE_BIBLIOTHEQUE',
      name: 'Bibliotheque UEFN',
      path: 'D:\\Library\\NOBLESSE_BIBLIOTHEQUE.uefnproject',
      preferredPort: 8002,
    }],
  }))
  const service = createUefnSessionService({
    favoritesFile,
    ports: [8002],
    probePort: async () => makeSession(8002, 'WTF_IDLE_TYCOON'),
    openProjectDiscovery: async () => [],
    projectIndex: async () => [],
  })

  const destinations = await service.listDestinations()
  const industry = destinations.find((item) => item.mount === 'WTF_IDLE_TYCOON')
  const library = destinations.find((item) => item.mount === 'NOBLESSE_BIBLIOTHEQUE')
  assert.equal(industry.connected, true)
  assert.equal(industry.port, 8002)
  assert.equal(industry.canInstall, false)
  assert.equal(industry.status, 'PORT_MISMATCH')
  assert.equal(library.connected, false)
  assert.equal(library.opened, false)
  assert.equal(library.canInstall, false)
  assert.equal(library.status, 'OFFLINE')
})

test('an open project stays visible when MCP is unavailable and can be favorited without enabling transfer', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-uefn-open-no-mcp-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  let opened = true
  const projectPath = 'D:\\Projects\\PRIME INDUSTRY\\WTF_IDLE_TYCOON\\WTF_IDLE_TYCOON.uefnproject'
  const service = createUefnSessionService({
    favoritesFile: path.join(root, 'favorites.json'),
    ports: [8000, 8001],
    probePort: async () => null,
    projectIndex: async () => [],
    openProjectDiscovery: async () => opened ? [{
      mount: 'WTF_IDLE_TYCOON',
      name: 'WTF_IDLE_TYCOON',
      path: projectPath,
      folder: path.dirname(projectPath),
      opened: true,
    }] : [],
  })

  const unavailable = await service.listDestinations()
  assert.equal(unavailable.length, 1)
  assert.equal(unavailable[0].opened, true)
  assert.equal(unavailable[0].connected, false)
  assert.equal(unavailable[0].canInstall, false)
  assert.equal(unavailable[0].status, 'MCP_UNAVAILABLE')

  const favorited = await service.setFavorite({ projectId: unavailable[0].id, favorite: true })
  assert.equal(favorited[0].favorite, true)
  assert.equal(favorited[0].path, projectPath)

  opened = false
  const closed = await service.listDestinations()
  assert.equal(closed.length, 1)
  assert.equal(closed[0].opened, false)
  assert.equal(closed[0].favorite, true)
  assert.equal(closed[0].canInstall, false)
  assert.equal(closed[0].status, 'OFFLINE')
})

test('standard Unreal /Game sessions and their stale favorites are rejected and pruned', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-reject-unreal-game-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const favoritesFile = path.join(root, 'favorites.json')
  await writeFile(favoritesFile, JSON.stringify({
    version: 1,
    favorites: [
      { mount: 'Game', name: 'Game', path: '', preferredPort: 8000 },
      { mount: 'NOBLESSE_BIBLIOTHEQUE', name: 'NOBLESSE_BIBLIOTHEQUE', path: 'D:\\Library.uefnproject' },
    ],
  }))
  const service = createUefnSessionService({
    favoritesFile,
    ports: [8000],
    probePort: async () => makeSession(8000, 'Game'),
    projectIndex: async () => [],
    openProjectDiscovery: async () => [],
  })

  const destinations = await service.listDestinations()
  assert.deepEqual(destinations.map((item) => item.mount), ['NOBLESSE_BIBLIOTHEQUE'])
  const persisted = JSON.parse(await readFile(favoritesFile, 'utf8'))
  assert.deepEqual(persisted.favorites.map((item) => item.mount), ['NOBLESSE_BIBLIOTHEQUE'])
})
