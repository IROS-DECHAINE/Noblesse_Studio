import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const extractUprojectPath = (commandLine = '') => {
  const text = String(commandLine || '')
  const quoted = text.match(/["']([^"']+\.uproject)["']/i)?.[1]
  if (quoted) return quoted
  return text.match(/(?:^|\s)([^\s]+\.uproject)(?:\s|$)/i)?.[1] || ''
}

export const normalizeProjectDescriptorPath = (value = '') => {
  const descriptor = String(value || '').trim()
  return descriptor ? path.resolve(descriptor).toLocaleLowerCase('en-US') : ''
}

const parseProcessPayload = (stdout = '') => {
  const raw = String(stdout || '').trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return []
  }
}

export const discoverOpenUnrealProjects = async ({ run = execFileAsync } = {}) => {
  if (process.platform !== 'win32') return []
  const command = [
    "$items = Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('UnrealEditor.exe','UnrealEditor-Win64-Shipping.exe') } | Select-Object ProcessId,CommandLine",
    '$items | ConvertTo-Json -Compress',
  ].join('; ')
  try {
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      windowsHide: true,
      timeout: 3_000,
    })
    return parseProcessPayload(stdout)
      .map((item) => ({
        processId: Number.parseInt(item?.ProcessId, 10) || null,
        path: extractUprojectPath(item?.CommandLine),
      }))
      .filter((item) => item.path)
  } catch {
    return []
  }
}

export const unrealOpenProjectInternals = { parseProcessPayload }
