import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createUefnSoundHandoff, uefnSoundHandoffInternals } from './uefnSoundHandoff.mjs'

const hash = (value) => createHash('sha256').update(value).digest('hex')

test('prepares a uniquely named WAV and the exact UEFN Audio folder without claiming installation', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-sound-handoff-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = path.join(root, 'audio.wav')
  const content = Buffer.from('managed-wave')
  await writeFile(source, content)
  const calls = []
  let receipt
  const asset = {
    asset_id: 'NOB-AUDIO-12345678-ABCD',
    asset_type: 'SoundWave',
    display_name: 'Éclair / réussite !',
    pack_id: 'Noblesse User Audio',
    source: 'user-audio/id/audio.wav',
    source_sha256: hash(content),
  }
  const installer = createUefnSoundHandoff({
    integrityValidator: async () => ({ ok: true }),
    assetLoader: async () => asset,
    sourceResolver: () => source,
    handoffRoot: path.join(root, 'handoffs'),
    receiptWriter: async (value) => { receipt = value },
    clock: () => new Date('2026-08-22T00:00:00.000Z'),
    clientFactory: () => ({
      initialize: async () => {},
      missingTools: async () => [],
      call: async (toolset, tool, args) => {
        calls.push({ toolset, tool, args })
        if (tool === 'GetContentBrowserPath') return '/PRIMEBOT/Maps'
        if (tool === 'create_folder') return true
        return null
      },
    }),
  })
  const sessionService = {
    resolveActiveSession: async (projectId, options) => {
      assert.equal(projectId, 'uefn:primebot')
      assert.deepEqual(options, { capability: 'soundHandoff' })
      return { name: 'PrimeBot Rush', mount: 'PRIMEBOT', endpoint: 'http://127.0.0.1:8000/mcp' }
    },
  }

  const result = await installer({ assetId: asset.asset_id, projectId: 'uefn:primebot' }, { sessionService })
  assert.equal(result.mode, 'MANUAL_AUDIO_IMPORT_READY')
  assert.equal(result.project, 'PrimeBot Rush')
  assert.match(result.assetName, /^S_NBL_Eclair_reussite_/)
  assert.deepEqual(await readFile(result.handoffFile), content)
  assert.equal(calls.some((call) => call.tool === 'create_folder' && call.args.path === '/PRIMEBOT/NoblesseStudio/Noblesse_User_Audio/Audio'), true)
  assert.equal(calls.some((call) => call.tool === 'SetContentBrowserPath' && call.args.path.endsWith('/Audio')), true)
  assert.equal(receipt.status, 'AWAITING_USER_IMPORT')
  assert.equal(receipt.sourceOriginalPreserved, true)
})

test('rejects another asset type before preparing a project handoff', async () => {
  let sessionResolved = false
  const installer = createUefnSoundHandoff({
    integrityValidator: async () => ({ ok: true }),
    assetLoader: async () => ({ asset_id: 'NOB-MAT-01', asset_type: 'MaterialRecipe', source: 'recipe.json' }),
  })
  await assert.rejects(() => installer({ assetId: 'NOB-MAT-01', projectId: 'uefn:test' }, {
    sessionService: { resolveActiveSession: async () => { sessionResolved = true } },
  }), /n’est pas un son/i)
  assert.equal(sessionResolved, false)
})

test('creates stable Unreal-safe names without leaking source paths', () => {
  assert.equal(uefnSoundHandoffInternals.safeUnrealSegment('Matières & Sons', 'Fallback'), 'Matieres_Sons')
  assert.equal(uefnSoundHandoffInternals.soundAssetName({
    asset_id: 'NOB-AUDIO-ABCDEF12',
    display_name: 'My Sound.wav',
  }), 'S_NBL_My_Sound_wav_ABCDEF12')
})
