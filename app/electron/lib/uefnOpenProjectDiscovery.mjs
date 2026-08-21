import { execFile } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const ACTIVE_LOG_PATTERN = /^UnrealEditorFortnite(?:_\d+)?\.log$/i
const PROJECT_PATTERNS = [
  // A Windows project path may contain an apostrophe (for example
  // D:\DON'T_TOUCH...). The descriptor suffix is the reliable delimiter.
  /LogValkyrie: Display: Successfully opened project '([^\r\n]+?\.uefnproject)'/gi,
  /LogValkyrie: Opening project '([^\r\n]+?\.uefnproject)'/gi,
]

const lastMatch = (content, pattern) => {
  let value = ''
  for (const match of content.matchAll(pattern)) value = match[1]
  return value
}

export const extractLastOpenedProject = (content = '') => {
  for (const pattern of PROJECT_PATTERNS) {
    const value = lastMatch(String(content), pattern)
    if (value) return value.replaceAll('/', path.sep)
  }
  return ''
}

export const extractMcpIssue = (content = '') => {
  let port = null
  for (const match of String(content).matchAll(/HttpListener unable to bind to 127\.0\.0\.1:(\d+)/gi)) {
    port = Number.parseInt(match[1], 10)
  }
  return port ? { code: 'PORT_CONFLICT', port } : null
}

const listUefnProcessIds = async () => {
  if (process.platform !== 'win32') return []
  try {
    const { stdout } = await execFileAsync('tasklist.exe', [
      '/FI',
      'IMAGENAME eq UnrealEditorFortnite-Win64-Shipping.exe',
      '/FO',
      'CSV',
      '/NH',
    ], { windowsHide: true, timeout: 2_000 })
    return String(stdout)
      .split(/\r?\n/)
      .filter((line) => /UnrealEditorFortnite-Win64-Shipping\.exe/i.test(line))
      .map((line) => Number.parseInt(line.match(/^"[^"]+","(\d+)"/)?.[1] || '', 10))
      .filter(Number.isInteger)
  } catch {
    return []
  }
}

export const discoverOpenUefnProjects = async ({
  logsDirectory = path.join(os.homedir(), 'AppData', 'Local', 'UnrealEditorFortnite', 'Saved', 'Logs'),
  processIds = listUefnProcessIds,
} = {}) => {
  const pids = await processIds()
  if (!pids.length) return []

  try {
    const entries = await readdir(logsDirectory, { withFileTypes: true })
    const candidates = await Promise.all(entries
      .filter((entry) => entry.isFile() && ACTIVE_LOG_PATTERN.test(entry.name))
      .map(async (entry) => {
        const file = path.join(logsDirectory, entry.name)
        return { file, modifiedAt: (await stat(file)).mtimeMs }
      }))
    const activeLogs = candidates
      .toSorted((left, right) => right.modifiedAt - left.modifiedAt)
      .slice(0, pids.length)
    const projects = []
    const seen = new Set()

    for (const [index, log] of activeLogs.entries()) {
      const content = await readFile(log.file, 'utf8')
      const projectPath = extractLastOpenedProject(content)
      if (!projectPath) continue
      const mount = path.basename(projectPath, path.extname(projectPath))
      const key = mount.toLocaleLowerCase('en-US')
      if (!mount || seen.has(key)) continue
      seen.add(key)
      projects.push({
        id: `uefn:${key}`,
        mount,
        name: mount,
        path: projectPath,
        folder: path.dirname(projectPath),
        opened: true,
        processId: pids[index] || null,
        logFile: log.file,
        mcpIssue: extractMcpIssue(content),
      })
    }
    return projects
  } catch {
    return []
  }
}
