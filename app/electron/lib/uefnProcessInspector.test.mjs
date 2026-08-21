import assert from 'node:assert/strict'
import test from 'node:test'
import { createUefnPortOwnershipVerifier, parseListeningPorts, parseTasklist } from './uefnProcessInspector.mjs'

test('port ownership distinguishes UEFN from standard Unreal Editor', async () => {
  const listeners = parseListeningPorts([
    '  TCP    127.0.0.1:8000    0.0.0.0:0    LISTENING    46176',
    '  TCP    127.0.0.1:8001    0.0.0.0:0    LISTENING    61816',
  ].join('\n'))
  const processes = parseTasklist([
    '"UnrealEditor.exe","46176","Console","1","2,000 K"',
    '"UnrealEditorFortnite-Win64-Shipping.exe","61816","Console","1","2,000 K"',
  ].join('\n'))
  const verify = createUefnPortOwnershipVerifier({ snapshot: async () => ({ listeners, processes }) })

  assert.deepEqual(await verify(8000), { verified: false, pid: 46176, processName: 'UnrealEditor.exe' })
  assert.deepEqual(await verify(8001), {
    verified: true,
    pid: 61816,
    processName: 'UnrealEditorFortnite-Win64-Shipping.exe',
  })
  assert.deepEqual(await verify(8002), { verified: false, pid: null, processName: '' })
})
