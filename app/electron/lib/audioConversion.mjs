import { lstat, realpath } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

const FFMPEG_NAME = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
const MAX_ERROR_TEXT = 4_000

const existingExecutable = async (candidate) => {
  if (!candidate || path.basename(candidate).toLocaleLowerCase('en') !== FFMPEG_NAME) return ''
  try {
    const details = await lstat(candidate)
    if (!details.isFile() || details.isSymbolicLink()) return ''
    return realpath(candidate)
  } catch {
    return ''
  }
}

export const discoverFfmpegExecutable = async ({
  override = '',
  pathValue = process.env.Path || process.env.PATH || '',
} = {}) => {
  const candidates = []
  if (override) candidates.push(path.resolve(override))
  for (const entry of String(pathValue).split(path.delimiter)) {
    const folder = entry.trim().replace(/^"|"$/gu, '')
    if (folder) candidates.push(path.join(folder, FFMPEG_NAME))
  }
  for (const candidate of [...new Set(candidates)]) {
    const executable = await existingExecutable(candidate)
    if (executable) return executable
  }
  return ''
}

export const ffmpegMp3ToWavArguments = (sourcePath, destinationPath) => Object.freeze([
  '-nostdin',
  '-hide_banner',
  '-loglevel', 'error',
  '-protocol_whitelist', 'file,pipe',
  '-i', sourcePath,
  '-map', '0:a:0',
  '-map_metadata', '-1',
  '-vn',
  '-sn',
  '-dn',
  '-t', '1800',
  '-acodec', 'pcm_s24le',
  '-ar', '48000',
  '-fs', '536870912',
  '-f', 'wav',
  '-n',
  destinationPath,
])

export const convertMp3ToWav = ({
  sourcePath,
  destinationPath,
  ffmpegExecutable,
  spawnProcess = spawn,
  timeoutMs = 180_000,
}) => new Promise((resolve, reject) => {
  if (!ffmpegExecutable) {
    reject(new Error('Le convertisseur MP3 est indisponible. Installe FFmpeg ou configure NOBLESSE_FFMPEG_EXECUTABLE.'))
    return
  }
  const child = spawnProcess(ffmpegExecutable, ffmpegMp3ToWavArguments(sourcePath, destinationPath), {
    windowsHide: true,
    shell: false,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let errorText = ''
  child.stderr?.on('data', (chunk) => {
    if (errorText.length < MAX_ERROR_TEXT) errorText += String(chunk).slice(0, MAX_ERROR_TEXT - errorText.length)
  })
  const timer = setTimeout(() => {
    child.kill()
    reject(new Error('La conversion MP3 a dépassé trois minutes et a été arrêtée.'))
  }, timeoutMs)
  timer.unref?.()
  child.once('error', (error) => {
    clearTimeout(timer)
    reject(new Error(`Le convertisseur MP3 ne peut pas démarrer : ${error.message}`))
  })
  child.once('close', (code) => {
    clearTimeout(timer)
    if (code === 0) resolve()
    else reject(new Error(`Conversion MP3 impossible${errorText.trim() ? ` : ${errorText.trim()}` : '.'}`))
  })
})
