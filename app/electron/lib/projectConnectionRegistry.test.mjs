import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findProjectConnection,
  findProjectConnectionByDescriptor,
  loadProjectConnectionRegistry,
  validateProjectConnectionRegistry,
} from './projectConnectionRegistry.mjs'

test('the Noblesse connection registry assigns stable ports and keeps Roblox on stdio', async () => {
  const registry = await loadProjectConnectionRegistry()
  const byId = new Map(registry.projects.map((project) => [project.id, project]))
  assert.equal(byId.get('uefn:steal_the_rift_bots').port, 8000)
  assert.equal(byId.get('uefn:steal_the_rift_bots').portfolioProjectId, 'primebot-rush')
  assert.deepEqual(byId.get('uefn:steal_the_rift_bots').launch, { enabled: true, adapter: 'UEFN_EDITOR' })
  assert.equal(byId.get('uefn:wtf_idle_tycoon').port, 8001)
  assert.equal(byId.get('uefn:noblesse_bibliotheque').port, 8002)
  assert.equal(byId.get('unreal:noblesse_fab_staging').port, 8003)
  assert.equal(byId.get('unreal:noblesse_vault_install_qa').transport, 'LOCAL')
  assert.equal(byId.get('unreal:noblesse_vault_install_qa').port, null)
  assert.equal(byId.get('roblox:official_studio').transport, 'STDIO')
  assert.equal(byId.get('roblox:official_studio').port, null)
  assert.equal(findProjectConnection(registry, {
    mount: '/NOBLESSE_BIBLIOTHEQUE/',
    platform: 'UEFN',
  })?.port, 8002)
  assert.equal(findProjectConnectionByDescriptor(registry, {
    descriptorPath: byId.get('unreal:noblesse_fab_staging').descriptorPath.toUpperCase(),
    platform: 'Unreal',
  })?.id, 'unreal:noblesse_fab_staging')
})

test('the registry rejects an unsafe renderer-controlled launch profile', () => {
  assert.throws(() => validateProjectConnectionRegistry({
    version: 1,
    projects: [{
      id: 'uefn:unsafe',
      platform: 'UEFN',
      transport: 'STREAMABLE_HTTP',
      host: '127.0.0.1',
      port: 8010,
      path: '/mcp',
      descriptorPath: 'relative.uefnproject',
      launch: { enabled: true, adapter: 'UEFN_EDITOR' },
    }],
  }), /descripteur UEFN absolu/)
})

test('the registry rejects duplicate HTTP ports', () => {
  assert.throws(() => validateProjectConnectionRegistry({
    version: 1,
    projects: [
      { id: 'uefn:a', platform: 'UEFN', transport: 'STREAMABLE_HTTP', host: '127.0.0.1', port: 8000, path: '/mcp' },
      { id: 'uefn:b', platform: 'UEFN', transport: 'STREAMABLE_HTTP', host: '127.0.0.1', port: 8000, path: '/mcp' },
    ],
  }), /Port MCP 8000 affecté/)
})
