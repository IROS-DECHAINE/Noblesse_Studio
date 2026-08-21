import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('desktop CSP explicitly allows live Noblesse Vault previews', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
  assert.match(html, /img-src[^;]*noblesse-vault:/)
  assert.match(html, /media-src[^;]*noblesse-vault:/)
})
