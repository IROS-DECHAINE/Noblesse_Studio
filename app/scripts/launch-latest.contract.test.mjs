import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const launcherPath = path.join(import.meta.dirname, 'launch-latest.ps1')

test('the desktop launcher quotes an application root containing spaces', async () => {
  const launcher = await readFile(launcherPath, 'utf8')

  assert.match(launcher, /\$quotedCatalogRoot\s*=\s*'"\{0\}"'\s*-f\s*\$catalogRoot/)
  assert.match(launcher, /-ArgumentList\s+\$quotedCatalogRoot/)
  assert.doesNotMatch(launcher, /-ArgumentList\s+@\(\$catalogRoot\)/)
})
