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

test('extractLastOpenedProject accepts an apostrophe inside the Windows project path', () => {
  const projectPath = "D:/DON'T_TOUCH_ONLY_HUMAIN/THEO/PRIME INDUSTRY/WTF_IDLE_TYCOON/WTF_IDLE_TYCOON.uefnproject"
  const content = [
    `LogValkyrie: Opening project '${projectPath}'`,
    `LogValkyrie: Display: Successfully opened project '${projectPath}' and 0 dependency project(s)`,
  ].join('\n')

  assert.equal(extractLastOpenedProject(content), projectPath.replaceAll('/', path.sep))
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

test('discoverOpenUefnProjects keeps three simultaneous projects with apostrophes in their paths', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-open-three-uefn-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const projects = [
    ['UnrealEditorFortnite.log', "D:/DON'T_TOUCH_ONLY_HUMAIN/THEO/WORKER_RIFT/uefn/STEAL_THE_RIFT_BOTS/STEAL_THE_RIFT_BOTS.uefnproject"],
    ['UnrealEditorFortnite_2.log', 'D:/NO_BLESSE Studio/Fortnite/Bibliotheque/NOBLESSE_BIBLIOTHEQUE/NOBLESSE_BIBLIOTHEQUE.uefnproject'],
    ['UnrealEditorFortnite_3.log', "D:/DON'T_TOUCH_ONLY_HUMAIN/THEO/PRIME INDUSTRY/WTF_IDLE_TYCOON/WTF_IDLE_TYCOON.uefnproject"],
  ]
  for (const [name, projectPath] of projects) {
    await writeFile(
      path.join(root, name),
      `LogValkyrie: Display: Successfully opened project '${projectPath}' and 0 dependency project(s)`,
    )
    await new Promise((resolve) => setTimeout(resolve, 15))
  }

  const discovered = await discoverOpenUefnProjects({
    logsDirectory: root,
    processIds: async () => [101, 102, 103],
  })

  assert.deepEqual(
    discovered.map((project) => project.mount).toSorted(),
    ['NOBLESSE_BIBLIOTHEQUE', 'STEAL_THE_RIFT_BOTS', 'WTF_IDLE_TYCOON'],
  )
  assert.equal(discovered.every((project) => project.opened), true)
})
