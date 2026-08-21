import assert from 'node:assert/strict'
import test from 'node:test'
import {
  extractUprojectPath,
  normalizeProjectDescriptorPath,
  unrealOpenProjectInternals,
} from './unrealOpenProjectDiscovery.mjs'

test('extracts quoted Unreal project descriptors from editor command lines', () => {
  const descriptor = 'D:\\NO_BLESSE Studio\\Unreal\\Project A\\ProjectA.uproject'
  assert.equal(extractUprojectPath(`"C:\\UE\\UnrealEditor.exe" "${descriptor}" -log`), descriptor)
})

test('normalizes Unreal project descriptor identity independently of path casing', () => {
  assert.equal(
    normalizeProjectDescriptorPath('D:\\Projects\\Demo\\Demo.uproject'),
    normalizeProjectDescriptorPath('d:\\projects\\demo\\demo.uproject'),
  )
})

test('accepts both one process object and an array from PowerShell JSON', () => {
  assert.equal(unrealOpenProjectInternals.parseProcessPayload('{"ProcessId":12}').length, 1)
  assert.equal(unrealOpenProjectInternals.parseProcessPayload('[{"ProcessId":12},{"ProcessId":13}]').length, 2)
  assert.deepEqual(unrealOpenProjectInternals.parseProcessPayload(''), [])
})
