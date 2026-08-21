import assert from 'node:assert/strict'
import test from 'node:test'
import { projectSupportsSurface } from '../lib/installCapabilities.js'

const project = {
  platform: 'UEFN',
  canInstall: true,
  transferReady: true,
  installCapabilities: { material: true, sound: false, staticMesh: false, vfx: false },
}

test('requires the capability of the selected Vault item instead of a generic green project', () => {
  assert.equal(projectSupportsSurface(project, { platforms: ['UEFN'], installCapability: 'material' }), true)
  assert.equal(projectSupportsSurface(project, { platforms: ['UEFN'], installCapability: 'sound' }), false)
  assert.equal(projectSupportsSurface({ ...project, installCapabilities: { ...project.installCapabilities, sound: true } }, {
    platforms: ['UEFN'],
    installCapability: 'sound',
  }), true)
})

test('rejects a destination on the wrong platform or without a ready transfer session', () => {
  assert.equal(projectSupportsSurface(project, { platforms: ['Unreal'], installCapability: 'material' }), false)
  assert.equal(projectSupportsSurface({ ...project, transferReady: false }, { platforms: ['UEFN'], installCapability: 'material' }), false)
})
