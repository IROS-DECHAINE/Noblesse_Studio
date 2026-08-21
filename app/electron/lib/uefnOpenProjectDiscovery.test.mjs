import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { discoverOpenUefnProjects, extractLastOpenedProject, extractMcpIssue } from './uefnOpenProjectDiscovery.mjs'

test('extractLastOpenedProject prefers the last successfully opened project', () => {
  const content = [
    "LogValkyrie: Opening project 'D:/Projects/FIRST/FIRST.uefnproject'",
    "LogValkyrie: Display: Successfully opened project 'D:/Projects/FIRST/FIRST.uefnproject'",
    "LogValkyrie: Opening project 'D:/Projects/PRIME INDUSTRY/WTF_IDLE_TYCOON/WTF_IDLE_TYCOON.uefnproject'",
    "LogValkyrie: Display: Successfully opened project 'D:/Projects/PRIME INDUSTRY/WTF_IDLE_TYCOON/WTF_IDLE_TYCOON.uefnproject'",
  ].join('\n')
  assert.equal(
    extractLastOpenedProject(content),
    ['D:', 'Projects', 'PRIME INDUSTRY', 'WTF_IDLE_TYCOON', 'WTF_IDLE_TYCOON.uefnproject'].join(path.sep),
  )
})

test('extractMcpIssue reports the exact occupied MCP port', () => {
  const content = '[0] LogHttpListener: Error: HttpListener unable to bind to 127.0.0.1:8000'
  assert.deepEqual(extractMcpIssue(content), { code: 'PORT_CONFLICT', port: 8000 })
  assert.equal(extractMcpIssue('LogModelContextProtocol: ready'), null)
})

test('discoverOpenUefnProjects exposes only as many current logs as editor processes', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-open-uefn-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(root, { recursive: true })
  await writeFile(
    path.join(root, 'UnrealEditorFortnite.log'),
    "LogValkyrie: Display: Successfully opened project 'D:/Projects/STEAL_THE_RIFT_BOTS/STEAL_THE_RIFT_BOTS.uefnproject'",
  )
  await new Promise((resolve) => setTimeout(resolve, 15))
  await writeFile(
    path.join(root, 'UnrealEditorFortnite_2.log'),
    "LogValkyrie: Display: Successfully opened project 'D:/Projects/WTF_IDLE_TYCOON/WTF_IDLE_TYCOON.uefnproject'",
  )
  await writeFile(
    path.join(root, 'UnrealEditorFortnite_2-backup-2026.08.21.log'),
    "LogValkyrie: Display: Successfully opened project 'D:/Projects/OLD/OLD.uefnproject'",
  )

  const projects = await discoverOpenUefnProjects({
    logsDirectory: root,
    processIds: async () => [42],
  })
  assert.equal(projects.length, 1)
  assert.equal(projects[0].mount, 'WTF_IDLE_TYCOON')
  assert.equal(projects[0].opened, true)
  assert.equal(projects[0].processId, 42)
})
