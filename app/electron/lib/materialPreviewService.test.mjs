import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  loadMaterialPreviewDescriptor,
  resolveVaultPreviewSource,
  resolveVaultSource,
} from './vaultService.mjs'

const writeJson = (file, value) => writeFile(file, JSON.stringify(value), 'utf8')

test('loads PreviewDescriptorV1 lazily and confines every preview source to the vault', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-preview-'))
  const previousRoot = process.env.NOBLESSE_VAULT_ROOT
  process.env.NOBLESSE_VAULT_ROOT = root

  try {
    const sourceFolder = path.join(root, 'packs', 'Test', 'sources')
    await mkdir(sourceFolder, { recursive: true })
    await Promise.all([
      writeFile(path.join(sourceFolder, 'base.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47])),
      writeFile(path.join(sourceFolder, 'normal.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47])),
      writeFile(path.join(sourceFolder, 'orm.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47])),
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
          preview_kind: 'rendered_sphere',
          preview_source: 'packs/Test/sources/base.png',
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

    const pbr = await loadMaterialPreviewDescriptor('PBR-TEST')
    assert.equal(pbr.schemaVersion, 1)
    assert.equal(pbr.mode, 'pbr_maps')
    assert.equal(pbr.maps.normal.source, 'packs/Test/sources/normal.png')

    const native = await loadMaterialPreviewDescriptor('NATIVE-TEST')
    assert.equal(native.mode, 'rendered_capture')

    const preview = await resolveVaultPreviewSource('packs/Test/sources/base.png')
    assert.equal(preview.mimeType, 'image/png')
    assert.equal(preview.filePath, await realpath(path.join(sourceFolder, 'base.png')))
    assert.equal(preview.size, 4)

    assert.throws(() => resolveVaultSource('../outside.png'), /invalide/)
    assert.throws(() => resolveVaultSource(root), /invalide/)
    await assert.rejects(resolveVaultPreviewSource('packs/Test/recipes.json'), /non autoris/)
    await assert.rejects(resolveVaultPreviewSource('packs/Test/sources/missing.png'))
  } finally {
    if (previousRoot === undefined) delete process.env.NOBLESSE_VAULT_ROOT
    else process.env.NOBLESSE_VAULT_ROOT = previousRoot
    await rm(root, { recursive: true, force: true })
  }
})
