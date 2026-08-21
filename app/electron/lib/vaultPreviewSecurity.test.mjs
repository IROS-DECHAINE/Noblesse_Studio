import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('desktop CSP explicitly allows live Noblesse Vault previews', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
  assert.match(html, /img-src[^;]*noblesse-vault:/)
  assert.match(html, /media-src[^;]*noblesse-vault:/)
})

test('the desktop preview protocol supports CORS-safe WebGL textures', async () => {
  const main = await readFile(new URL('../main.mjs', import.meta.url), 'utf8')
  assert.match(main, /scheme:\s*['"]noblesse-vault['"][\s\S]*?corsEnabled:\s*true/)
  assert.match(main, /resolveVaultPreviewRequest\(previewToken\)/)
  assert.match(main, /Access-Control-Allow-Origin['"],\s*['"]\*['"]/)
  assert.match(main, /Cross-Origin-Resource-Policy['"],\s*['"]cross-origin['"]/)
})
