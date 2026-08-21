import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  loadMaterialPreviewDescriptor,
  resolveVaultPreviewRequest,
  resolveVaultPreviewSource,
  resolveVaultSource,
} from './vaultService.mjs'

const writeJson = (file, value) => writeFile(file, JSON.stringify(value), 'utf8')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

test('loads PreviewDescriptorV1 lazily and confines every preview source to the vault', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-preview-'))
  const previousRoot = process.env.NOBLESSE_VAULT_ROOT
  process.env.NOBLESSE_VAULT_ROOT = root

  try {
    const sourceFolder = path.join(root, 'packs', 'Test', 'sources')
    const nativePreviewFolder = path.join(root, 'packs', 'Test', 'previews', 'material-pbr-v1')
    await Promise.all([
      mkdir(sourceFolder, { recursive: true }),
      mkdir(nativePreviewFolder, { recursive: true }),
    ])
    const previewBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    await Promise.all([
      writeFile(path.join(sourceFolder, 'base.png'), previewBytes),
      writeFile(path.join(sourceFolder, 'normal.png'), previewBytes),
      writeFile(path.join(sourceFolder, 'orm.png'), previewBytes),
      writeFile(path.join(nativePreviewFolder, 'base.webp'), previewBytes),
      writeFile(path.join(nativePreviewFolder, 'normal.webp'), previewBytes),
      writeFile(path.join(nativePreviewFolder, 'orm.webp'), previewBytes),
    ])

    await writeJson(path.join(root, 'catalog.json'), {
      assets: [
        {
          asset_id: 'PBR-TEST',
          asset_type: 'MaterialRecipe',
          pack_id: 'Test',
          animated: false,
          graph_fidelity: 'TESTED',
          preview_source: 'packs/Test/sources/base.png',
        },
        {
          asset_id: 'NATIVE-TEST',
          asset_type: 'UnrealMaterialInstance',
          pack_id: 'Test',
          pack_version: '1.0.0',
          preview_kind: 'rendered_sphere',
          preview_source: 'packs/Test/sources/base.png',
          source_sha256: 'native-source-sha',
          source_unreal_path: '/Game/Test/MI_Native',
        },
        {
          asset_id: 'NATIVE-FALLBACK',
          asset_type: 'UnrealMaterialInstance',
          pack_id: 'Test',
          pack_version: '1.0.0',
          preview_kind: 'rendered_sphere',
          preview_source: 'packs/Test/sources/base.png',
          source_sha256: 'fallback-source-sha',
          source_unreal_path: '/Game/Test/MI_Fallback',
        },
      ],
    })
    await writeJson(path.join(root, 'packs', 'Test', 'recipes.json'), {
      recipes: {
        'PBR-TEST': {
          textures: [
            { assetName: 'Base', source: 'packs/Test/sources/base.png' },
            { assetName: 'Normal', source: 'packs/Test/sources/normal.png' },
            { assetName: 'ORM', source: 'packs/Test/sources/orm.png' },
          ],
          nodes: [
            { id: 'base', kind: 'Texture', properties: { Texture: 'Base' } },
            { id: 'normal', kind: 'Texture', properties: { Texture: 'Normal' } },
            { id: 'orm', kind: 'Texture', properties: { Texture: 'ORM' } },
          ],
          connections: [],
          outputs: [
            { node: 'base', pin: 'RGB', property: 'MP_BaseColor' },
            { node: 'normal', pin: 'RGB', property: 'MP_Normal' },
            { node: 'orm', pin: 'R', property: 'MP_AmbientOcclusion' },
            { node: 'orm', pin: 'G', property: 'MP_Roughness' },
            { node: 'orm', pin: 'B', property: 'MP_Metallic' },
          ],
        },
      },
    })
    const nativeCatalog = JSON.stringify({ schemaVersion: 1, packId: 'Test' })
    await writeFile(path.join(root, 'packs', 'Test', 'native-catalog.json'), nativeCatalog, 'utf8')
    await writeJson(path.join(root, 'packs', 'Test', 'material-preview-maps.v1.json'), {
      schemaVersion: 1,
      status: 'PASS',
      kind: 'NOBLESSE_UNREAL_NATIVE_MATERIAL_PREVIEW_MAPS',
      packId: 'Test',
      packVersion: '1.0.0',
      nativeCatalogSha256: sha256(nativeCatalog),
      maxResolution: 1024,
      normalConvention: 'UNREAL_DIRECTX',
      ormTransfer: 'SRGB',
      assets: {
        'NATIVE-TEST': {
          assetId: 'NATIVE-TEST',
          sourceSha256: 'native-source-sha',
          sourceUnrealPath: '/Game/Test/MI_Native',
          maps: {
            baseColor: {
              source: 'packs/Test/previews/material-pbr-v1/base.webp',
              colorSpace: 'srgb',
              sha256: sha256(previewBytes),
            },
            normal: {
              source: 'packs/Test/previews/material-pbr-v1/normal.webp',
              colorSpace: 'linear',
              sha256: sha256(previewBytes),
            },
            orm: {
              source: 'packs/Test/previews/material-pbr-v1/orm.webp',
              colorSpace: 'linear',
              channels: 'R=AO · G=Roughness · B=Metallic',
              sha256: sha256(previewBytes),
            },
          },
          material: {
            baseColor: [1, 1, 1, 1],
            emissiveColor: [0, 0, 0, 1],
            emissiveIntensity: 0,
            metalness: 1,
            roughness: 1,
            specularIntensity: 0.5,
          },
        },
      },
    })

    const pbr = await loadMaterialPreviewDescriptor('PBR-TEST')
    assert.equal(pbr.schemaVersion, 1)
    assert.equal(pbr.mode, 'pbr_maps')
    assert.equal(pbr.maps.normal.source, 'packs/Test/sources/normal.png')

    const native = await loadMaterialPreviewDescriptor('NATIVE-TEST')
    assert.equal(native.mode, 'pbr_maps')
    assert.equal(native.previewProvenance, 'unreal_native_verified_maps')
    assert.deepEqual(native.normalScale, [1, -1])
    assert.equal(native.maps.orm.decode, 'srgb')
    assert.equal(native.maps.orm.source, 'packs/Test/previews/material-pbr-v1/orm.webp')

    const nativeFallback = await loadMaterialPreviewDescriptor('NATIVE-FALLBACK')
    assert.equal(nativeFallback.mode, 'rendered_capture')

    const preview = await resolveVaultPreviewSource('packs/Test/sources/base.png')
    assert.equal(preview.mimeType, 'image/png')
    assert.equal(preview.filePath, await realpath(path.join(sourceFolder, 'base.png')))
    assert.equal(preview.size, 4)

    const directProtocolPreview = await resolveVaultPreviewRequest('packs/Test/sources/normal.png')
    assert.equal(directProtocolPreview.filePath, await realpath(path.join(sourceFolder, 'normal.png')))
    const assetProtocolPreview = await resolveVaultPreviewRequest('PBR-TEST')
    assert.equal(assetProtocolPreview.filePath, await realpath(path.join(sourceFolder, 'base.png')))

    assert.throws(() => resolveVaultSource('../outside.png'), /invalide/)
    assert.throws(() => resolveVaultSource(root), /invalide/)
    await assert.rejects(resolveVaultPreviewSource('packs/Test/recipes.json'), /non autoris/)
    await assert.rejects(resolveVaultPreviewSource('packs/Test/sources/missing.png'))
    await assert.rejects(resolveVaultPreviewRequest('../outside.png'))
    await assert.rejects(resolveVaultPreviewRequest('packs/Test/recipes.json'), /non autoris/)
  } finally {
    if (previousRoot === undefined) delete process.env.NOBLESSE_VAULT_ROOT
    else process.env.NOBLESSE_VAULT_ROOT = previousRoot
    await rm(root, { recursive: true, force: true })
  }
})
