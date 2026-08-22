import assert from 'node:assert/strict'
import test from 'node:test'
import { MATERIAL_RECIPE_REQUIREMENTS, SOUND_HANDOFF_REQUIREMENTS, STATIC_MESH_REQUIREMENTS, summarizeTransferCapabilities } from './uefnTransferContract.mjs'

test('material recipe transfer is enabled only when every required UEFN toolset is advertised', () => {
  const complete = Object.keys(MATERIAL_RECIPE_REQUIREMENTS)
  assert.ok(MATERIAL_RECIPE_REQUIREMENTS['editor_toolset.toolsets.object.ObjectTools'].includes('get_properties'))
  assert.ok(MATERIAL_RECIPE_REQUIREMENTS['editor_toolset.toolsets.asset.AssetTools'].includes('exists'))
  assert.equal(summarizeTransferCapabilities(complete).materialRecipe, true)
  assert.equal(summarizeTransferCapabilities(complete.slice(1)).materialRecipe, false)
  assert.equal(summarizeTransferCapabilities(complete).nativeUassetMigration, false)
})

test('sound handoff requires content-browser navigation and safe project-folder creation', () => {
  const complete = Object.keys(SOUND_HANDOFF_REQUIREMENTS)
  assert.ok(SOUND_HANDOFF_REQUIREMENTS['EditorToolset.EditorAppToolset'].includes('SetContentBrowserPath'))
  assert.ok(SOUND_HANDOFF_REQUIREMENTS['editor_toolset.toolsets.asset.AssetTools'].includes('create_folder'))
  assert.equal(summarizeTransferCapabilities(complete).soundHandoff, true)
  assert.equal(summarizeTransferCapabilities(complete.slice(1)).soundHandoff, false)
})

test('static mesh transfer requires import, geometry proof, material slots and save proof', () => {
  const complete = Object.keys(STATIC_MESH_REQUIREMENTS)
  const meshTools = STATIC_MESH_REQUIREMENTS['editor_toolset.toolsets.static_mesh.StaticMeshTools']
  assert.ok(meshTools.includes('import_file'))
  assert.ok(meshTools.includes('get_bounds'))
  assert.ok(meshTools.includes('get_material_slots'))
  assert.ok(meshTools.includes('set_material'))
  assert.equal(summarizeTransferCapabilities(complete).staticMesh, true)
  assert.equal(summarizeTransferCapabilities(complete.slice(1)).staticMesh, false)
})
