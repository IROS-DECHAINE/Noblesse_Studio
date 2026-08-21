import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { processSoundFile, readWavMetadata } from './audioFileProcessor.mjs'

const pcmWav = ({ sampleRate = 48_000, channels = 1, seconds = 0.1 } = {}) => {
  const bitDepth = 16
  const sampleCount = Math.round(sampleRate * seconds)
  const dataBytes = sampleCount * channels * (bitDepth / 8)
  const buffer = Buffer.alloc(44 + dataBytes)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(buffer.length - 8, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * channels * 2, 28)
  buffer.writeUInt16LE(channels * 2, 32)
  buffer.writeUInt16LE(bitDepth, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataBytes, 40)
  return buffer
}

test('validates and copies a real WAV without re-encoding it', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-wav-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = path.join(root, 'source.wav')
  const destination = path.join(root, 'destination.wav')
  const input = pcmWav()
  await writeFile(source, input)

  const result = await processSoundFile({ sourcePath: source, destinationPath: destination, format: 'WAV' })
  assert.equal(result.converted, false)
  assert.equal(result.sampleRate, 48_000)
  assert.equal(result.channels, 1)
  assert.equal(result.bitDepth, 16)
  assert.equal(result.sourceSha256, result.outputSha256)
  assert.deepEqual(await readFile(destination), input)
})

test('rejects a renamed file that is not a real RIFF WAV', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noblesse-fake-wav-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const fake = path.join(root, 'fake.wav')
  await writeFile(fake, Buffer.alloc(64, 1))
  await assert.rejects(() => readWavMetadata(fake), /vrai WAV RIFF/)
})
