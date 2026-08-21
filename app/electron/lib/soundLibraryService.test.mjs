import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { processSoundFile } from './audioFileProcessor.mjs'
import { createSoundLibraryService } from './soundLibraryService.mjs'

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')
const pcmWav = () => {
  const dataBytes = 9_600
  const buffer = Buffer.alloc(44 + dataBytes)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(buffer.length - 8, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(48_000, 24)
  buffer.writeUInt32LE(96_000, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataBytes, 40)
  return buffer
}

test('imports a selected WAV with a permanent ID and deduplicates it by hash', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-sound-library-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const vault = path.join(root, 'library', 'storage')
  await mkdir(vault, { recursive: true })
  const catalogBuffer = Buffer.from(`${JSON.stringify({ schemaVersion: 1, generatedAt: '2026-08-22T00:00:00.000Z', assets: [] }, null, 2)}\n`)
  await writeFile(path.join(vault, 'catalog.json'), catalogBuffer)
  await writeFile(path.join(vault, 'integrity.json'), `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: '2026-08-22T00:00:00.000Z',
    status: 'PASS',
    catalogSha256: sha256(catalogBuffer),
    assetCount: 0,
    checkedFileCount: 0,
    missingFileCount: 0,
    hashMismatchCount: 0,
  }, null, 2)}\n`)
  const source = path.join(root, 'Mon son.wav')
  await writeFile(source, pcmWav())
  let rebuildCount = 0
  const service = createSoundLibraryService({
    vaultRoot: vault,
    rebuildIndexes: async () => { rebuildCount += 1 },
    processSource: processSoundFile,
    idFactory: () => '00000000-0000-4000-8000-000000000001',
    now: () => new Date('2026-08-22T01:02:03.000Z'),
  })

  const firstSelection = await service.describeSelection(source)
  assert.equal(firstSelection.file.originalName, 'Mon son.wav')
  assert.equal(JSON.stringify(firstSelection).includes(root), false)
  const imported = await service.importSound({
    selectionToken: firstSelection.file.selectionToken,
    title: 'Impact métallique',
    category: 'Effets',
    rightsConfirmed: true,
  })
  assert.equal(imported.status, 'IMPORTED')
  assert.equal(imported.asset.asset_id, 'NOB-AUDIO-00000000-0000-4000-8000-000000000001')
  assert.equal(imported.asset.source, 'user-audio/NOB-AUDIO-00000000-0000-4000-8000-000000000001/audio.wav')
  assert.equal(JSON.stringify(imported).includes(root), false)
  assert.equal(rebuildCount, 1)

  const storedCatalogBuffer = await readFile(path.join(vault, 'catalog.json'))
  const storedCatalog = JSON.parse(storedCatalogBuffer)
  const integrity = JSON.parse(await readFile(path.join(vault, 'integrity.json'), 'utf8'))
  assert.equal(storedCatalog.assets.length, 1)
  assert.equal(integrity.catalogSha256, sha256(storedCatalogBuffer))
  assert.equal(integrity.soundCount, 1)

  const secondSelection = await service.describeSelection(source)
  const duplicate = await service.importSound({
    selectionToken: secondSelection.file.selectionToken,
    title: 'Copie',
    category: 'Effets',
    rightsConfirmed: true,
  })
  assert.equal(duplicate.status, 'ALREADY_PRESENT')
  assert.equal(duplicate.asset.asset_id, imported.asset.asset_id)
  assert.equal(rebuildCount, 1)
})

test('keeps the immutable MP3 source beside the converted WAV', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-mp3-library-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const vault = path.join(root, 'library', 'storage')
  const tools = path.join(root, 'tools')
  await mkdir(vault, { recursive: true })
  await mkdir(tools, { recursive: true })
  const catalogBuffer = Buffer.from(`${JSON.stringify({ schemaVersion: 1, generatedAt: '2026-08-22T00:00:00.000Z', assets: [] }, null, 2)}\n`)
  await writeFile(path.join(vault, 'catalog.json'), catalogBuffer)
  await writeFile(path.join(vault, 'integrity.json'), `${JSON.stringify({
    schemaVersion: 1,
    status: 'PASS',
    catalogSha256: sha256(catalogBuffer),
    assetCount: 0,
    checkedFileCount: 0,
    missingFileCount: 0,
    hashMismatchCount: 0,
  }, null, 2)}\n`)
  const mp3Bytes = Buffer.from('ID3-test-source')
  const source = path.join(root, 'source.mp3')
  await writeFile(source, mp3Bytes)
  const ffmpegName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const fakeFfmpeg = path.join(tools, ffmpegName)
  await writeFile(fakeFfmpeg, 'approved-test-converter')
  const wavBytes = pcmWav()
  const service = createSoundLibraryService({
    vaultRoot: vault,
    ffmpegOverride: fakeFfmpeg,
    rebuildIndexes: async () => undefined,
    idFactory: () => '00000000-0000-4000-8000-000000000002',
    processSource: async ({ destinationPath, originalDestinationPath }) => {
      await writeFile(destinationPath, wavBytes)
      await writeFile(originalDestinationPath, mp3Bytes)
      return {
        outputSha256: sha256(wavBytes),
        sourceSha256: sha256(mp3Bytes),
        converted: true,
        durationSeconds: 0.1,
        sizeBytes: wavBytes.length,
        sampleRate: 48_000,
        channels: 1,
        bitDepth: 24,
      }
    },
  })

  const selection = await service.describeSelection(source)
  const imported = await service.importSound({
    selectionToken: selection.file.selectionToken,
    title: 'Source MP3 préservée',
    category: 'Musiques',
    rightsConfirmed: true,
  })
  const managedFolder = path.join(vault, 'user-audio', imported.asset.asset_id)
  assert.deepEqual(await readFile(path.join(managedFolder, 'original.mp3')), mp3Bytes)
  assert.deepEqual(await readFile(path.join(managedFolder, 'audio.wav')), wavBytes)
  assert.equal(imported.asset.original_source, `user-audio/${imported.asset.asset_id}/original.mp3`)
  const integrity = JSON.parse(await readFile(path.join(vault, 'integrity.json'), 'utf8'))
  assert.equal(integrity.checkedFileCount, 2)
})
