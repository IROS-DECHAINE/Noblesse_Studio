import assert from 'node:assert/strict'
import test from 'node:test'
import { discoverUefnEditorExecutable, executableFromEpicManifest } from './uefnExecutableDiscovery.mjs'

test('an Epic Fortnite Studio manifest resolves only the official UEFN executable', () => {
  assert.match(executableFromEpicManifest({
    AppName: 'Fortnite_Studio',
    InstallLocation: 'D:\\Epic\\Fortnite',
    LaunchExecutable: 'FortniteGame/Binaries/Win64/UnrealEditorFortnite-Win64-Shipping.exe',
  }), /UnrealEditorFortnite-Win64-Shipping\.exe$/)
  assert.equal(executableFromEpicManifest({
    AppName: 'Fortnite',
    InstallLocation: 'D:\\Epic\\Fortnite',
    LaunchExecutable: 'FortniteGame/Binaries/Win64/FortniteLauncher.exe',
  }), '')
})

test('discovery chooses the newest valid Fortnite Studio installation', async () => {
  const files = {
    'C:\\Manifests\\old.item': JSON.stringify({
      AppName: 'Fortnite_Studio',
      InstallLocation: 'D:\\Old',
      LaunchExecutable: 'FortniteGame/Binaries/Win64/UnrealEditorFortnite-Win64-Shipping.exe',
    }),
    'C:\\Manifests\\new.item': JSON.stringify({
      AppName: 'Fortnite_Studio',
      InstallLocation: 'D:\\Current',
      LaunchExecutable: 'FortniteGame/Binaries/Win64/UnrealEditorFortnite-Win64-Shipping.exe',
    }),
  }
  const resolved = await discoverUefnEditorExecutable({
    manifestsDirectory: 'C:\\Manifests',
    listManifests: async () => Object.keys(files).map((file) => ({
      name: file.split('\\').at(-1),
      isFile: () => true,
    })),
    loadManifest: async (file) => files[file],
    fileExists: async () => true,
    fileStat: async (file) => ({ mtimeMs: file.endsWith('new.item') ? 20 : 10 }),
  })
  assert.match(resolved, /Current/)
})

test('an override cannot launch an arbitrary program', async () => {
  await assert.rejects(() => discoverUefnEditorExecutable({
    override: 'C:\\Windows\\System32\\cmd.exe',
    fileExists: async () => true,
  }), /pas autorisé/)
})
