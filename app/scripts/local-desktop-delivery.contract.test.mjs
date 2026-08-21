import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const deployScript = await readFile(new URL('./windows/deploy-local-build.ps1', import.meta.url), 'utf8')

test('local desktop delivery validates before packaging and deployment', () => {
  const command = packageJson.scripts['desktop:deploy-local']
  const gates = ['verify-foundation', 'verify-source', 'test', 'audit --prod --audit-level high', 'desktop:dir', 'deploy-local-build.ps1']
  let previousIndex = -1
  for (const gate of gates) {
    const index = command.indexOf(gate)
    assert.ok(index > previousIndex, `${gate} doit rester après la porte précédente`)
    previousIndex = index
  }
})

test('local desktop deployment is rollback-safe and never force-kills the application', () => {
  assert.match(deployScript, /release\\win-unpacked/u)
  assert.match(deployScript, /build-next/u)
  assert.match(deployScript, /build-previous/u)
  assert.match(deployScript, /CloseMainWindow/u)
  assert.match(deployScript, /--noblesse-local-update-quit/u)
  assert.match(deployScript, /Aucun processus n’a été forcé/u)
  assert.doesNotMatch(deployScript, /Stop-Process|taskkill/u)
})

test('local desktop deployment verifies identity and keeps the shortcut direct', () => {
  assert.match(deployScript, /resources\\app\.asar/u)
  assert.match(deployScript, /resources\\default_app\.asar/u)
  assert.match(deployScript, /VersionInfo\.FileVersion/u)
  assert.match(deployScript, /\.TargetPath = \$targetExecutable/u)
  assert.match(deployScript, /Start-Process -FilePath \$targetExecutable/u)
})
