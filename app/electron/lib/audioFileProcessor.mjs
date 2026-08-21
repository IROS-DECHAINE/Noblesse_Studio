import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { lstat, open, rm, stat } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { convertMp3ToWav } from './audioConversion.mjs'

export const MAX_SOUND_SOURCE_BYTES = 128 * 1024 * 1024
export const MAX_SOUND_OUTPUT_BYTES = 512 * 1024 * 1024

const readAt = async (handle, length, position) => {
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await handle.read(buffer, 0, length, position)
  return buffer.subarray(0, bytesRead)
}

export const readWavMetadata = async (filePath) => {
  const details = await stat(filePath)
  if (!details.isFile() || details.size < 44 || details.size > MAX_SOUND_OUTPUT_BYTES) {
    throw new Error('Le WAV est vide, trop grand ou invalide.')
  }
  const handle = await open(filePath, 'r')
  try {
    const header = await readAt(handle, 12, 0)
    if (header.length !== 12 || header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') {
      throw new Error('Le fichier sélectionné n’est pas un vrai WAV RIFF.')
    }
    let cursor = 12
    let format = null
    let dataBytes = 0
    let chunks = 0
    while (cursor + 8 <= details.size && chunks < 10_000 && (!format || !dataBytes)) {
      const chunkHeader = await readAt(handle, 8, cursor)
      if (chunkHeader.length !== 8) break
      const chunkId = chunkHeader.toString('ascii', 0, 4)
      const chunkSize = chunkHeader.readUInt32LE(4)
      const chunkStart = cursor + 8
      if (chunkStart + chunkSize > details.size + 1) throw new Error('Le WAV contient un bloc tronqué.')
      if (chunkId === 'fmt ') {
        const fmt = await readAt(handle, Math.min(chunkSize, 40), chunkStart)
        if (fmt.length < 16) throw new Error('Le format audio du WAV est incomplet.')
        const formatCode = fmt.readUInt16LE(0)
        const channels = fmt.readUInt16LE(2)
        const sampleRate = fmt.readUInt32LE(4)
        const byteRate = fmt.readUInt32LE(8)
        const blockAlign = fmt.readUInt16LE(12)
        const bitDepth = fmt.readUInt16LE(14)
        if (![1, 3, 65_534].includes(formatCode)
          || channels < 1 || channels > 8
          || sampleRate < 8_000 || sampleRate > 384_000
          || byteRate < 1 || blockAlign < 1
          || bitDepth < 8 || bitDepth > 64) {
          throw new Error('Le format PCM du WAV n’est pas pris en charge.')
        }
        format = { formatCode, channels, sampleRate, byteRate, bitDepth }
      } else if (chunkId === 'data') {
        dataBytes = chunkSize
      }
      cursor = chunkStart + chunkSize + (chunkSize % 2)
      chunks += 1
    }
    if (!format || !dataBytes) throw new Error('Le WAV ne contient pas de piste audio exploitable.')
    const durationSeconds = dataBytes / format.byteRate
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 1_800.5) {
      throw new Error('La durée du son doit être comprise entre un instant et trente minutes.')
    }
    return {
      ...format,
      durationSeconds,
      sizeBytes: details.size,
    }
  } finally {
    await handle.close()
  }
}

const hashFile = async (filePath) => {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath, { highWaterMark: 256 * 1024 })) hash.update(chunk)
  return hash.digest('hex')
}

const copyAndHash = async (sourcePath, destinationPath) => {
  const hash = createHash('sha256')
  const hasher = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk)
      callback(null, chunk)
    },
  })
  await pipeline(
    createReadStream(sourcePath, { highWaterMark: 256 * 1024 }),
    hasher,
    createWriteStream(destinationPath, { flags: 'wx' }),
  )
  return hash.digest('hex')
}

export const processSoundFile = async ({ sourcePath, destinationPath, originalDestinationPath = '', format, ffmpegExecutable = '' }) => {
  const sourceDetails = await lstat(sourcePath)
  if (!sourceDetails.isFile() || sourceDetails.isSymbolicLink() || sourceDetails.size < 1 || sourceDetails.size > MAX_SOUND_SOURCE_BYTES) {
    throw new Error('Le fichier audio sélectionné est invalide ou dépasse 128 Mo.')
  }
  try {
    let sourceSha256 = ''
    if (format === 'MP3') {
      sourceSha256 = originalDestinationPath
        ? await copyAndHash(sourcePath, originalDestinationPath)
        : await hashFile(sourcePath)
      await convertMp3ToWav({ sourcePath: originalDestinationPath || sourcePath, destinationPath, ffmpegExecutable })
    } else if (format === 'WAV') {
      sourceSha256 = await copyAndHash(sourcePath, destinationPath)
    } else {
      throw new Error('Seuls les fichiers WAV et MP3 sont acceptés.')
    }
    const metadata = await readWavMetadata(destinationPath)
    const outputSha256 = format === 'WAV' ? sourceSha256 : await hashFile(destinationPath)
    return { ...metadata, sourceSha256, outputSha256, converted: format === 'MP3' }
  } catch (error) {
    await rm(destinationPath, { force: true }).catch(() => undefined)
    if (originalDestinationPath) await rm(originalDestinationPath, { force: true }).catch(() => undefined)
    throw error
  }
}
