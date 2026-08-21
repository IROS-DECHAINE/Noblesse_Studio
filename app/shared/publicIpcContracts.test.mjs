import assert from 'node:assert/strict'
import test from 'node:test'
import { readVaultCatalog } from '../electron/lib/vaultService.mjs'
import {
  assertAssetsResponseV1,
  assertProjectFavoriteRequestV1,
  serializeAssetsResponseV1,
  serializeProjectsResponseV1,
} from './publicIpcContracts.mjs'

const privateKeys = new Set([
  'source_path', 'source_origin', 'preview_source', 'preview_path', 'path', 'folder',
  'logFile', 'descriptorPath', 'endpoint', 'processId', 'connectionId',
])

const assertNoPrivateKeys = (value) => {
  if (Array.isArray(value)) {
    value.forEach(assertNoPrivateKeys)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    assert.equal(privateKeys.has(key), false, `private key leaked: ${key}`)
    assertNoPrivateKeys(nested)
  }
}

test('projects the real Vault catalog without absolute or internal paths', async () => {
  const rawAssets = await readVaultCatalog()
  assert.ok(rawAssets.some((asset) => /^[a-z]:[\\/]/i.test(asset.source_path || '')))

  const response = serializeAssetsResponseV1(rawAssets)
  assert.equal(response.schemaVersion, 1)
  assert.equal(response.items.length, rawAssets.length)
  assertNoPrivateKeys(response)
  assert.doesNotMatch(JSON.stringify(response), /(?:^|[^a-z0-9+.-])[a-z]:[\\/]|file:\/\/|\\\\[^\\]+[\\/]/i)
})

test('builds asset DTOs by allowlist and resolves previews through asset IDs', () => {
  const response = serializeAssetsResponseV1([{
    asset_id: 'asset-permanent-01',
    asset_type: 'MaterialRecipe',
    display_name: 'Béton',
    status: 'READY_IN_APP',
    target_path: '/Game/Noblesse/Materials/M_Concrete',
    preview_source: 'packs/Noblesse/previews/concrete.png',
    source_path: 'D:\\Private\\Vault\\concrete.uasset',
    source_origin: '\\\\studio-server\\private\\concrete.uasset',
    descriptorPath: 'D:\\Private\\Project.uproject',
  }])

  assert.deepEqual(response.items[0], {
    asset_id: 'asset-permanent-01',
    asset_type: 'MaterialRecipe',
    display_name: 'Béton',
    status: 'READY_IN_APP',
    target_path: '/Game/Noblesse/Materials/M_Concrete',
    preview_url: 'noblesse-vault://preview/asset-permanent-01',
  })
})

test('rejects alternate private-path forms even in otherwise public text', () => {
  const unsafeValues = [
    'Consulter D:/Private/secret.txt',
    'Consulter \\\\server\\private\\secret.txt',
    'Consulter \\\\?\\D:\\Private\\secret.txt',
    'Consulter file:///D:/Private/secret.txt',
  ]
  for (const notes of unsafeValues) {
    assert.throws(() => serializeAssetsResponseV1([{
      asset_id: 'asset-01',
      asset_type: 'Texture2D',
      display_name: 'Texture',
      status: 'READY_IN_APP',
      notes,
    }]), /chemin privé/)
  }
})

test('rejects response tampering and renderer-controlled favorite extras', () => {
  const response = serializeAssetsResponseV1([{
    asset_id: 'asset-01',
    asset_type: 'Texture2D',
    display_name: 'Texture',
    status: 'READY_IN_APP',
  }])
  response.items[0].source_path = 'relative-but-private-field'
  assert.throws(() => assertAssetsResponseV1(response), /additional properties/)

  assert.deepEqual(
    assertProjectFavoriteRequestV1({ projectId: 'uefn:stable-project', favorite: true }),
    { projectId: 'uefn:stable-project', favorite: true },
  )
  assert.throws(() => assertProjectFavoriteRequestV1({
    projectId: 'uefn:stable-project',
    favorite: true,
    path: 'D:\\Private\\Project.uefnproject',
  }), /additional properties/)
})

test('publishes registered project IDs and counts unregistered discoveries', () => {
  const response = serializeProjectsResponseV1([
    {
      id: 'uefn:approved-project',
      name: 'Projet approuvé',
      platform: 'UEFN',
      opened: true,
      connected: true,
      canInstall: true,
      transferReady: true,
      favorite: false,
      registered: true,
      port: 8000,
      status: 'READY',
      path: 'D:\\Private\\Approved\\Project.uefnproject',
      folder: 'D:\\Private\\Approved',
      endpoint: 'http://127.0.0.1:8000/mcp',
      processId: 42,
    },
    {
      id: '',
      name: 'Projet non enregistré',
      platform: 'Unreal',
      opened: true,
      connected: false,
      canInstall: false,
      transferReady: false,
      favorite: false,
      registered: false,
      status: 'EDITOR_OPEN_LOCAL_PROJECT',
      path: 'D:\\Private\\Unregistered.uproject',
    },
  ])

  assert.equal(response.items.length, 1)
  assert.equal(response.items[0].id, 'uefn:approved-project')
  assert.equal(response.diagnostics.unregisteredCount, 1)
  assertNoPrivateKeys(response)
})

test('fails closed for malformed service responses and path-derived project IDs', () => {
  assert.throws(() => serializeAssetsResponseV1(null), /doit retourner une liste/)
  assert.throws(() => serializeProjectsResponseV1({}), /doit retourner une liste/)
  assert.throws(() => serializeProjectsResponseV1([{
    id: 'unreal:D:\\Private\\Project.uproject',
    name: 'Projet hostile',
    platform: 'Unreal',
    opened: true,
    connected: false,
    canInstall: false,
    transferReady: false,
    favorite: false,
    registered: true,
    status: 'PROJECT_CLOSED',
  }]), /chemin privé/)
})
