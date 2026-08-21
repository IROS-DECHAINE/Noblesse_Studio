import assert from 'node:assert/strict'
import test from 'node:test'
import { localUpdateQuitFlag, shouldQuitForLocalUpdate } from './localUpdateLifecycle.mjs'

test('a packaged second instance can request a graceful local-update shutdown', () => {
  assert.equal(shouldQuitForLocalUpdate({
    commandLine: ['Noblesse Studio.exe', localUpdateQuitFlag],
    isPackaged: true,
  }), true)
})

test('development, malformed and lookalike commands cannot request shutdown', () => {
  assert.equal(shouldQuitForLocalUpdate({ commandLine: [localUpdateQuitFlag], isPackaged: false }), false)
  assert.equal(shouldQuitForLocalUpdate({ commandLine: `${localUpdateQuitFlag}`, isPackaged: true }), false)
  assert.equal(shouldQuitForLocalUpdate({ commandLine: [`${localUpdateQuitFlag}=yes`], isPackaged: true }), false)
})
