import assert from 'node:assert/strict'
import test from 'node:test'
import { MATERIAL_RECIPE_REQUIREMENTS, summarizeTransferCapabilities } from './uefnTransferContract.mjs'

test('material recipe transfer is enabled only when every required UEFN toolset is advertised', () => {
  const complete = Object.keys(MATERIAL_RECIPE_REQUIREMENTS)
  assert.equal(summarizeTransferCapabilities(complete).materialRecipe, true)
  assert.equal(summarizeTransferCapabilities(complete.slice(1)).materialRecipe, false)
  assert.equal(summarizeTransferCapabilities(complete).nativeUassetMigration, false)
})
