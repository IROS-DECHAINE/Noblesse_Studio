import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSurfaceCatalog, categoryFor, familyFromNotes, filterAssets, filterSurfaces, textureRole } from './catalog.js'
import { unwrapPublicItemsV1, vaultPreview } from './desktopApi.js'

const assets = [
  { display_name: 'M_PB_BaseClassic_Master_V01', asset_type: 'Material', notes: '' },
  { display_name: 'T_PB_BaseClassic_Brick_W_ORM', asset_type: 'Texture2D', notes: 'family=Brick; ORM packed' },
]

test('maps canonical categories', () => {
  assert.equal(categoryFor(assets[0]), 'Matériaux')
  assert.equal(categoryFor(assets[1]), 'Textures')
})

test('extracts family and texture role', () => {
  assert.equal(familyFromNotes(assets[1].notes), 'Brick')
  assert.equal(textureRole(assets[1].display_name), 'ORM')
})

test('filters by category and query', () => {
  assert.equal(filterAssets(assets, { category: 'Textures', query: 'brick' }).length, 1)
  assert.equal(filterAssets(assets, { category: 'Matériaux', query: 'dark' }).length, 0)
})

test('groups technical texture maps into one useful surface', () => {
  const textureAssets = ['C', 'F', 'W'].flatMap((variant) => ['BC', 'N', 'ORM'].map((role) => ({
    asset_id: `brick-${variant}-${role}`,
    display_name: `T_PB_BaseClassic_Brick_${variant}_${role}`,
    asset_type: 'Texture2D',
    notes: 'family=Brick',
    status: 'TRANSFERRED',
    pack_id: 'PrimeBot_Surface_Core',
  })))
  const surfaces = buildSurfaceCatalog(textureAssets)
  assert.equal(surfaces.length, 1)
  assert.equal(surfaces[0].name, 'Brique classique')
  assert.equal(surfaces[0].variants.length, 3)
  assert.equal(surfaces[0].technicalMaps, 9)
})

test('keeps exact clickable previews for material variants without duplicate assets', () => {
  const originals = ['C', 'F', 'W'].flatMap((variant) => ['BC', 'N', 'ORM'].map((role) => ({
    asset_id: `oak-${variant}-${role}`,
    display_name: `T_PB_BaseClassic_Oak_${variant}_${role}`,
    asset_type: 'Texture2D',
    notes: 'family=Oak',
    status: 'TRANSFERRED',
    pack_id: 'PrimeBot_Surface_Core',
    preview_asset: role === 'BC' ? `assets/oak-${variant}.png` : '',
  })))
  const surface = buildSurfaceCatalog([...originals, ...originals])[0]
  assert.equal(surface.technicalMaps, 9)
  assert.deepEqual(surface.variantOptions.map((variant) => variant.id), ['C', 'F', 'W'])
  assert.equal(new Set(surface.variantOptions.map((variant) => variant.preview)).size, 3)
})

test('serves vault previews on demand without bundling a duplicate preview tree', () => {
  const asset = {
    preview_source: 'packs/Fab_Test/previews/Wood/example.png',
    preview_asset: 'assets/vault-previews/Fab_Test/Wood/example.png',
  }
  assert.equal(vaultPreview(asset), '/api/vault-preview?source=packs%2FFab_Test%2Fpreviews%2FWood%2Fexample.png')
  globalThis.window = { noblesseDesktop: {} }
  assert.equal(vaultPreview({
    ...asset,
    preview_url: 'noblesse-vault://preview/asset-permanent-01',
  }), 'noblesse-vault://preview/asset-permanent-01')
  delete globalThis.window
})

test('unwraps only supported public IPC envelopes', () => {
  const items = [{ id: 'asset-01' }]
  assert.equal(unwrapPublicItemsV1({ schemaVersion: 1, items }, 'assets v1'), items)
  assert.throws(() => unwrapPublicItemsV1({ schemaVersion: 2, items }, 'assets v1'), /non pris en charge/)
  assert.throws(() => unwrapPublicItemsV1(items, 'assets v1'), /non pris en charge/)
})

test('filters logical surfaces by usage and target platform', () => {
  const surfaces = [
    { name: 'Bois naturel', family: 'Oak', category: 'Bois', sourcePack: 'Core', animated: false, platforms: ['UEFN'] },
    { name: 'Néon animé', family: 'Neon', category: 'VFX', sourcePack: 'FX', animated: true, platforms: ['Unreal'] },
  ]
  assert.equal(filterSurfaces(surfaces, { category: 'Bois', platform: 'Toutes' }).length, 1)
  assert.equal(filterSurfaces(surfaces, { category: 'Animées', platform: 'Toutes' }).length, 1)
  assert.equal(filterSurfaces(surfaces, { category: 'Tout', platform: 'Roblox' }).length, 0)
})

test('keeps source-verified material references out of the user-facing Coffre', () => {
  const surfaces = buildSurfaceCatalog([{
    asset_id: 'material-ref-base-surface',
    display_name: 'M_WR_Base_Surface_Parent_V01',
    asset_type: 'MaterialReference',
    surface_group: 'PrimeBot:BaseParents',
    group_label: 'Masters Base',
    variant_id: 'Surface',
    variant_label: 'Surface',
    status: 'SOURCE_VERIFIED',
    platforms: ['UEFN'],
  }])

  assert.equal(surfaces.length, 0)
})

test('hides all PrimeBot technical references without deleting their catalog records', () => {
  const groups = [
    ['BaseParents', 3],
    ['SlotHolo', 1],
    ['ScoreboardDynamic', 1],
    ['SocleV18', 4],
    ['ScoreboardMesh', 3],
    ['BotdexHologram', 1],
  ]
  const references = groups.flatMap(([group, count]) => Array.from({ length: count }, (_, index) => ({
    asset_id: `reference-${group}-${index}`,
    display_name: `Reference ${group} ${index}`,
    asset_type: 'MaterialReference',
    surface_group: `PrimeBot:${group}`,
    group_label: group,
    variant_id: `${index + 1}`,
    variant_label: `${index + 1}`,
    status: group === 'BotdexHologram' ? 'BLOCKED' : 'SOURCE_VERIFIED',
    platforms: ['UEFN'],
  })))
  const surfaces = buildSurfaceCatalog(references)

  assert.equal(references.length, 13)
  assert.equal(references.length, 13)
  assert.equal(surfaces.length, 0)
})

test('groups BaseClassic recipes into one localized card with three variants', () => {
  const recipes = ['C', 'F', 'W'].map((variant) => ({
    asset_id: `recipe-brick-${variant}`,
    display_name: `M_NBL_BaseClassic_Brick_${variant}_V01`,
    asset_type: 'MaterialRecipe',
    source_family: 'Brick',
    surface_group: 'BaseClassic:Brick',
    group_label: 'Brick',
    variant_id: variant,
    variant_label: variant,
    status: 'READY_IN_APP',
    platforms: ['UEFN'],
  }))
  const surfaces = buildSurfaceCatalog(recipes)
  assert.equal(surfaces.length, 1)
  assert.equal(surfaces[0].name, 'Brique classique')
  assert.deepEqual(surfaces[0].variants, ['Plafond', 'Sol', 'Mur'])
  assert.deepEqual(surfaces[0].variantOptions.map((variant) => variant.id), ['C', 'F', 'W'])
  assert.deepEqual(surfaces[0].variantOptions.map((variant) => variant.assetId), recipes.map((recipe) => recipe.asset_id))
  assert.deepEqual(surfaces[0].textureRoles, [])
})

test('keeps animation metadata scoped to the selected variant', () => {
  const surfaces = buildSurfaceCatalog([
    {
      asset_id: 'recipe-static',
      display_name: 'M_Static',
      asset_type: 'MaterialRecipe',
      surface_group: 'Mixed:Animation',
      variant_id: 'Static',
      variant_label: 'Statique',
      animated: false,
      status: 'READY_IN_APP',
      platforms: ['UEFN'],
    },
    {
      asset_id: 'recipe-live',
      display_name: 'M_Live',
      asset_type: 'MaterialRecipe',
      surface_group: 'Mixed:Animation',
      variant_id: 'Live',
      variant_label: 'Animée',
      animated: true,
      status: 'READY_IN_APP',
      platforms: ['UEFN'],
    },
  ])

  assert.equal(surfaces[0].animated, true)
  assert.deepEqual(surfaces[0].variantOptions.map((variant) => variant.animated), [false, true])
})

test('groups Unreal-native Fab instances into one card without exposing technical textures', () => {
  const variants = [
    ['WithBump', 'Avec relief', 'assets/wall-01-bump.png'],
    ['WithoutBump', 'Sans relief', 'assets/wall-01-flat.png'],
  ].map(([variantId, variantLabel, preview], index) => ({
    asset_id: `fab-wall-01-${index}`,
    display_name: `MI_WallBrick_${index}`,
    asset_type: 'UnrealMaterialInstance',
    surface_group: 'FabPack:WallBrick:01',
    group_label: 'Mur en brique 01',
    category: 'Maison',
    variant_id: variantId,
    variant_label: variantLabel,
    preview_asset: preview,
    preview_kind: 'rendered_sphere',
    status: 'READY_IN_APP',
    platforms: ['Unreal'],
    install_mode: 'UNREAL_NATIVE_BUNDLE',
    technical_maps: index ? 3 : 4,
  }))

  const surfaces = buildSurfaceCatalog(variants)
  assert.equal(surfaces.length, 1)
  assert.equal(surfaces[0].name, 'Mur en brique 01')
  assert.deepEqual(surfaces[0].variants, ['Avec relief', 'Sans relief'])
  assert.equal(surfaces[0].installable, true)
  assert.equal(surfaces[0].installAssetId, 'fab-wall-01-0')
  assert.deepEqual(surfaces[0].variantOptions.map((variant) => variant.installAssetId), ['fab-wall-01-0', 'fab-wall-01-1'])
  assert.deepEqual(surfaces[0].platforms, ['Unreal'])
  assert.equal(surfaces[0].technicalMaps, 4)
  assert.equal(surfaces[0].previewKind, 'rendered_sphere')
  assert.ok(surfaces[0].variantOptions.every((variant) => variant.previewKind === 'rendered_sphere'))
})
