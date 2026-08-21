import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { removeElectronWelcomeFallback } from './after-pack.mjs'

test('the Windows package never ships the generic Electron welcome application', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-after-pack-'))
  try {
    const resources = path.join(root, 'resources')
    const fallback = path.join(resources, 'default_app.asar')
    const application = path.join(resources, 'app.asar')
    await mkdir(resources, { recursive: true })
    await writeFile(fallback, 'electron welcome')
    await writeFile(application, 'noblesse studio')

    await removeElectronWelcomeFallback({ appOutDir: root, electronPlatformName: 'win32' })

    await assert.rejects(readFile(fallback), { code: 'ENOENT' })
    assert.equal(await readFile(application, 'utf8'), 'noblesse studio')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
