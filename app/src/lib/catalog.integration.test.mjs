import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildSurfaceCatalog } from './catalog.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const vaultRoot = path.resolve(currentDir, '..', '..', '..', 'library', 'storage')
const packId = 'Fab_Realistic_Wall_Brick_2K_V104'
const localVaultAvailable = await access(path.join(vaultRoot, 'catalog.json')).then(() => true, () => false)

test('the published Fab selection exactly mirrors the visually curated groups', {
  skip: localVaultAvailable ? false : 'Le Vault local géré est volontairement absent du dépôt Git.',
}, async () => {
  const catalog = JSON.parse(await readFile(path.join(vaultRoot, 'catalog.json'), 'utf8'))
  const selection = JSON.parse(await readFile(path.join(vaultRoot, 'packs', packId, 'publication-selection.json'), 'utf8'))
  const nativeAssets = catalog.assets.filter((asset) => asset.pack_id === packId && asset.asset_type === 'UnrealMaterialInstance')
  const nativeSurfaces = buildSurfaceCatalog(nativeAssets)
  const publishedGroups = [...new Set(nativeAssets.map((asset) => asset.surface_group))].sort()
  const retainedGroups = [...new Set(selection.retainedSurfaceGroups.map((group) => (
    selection.groupOverrides?.[group]?.targetSurfaceGroup || group
  )))].sort()

  assert.equal(nativeAssets.length, 152)
  assert.equal(nativeSurfaces.length, 59)
  assert.deepEqual(publishedGroups, retainedGroups)
  assert.ok(nativeSurfaces.every((surface) => surface.installable && surface.platforms.includes('Unreal')))
  assert.ok(nativeAssets.every((asset) => asset.preview_kind === 'rendered_sphere'))
  assert.ok(nativeAssets.every((asset) => !/plastic|emissive/i.test(asset.category || '')))
  assert.equal(selection.excludedSourceFamilyCount, 45)
  assert.equal(selection.heldForPlaneProofCount, 10)
  assert.equal(selection.secondPassExcluded.length, 20)

  for (const preview of new Set(nativeAssets.map((asset) => asset.preview_source))) {
    await access(path.join(vaultRoot, preview))
  }
})

test('Dark Matter keeps its rendered proof framing in the catalogue', {
  skip: localVaultAvailable ? false : 'Le Vault local géré est volontairement absent du dépôt Git.',
}, async () => {
  const catalog = JSON.parse(await readFile(path.join(vaultRoot, 'catalog.json'), 'utf8'))
  const asset = catalog.assets.find((item) => item.asset_id === 'NOB-MAT-DARK-MATTER-PREMIUM-V01')

  assert.ok(asset)
  assert.equal(asset.preview_kind, 'rendered_sphere')
  assert.match(asset.preview_source, /\/proofs\/MI_NBL_DarkMatterPremium_Hero_v01\.png$/)

  const surface = buildSurfaceCatalog([asset])[0]
  assert.equal(surface.previewKind, 'rendered_sphere')
  assert.equal(surface.variantOptions[0].previewKind, 'rendered_sphere')
})
