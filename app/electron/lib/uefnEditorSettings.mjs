import { constants as fsConstants } from 'node:fs'
import { access, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

const VALKYRIE_SECTION = '/Script/ValkyrieEditor.ValkyrieEditorConfig'
const MCP_SECTION = '/Script/ModelContextProtocolEngine.ModelContextProtocolSettings'
const DEFAULT_SETTINGS_FILE = path.join(
  process.env.LOCALAPPDATA || '',
  'UnrealEditorFortnite',
  'Saved',
  'Config',
  'WindowsEditor',
  'EditorPerProjectUserSettings.ini',
)

const normalizeDescriptor = (value) => String(value || '').trim().replaceAll('\\', '/')

const ensureSafeIniValue = (value, label) => {
  if (!value || /[\r\n,\0]/.test(value)) {
    throw new Error(`${label} ne peut pas être transmis aux préférences UEFN.`)
  }
  return value
}

const sectionBounds = (lines, section) => {
  const header = `[${section}]`.toLocaleLowerCase('en-US')
  const start = lines.findIndex((line) => line.trim().toLocaleLowerCase('en-US') === header)
  if (start < 0) return null
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\[[^\]]+\]\s*$/.test(lines[index])) {
      end = index
      break
    }
  }
  return { start, end }
}

const setSectionValues = (sourceLines, section, values) => {
  const lines = [...sourceLines]
  let bounds = sectionBounds(lines, section)
  if (!bounds) {
    if (lines.length && lines.at(-1) !== '') lines.push('')
    lines.push(`[${section}]`)
    bounds = { start: lines.length - 1, end: lines.length }
  }

  for (const [key, value] of Object.entries(values)) {
    const prefix = `${key}=`
    let index = -1
    for (let cursor = bounds.start + 1; cursor < bounds.end; cursor += 1) {
      if (lines[cursor].trimStart().toLocaleLowerCase('en-US').startsWith(prefix.toLocaleLowerCase('en-US'))) {
        index = cursor
        break
      }
    }
    if (index >= 0) {
      lines[index] = `${key}=${value}`
      continue
    }
    lines.splice(bounds.end, 0, `${key}=${value}`)
    bounds.end += 1
  }
  return lines
}

export const patchUefnEditorSettings = (source, {
  descriptorPath,
  port,
  urlPath = '/mcp',
} = {}) => {
  const descriptor = ensureSafeIniValue(normalizeDescriptor(descriptorPath), 'Le chemin du projet')
  const normalizedUrlPath = ensureSafeIniValue(String(urlPath || '').trim(), 'Le chemin MCP')
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Le port MCP UEFN est invalide.')
  }

  const text = String(source || '').replace(/^\uFEFF/, '')
  const lineEnding = text.includes('\r\n') ? '\r\n' : '\n'
  const hadTrailingLineEnding = /\r?\n$/.test(text)
  let lines = text ? text.split(/\r?\n/) : []
  if (hadTrailingLineEnding && lines.at(-1) === '') lines.pop()

  lines = setSectionValues(lines, VALKYRIE_SECTION, {
    bStartupWithLastProject: 'True',
    LastProjectFileName: descriptor,
  })
  lines = setSectionValues(lines, MCP_SECTION, {
    ServerUrlPath: normalizedUrlPath,
    ServerPortNumber: String(port),
    bAutoStartServer: 'True',
    bEnableToolSearch: 'True',
  })
  return `${lines.join(lineEnding)}${hadTrailingLineEnding || lines.length ? lineEnding : ''}`
}

const atomicWrite = async (file, payload) => {
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, payload, 'utf8')
  await rename(temporary, file)
}

const fileExists = async (file) => {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

export const prepareUefnEditorLaunchSettings = async ({
  descriptorPath,
  port,
  urlPath = '/mcp',
  settingsFile = DEFAULT_SETTINGS_FILE,
  backupDirectory = '',
} = {}) => {
  if (!settingsFile) throw new Error('Le fichier de préférences UEFN est introuvable.')
  let current = ''
  try {
    current = await readFile(settingsFile, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const next = patchUefnEditorSettings(current, { descriptorPath, port, urlPath })
  if (next === current) return { changed: false, backupFile: '', fingerprint: createHash('sha256').update(next).digest('hex') }

  let backupFile = ''
  if (current && backupDirectory && await fileExists(settingsFile)) {
    const fingerprint = createHash('sha256').update(current).digest('hex')
    backupFile = path.join(backupDirectory, `EditorPerProjectUserSettings.${fingerprint.slice(0, 16)}.ini`)
    await mkdir(backupDirectory, { recursive: true })
    try {
      await copyFile(settingsFile, backupFile, fsConstants.COPYFILE_EXCL)
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
    }
  }
  await atomicWrite(settingsFile, next)
  return {
    changed: true,
    backupFile,
    fingerprint: createHash('sha256').update(next).digest('hex'),
  }
}

export const uefnEditorSettingsInternals = {
  DEFAULT_SETTINGS_FILE,
  MCP_SECTION,
  VALKYRIE_SECTION,
  normalizeDescriptor,
  sectionBounds,
  setSectionValues,
}
