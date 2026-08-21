import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createUnrealNativeInstaller } from './unrealNativeInstaller.mjs'
import { listUnrealProjects } from './vaultService.mjs'

test('discovers only local Unreal descriptors and gates the engine version', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-unreal-projects-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const supported = path.join(root, 'Ready')
  const unsupported = path.join(root, 'Legacy')
  await Promise.all([mkdir(supported), mkdir(unsupported)])
  await writeFile(path.join(supported, 'Ready.uproject'), JSON.stringify({ FileVersion: 3, EngineAssociation: '5.8' }))
  await writeFile(path.join(unsupported, 'Legacy.uproject'), JSON.stringify({ FileVersion: 3, EngineAssociation: '5.7' }))
  await mkdir(path.join(supported, 'Content'))
  await writeFile(path.join(supported, 'Content', 'Ignored.uproject'), '{}')

  const projects = await listUnrealProjects(root, async () => [])
  assert.equal(projects.length, 2)
  const ready = projects.find((project) => project.name === 'Ready')
  assert.equal(ready.localReady, true)
  assert.equal(ready.connected, false)
  assert.equal(ready.opened, false)
  assert.equal(ready.canInstall, false)
  assert.equal(ready.transferReady, false)
  assert.equal(ready.status, 'PROJECT_CLOSED')
  assert.equal(ready.protection, 'PROJECT_CLOSED')
  assert.equal(projects.find((project) => project.name === 'Legacy').canInstall, false)
})

test('marks a local Unreal project open only when a running editor names its descriptor', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-unreal-open-project-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const folder = path.join(root, 'OpenProject')
  const descriptor = path.join(folder, 'OpenProject.uproject')
  await mkdir(folder)
  await writeFile(descriptor, JSON.stringify({ FileVersion: 3, EngineAssociation: '5.8' }))

  const [project] = await listUnrealProjects(root, async () => [{ processId: 4512, path: descriptor }])
  assert.equal(project.opened, true)
  assert.equal(project.connected, false)
  assert.equal(project.processId, 4512)
  assert.equal(project.transferReady, true)
  assert.equal(project.status, 'EDITOR_OPEN_LOCAL_PROJECT')
})

test('uses a registered Unreal ID and never derives an ID from an unregistered path', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-unreal-stable-id-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const registeredFolder = path.join(root, 'Registered')
  const unregisteredFolder = path.join(root, 'Unregistered')
  const registeredDescriptor = path.join(registeredFolder, 'Registered.uproject')
  await Promise.all([mkdir(registeredFolder), mkdir(unregisteredFolder)])
  await Promise.all([
    writeFile(registeredDescriptor, JSON.stringify({ FileVersion: 3, EngineAssociation: '5.8' })),
    writeFile(path.join(unregisteredFolder, 'Unregistered.uproject'), JSON.stringify({ FileVersion: 3, EngineAssociation: '5.8' })),
  ])
  const registry = {
    projects: [{
      id: 'unreal:registered-permanent-id',
      displayName: 'Projet enregistré',
      platform: 'Unreal',
      descriptorPath: registeredDescriptor,
    }],
  }

  const projects = await listUnrealProjects(root, async () => [], registry)
  const registered = projects.find((project) => project.registered)
  const unregistered = projects.find((project) => !project.registered)
  assert.equal(registered.id, 'unreal:registered-permanent-id')
  assert.equal(registered.name, 'Projet enregistré')
  assert.equal(unregistered.id, '')
  assert.doesNotMatch(unregistered.id, /[\\/]/)
})

test('runs migration then target reload and only returns success with both receipts', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-unreal-install-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const targetFolder = path.join(root, 'Target')
  const targetProject = path.join(targetFolder, 'Target.uproject')
  const sourceProject = path.join(root, 'Source.uproject')
  const enginePath = path.join(root, 'UnrealEditor-Cmd.exe')
  const receiptDirectory = path.join(root, 'receipts')
  await mkdir(targetFolder)
  await Promise.all([
    writeFile(targetProject, JSON.stringify({ FileVersion: 3, EngineAssociation: '5.8' })),
    writeFile(sourceProject, JSON.stringify({ FileVersion: 3, EngineAssociation: '5.8' })),
    writeFile(enginePath, ''),
  ])
  const project = {
    id: `unreal:${targetProject.toLowerCase()}`,
    name: 'Target',
    path: targetProject,
    folder: targetFolder,
    platform: 'Unreal',
    engineVersion: '5.8',
    connected: true,
    canInstall: true,
  }
  let integrityChecks = 0
  let finalReceipt = null
  const calls = []
  const installer = createUnrealNativeInstaller({
    projectIndex: async () => [project],
    assetLoader: async () => ({
      asset_id: 'native-01',
      display_name: 'MI_ConcreteFloor_D_04',
      asset_type: 'UnrealMaterialInstance',
      install_mode: 'UNREAL_NATIVE_BUNDLE',
      native_source_project: 'source-project',
      source_unreal_path: '/Game/Pack/MI_ConcreteFloor_D_04',
      status: 'READY_IN_APP',
      platforms: ['Unreal'],
      pack_id: 'Fab_Test',
    }),
    integrityValidator: async () => { integrityChecks += 1 },
    sourceResolver: () => sourceProject,
    receiptWriter: async (payload) => { finalReceipt = payload; return path.join(receiptDirectory, 'final.json') },
    commandRunner: async (_engine, projectPath, scriptPath, env) => {
      calls.push({ projectPath, scriptPath })
      if (scriptPath.endsWith('unreal_migrate_native_material.py')) {
        await writeFile(env.NOBLESSE_UNREAL_MIGRATION_RECEIPT, JSON.stringify({
          status: 'PASS', payloadCountAfter: 9, addedPayloads: ['Pack/MI.uasset'], changedPayloads: [], conflictingPackages: [],
        }))
        return { code: 0, stdout: 'NOBLESSE_MIGRATION_PASS=receipt', stderr: '' }
      }
      await writeFile(env.NOBLESSE_UNREAL_VALIDATION_RECEIPT, JSON.stringify({
        status: 'PASS', dependencyCount: 8, missingDependencies: [], parentPath: '/Game/Pack/M_Parent.M_Parent',
      }))
      return { code: 0, stdout: 'NOBLESSE_VALIDATION_PASS=receipt', stderr: '' }
    },
    enginePath,
    unrealProjectRoot: root,
    receiptDirectory,
  })

  const result = await installer({ assetId: 'native-01', projectId: project.id })
  assert.equal(integrityChecks, 1)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].projectPath, sourceProject)
  assert.equal(calls[1].projectPath, targetProject)
  assert.equal(result.mode, 'INSTALLED_AND_VALIDATED')
  assert.equal(result.missingDependencies.length, 0)
  assert.equal(finalReceipt.status, 'PASS')
  assert.equal(finalReceipt.installer, 'NOBLESSE_STUDIO_UNREAL_NATIVE_V1')
})
