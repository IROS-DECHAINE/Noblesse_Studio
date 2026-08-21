import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { convertMp3ToWav, discoverFfmpegExecutable, ffmpegMp3ToWavArguments } from './audioConversion.mjs'

const runProcess = (executable, args) => new Promise((resolve, reject) => {
  const child = spawn(executable, args, { windowsHide: true, shell: false, stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += String(chunk) })
  child.once('error', reject)
  child.once('close', (code) => code === 0 ? resolve() : reject(new Error(stderr || `Process exited with ${code}`)))
})

test('discovers only the fixed ffmpeg executable name from approved locations', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-ffmpeg-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const executableName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const executable = path.join(root, executableName)
  await writeFile(executable, 'test')

  assert.equal(await discoverFfmpegExecutable({ pathValue: root }), await realpath(executable))
  assert.equal(await discoverFfmpegExecutable({ override: path.join(root, 'arbitrary.exe'), pathValue: '' }), '')
})

test('builds a closed high-quality MP3 conversion command without shell interpolation', () => {
  const source = 'D:\\Téléchargements\\son & commande.mp3'
  const destination = 'D:\\Vault\\audio.wav.part'
  const args = ffmpegMp3ToWavArguments(source, destination)
  assert.ok(args.includes(source))
  assert.ok(args.includes(destination))
  assert.deepEqual(args.slice(args.indexOf('-acodec'), args.indexOf('-acodec') + 4), ['-acodec', 'pcm_s24le', '-ar', '48000'])
  assert.deepEqual(args.slice(args.indexOf('-protocol_whitelist'), args.indexOf('-protocol_whitelist') + 2), ['-protocol_whitelist', 'file,pipe'])
  assert.deepEqual(args.slice(args.indexOf('-f'), args.indexOf('-f') + 2), ['-f', 'wav'])
  assert.equal(args.includes('-y'), false)
})

test('converts into a secure .wav.part work file when local FFmpeg is available', async (t) => {
  const ffmpegExecutable = await discoverFfmpegExecutable()
  if (!ffmpegExecutable) return t.skip('FFmpeg is not installed on this test machine')

  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-real-mp3-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = path.join(root, 'source.mp3')
  const destination = path.join(root, 'converted.wav.part')
  await runProcess(ffmpegExecutable, [
    '-nostdin', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.1',
    '-codec:a', 'libmp3lame', '-q:a', '5', '-y', source,
  ])

  await convertMp3ToWav({ sourcePath: source, destinationPath: destination, ffmpegExecutable })
  const header = await readFile(destination)
  assert.equal(header.toString('ascii', 0, 4), 'RIFF')
  assert.equal(header.toString('ascii', 8, 12), 'WAVE')
})
