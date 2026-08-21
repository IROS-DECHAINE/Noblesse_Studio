import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { patchUefnEditorSettings, prepareUefnEditorLaunchSettings } from './uefnEditorSettings.mjs'

const descriptor = "D:\\DON'T_TOUCH_ONLY_HUMAIN\\THEO\\WORKER_RIFT\\uefn\\STEAL_THE_RIFT_BOTS\\STEAL_THE_RIFT_BOTS.uefnproject"

test('UEFN preferences are patched narrowly for the exact project and MCP port', () => {
  const source = [
    '[Unrelated]',
    'KeepMe=True',
    '',
    '[/Script/ValkyrieEditor.ValkyrieEditorConfig]',
    'bModalProjectBrowser=True',
    'bStartupWithLastProject=False',
    'LastProjectFileName=D:/Old/Old.uefnproject',
    '',
    '[/Script/ModelContextProtocolEngine.ModelContextProtocolSettings]',
    'ServerUrlPath=/old',
    'ServerPortNumber=8002',
    'bAutoStartServer=False',
    'bEnableToolSearch=False',
    '',
  ].join('\r\n')
  const patched = patchUefnEditorSettings(source, { descriptorPath: descriptor, port: 8000 })
  assert.match(patched, /\[Unrelated\]\r\nKeepMe=True/)
  assert.match(patched, /bStartupWithLastProject=True/)
  assert.match(patched, /LastProjectFileName=D:\/DON'T_TOUCH_ONLY_HUMAIN\/THEO\/WORKER_RIFT\/uefn\/STEAL_THE_RIFT_BOTS\/STEAL_THE_RIFT_BOTS\.uefnproject/)
  assert.match(patched, /ServerUrlPath=\/mcp/)
  assert.match(patched, /ServerPortNumber=8000/)
  assert.match(patched, /bAutoStartServer=True/)
  assert.match(patched, /bEnableToolSearch=True/)
  assert.equal((patched.match(/LastProjectFileName=/g) || []).length, 1)
  assert.equal((patched.match(/ServerPortNumber=/g) || []).length, 1)
})

test('missing UEFN sections are appended without losing existing preferences', () => {
  const patched = patchUefnEditorSettings('[Existing]\nValue=42\n', {
    descriptorPath: 'D:\\Projects\\Library\\Library.uefnproject',
    port: 8002,
  })
  assert.match(patched, /^\[Existing\]\nValue=42/m)
  assert.match(patched, /\[\/Script\/ValkyrieEditor\.ValkyrieEditorConfig\]/)
  assert.match(patched, /\[\/Script\/ModelContextProtocolEngine\.ModelContextProtocolSettings\]/)
})

test('preparation is atomic, idempotent and keeps a content-addressed backup', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-uefn-settings-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const settingsFile = path.join(root, 'Config', 'EditorPerProjectUserSettings.ini')
  const backupDirectory = path.join(root, 'Backups')
  await mkdir(path.dirname(settingsFile), { recursive: true })
  await writeFile(settingsFile, '[/Script/ValkyrieEditor.ValkyrieEditorConfig]\nbStartupWithLastProject=False\n', 'utf8')

  const first = await prepareUefnEditorLaunchSettings({
    descriptorPath: descriptor,
    port: 8000,
    settingsFile,
    backupDirectory,
  })
  assert.equal(first.changed, true)
  assert.ok(first.backupFile)
  assert.match(await readFile(first.backupFile, 'utf8'), /bStartupWithLastProject=False/)

  const second = await prepareUefnEditorLaunchSettings({
    descriptorPath: descriptor,
    port: 8000,
    settingsFile,
    backupDirectory,
  })
  assert.equal(second.changed, false)
  assert.equal(second.fingerprint, first.fingerprint)
})

test('unsafe INI delimiters and invalid ports fail before any launch', () => {
  assert.throws(() => patchUefnEditorSettings('', {
    descriptorPath: 'D:\\Bad,Project\\Bad.uefnproject',
    port: 8000,
  }), /ne peut pas être transmis/)
  assert.throws(() => patchUefnEditorSettings('', {
    descriptorPath: descriptor,
    port: 70_000,
  }), /port MCP UEFN est invalide/)
})
