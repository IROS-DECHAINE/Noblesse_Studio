import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { localUefnBridge } from './vite.config.js'

test('serves lazy descriptors and only confined image sources through Vite', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-vite-preview-'))
  const previousRoot = process.env.NOBLESSE_VAULT_ROOT
  process.env.NOBLESSE_VAULT_ROOT = root
  let server

  try {
    const sourceFolder = path.join(root, 'packs', 'Test', 'sources')
    await mkdir(sourceFolder, { recursive: true })
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    await writeFile(path.join(sourceFolder, 'proof.png'), png)
    await writeFile(path.join(root, 'catalog.json'), JSON.stringify({
      assets: [{
        asset_id: 'NATIVE-TEST',
        asset_type: 'UnrealMaterialInstance',
        pack_id: 'Test',
        preview_kind: 'rendered_sphere',
        preview_source: 'packs/Test/sources/proof.png',
      }],
    }), 'utf8')

    const routes = new Map()
    localUefnBridge().configureServer({
      middlewares: {
        use(route, handler) {
          routes.set(route, handler)
        },
      },
    })
    server = http.createServer((req, res) => {
      const route = new URL(req.url, 'http://noblesse.local').pathname
      const handler = routes.get(route)
      if (!handler) {
        res.statusCode = 404
        return res.end()
      }
      return handler(req, res)
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`

    const descriptorResponse = await fetch(`${origin}/api/material-preview?assetId=NATIVE-TEST`)
    assert.equal(descriptorResponse.status, 200)
    assert.equal((await descriptorResponse.json()).mode, 'rendered_capture')

    const imageResponse = await fetch(`${origin}/api/vault-preview?source=${encodeURIComponent('packs/Test/sources/proof.png')}`)
    assert.equal(imageResponse.status, 200)
    assert.equal(imageResponse.headers.get('content-type'), 'image/png')
    assert.equal(imageResponse.headers.get('x-content-type-options'), 'nosniff')
    assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), png)

    const traversal = await fetch(`${origin}/api/vault-preview?source=${encodeURIComponent('../outside.png')}`)
    assert.equal(traversal.status, 404)
    const forbiddenMime = await fetch(`${origin}/api/vault-preview?source=${encodeURIComponent('catalog.json')}`)
    assert.equal(forbiddenMime.status, 404)
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve))
    if (previousRoot === undefined) delete process.env.NOBLESSE_VAULT_ROOT
    else process.env.NOBLESSE_VAULT_ROOT = previousRoot
    await rm(root, { recursive: true, force: true })
  }
})
