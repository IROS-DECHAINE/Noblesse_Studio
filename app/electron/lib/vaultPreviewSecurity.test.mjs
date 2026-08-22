import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('desktop CSP explicitly allows live Noblesse Vault previews', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
  assert.match(html, /img-src[^;]*noblesse-vault:/)
  assert.match(html, /connect-src[^;]*blob:/)
  assert.match(html, /connect-src[^;]*noblesse-vault:/)
  assert.match(html, /media-src[^;]*noblesse-vault:/)
})

test('the desktop preview protocol supports CORS-safe WebGL textures', async () => {
  const main = await readFile(new URL('../main.mjs', import.meta.url), 'utf8')
  assert.match(main, /scheme:\s*['"]noblesse-vault['"][\s\S]*?corsEnabled:\s*true/)
  assert.match(main, /resolveVaultPreviewRequest\(token\)/)
  assert.match(main, /resolveVaultAudioRequest\(token\)/)
  assert.match(main, /resolveVaultModelRequest\(token\)/)
  assert.match(main, /Access-Control-Allow-Origin['"],\s*['"]\*['"]/)
  assert.match(main, /Cross-Origin-Resource-Policy['"],\s*['"]cross-origin['"]/)
})

test('the asset model loader keeps script CSP strict and does not enable Meshopt WebAssembly', async () => {
  const source = await readFile(new URL('../../src/components/AssetPreview3D.jsx', import.meta.url), 'utf8')
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
  assert.match(source, /useLoader\(GLTFLoader, modelUrl\)/)
  assert.doesNotMatch(source, /setMeshoptDecoder\s*\(/)
  assert.doesNotMatch(html, /script-src[^;]*unsafe-eval/)
})
