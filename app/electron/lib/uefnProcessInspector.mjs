import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const UEFN_PROCESS = /^UnrealEditorFortnite-Win64-Shipping\.exe$/i

export const parseListeningPorts = (stdout = '') => {
  const listeners = new Map()
  for (const line of String(stdout).split(/\r?\n/)) {
    const match = line.match(/^\s*TCP\s+127\.0\.0\.1:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i)
    if (!match) continue
    listeners.set(Number.parseInt(match[1], 10), Number.parseInt(match[2], 10))
  }
  return listeners
}
export const parseTasklist = (stdout = '') => {
  const processes = new Map()
  for (const line of String(stdout).split(/\r?\n/)) {
    const match = line.match(/^"((?:[^"]|"")*)","(\d+)"/)
    if (!match) continue
    processes.set(Number.parseInt(match[2], 10), match[1].replaceAll('""', '"'))
  }
  return processes
}

const loadProcessSnapshot = async () => {
  if (process.platform !== 'win32') return { listeners: new Map(), processes: new Map() }
  try {
    const [{ stdout: netstat }, { stdout: tasklist }] = await Promise.all([
      execFileAsync('netstat.exe', ['-ano', '-p', 'tcp'], { windowsHide: true, timeout: 2_500 }),
      execFileAsync('tasklist.exe', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 2_500 }),
    ])
    return { listeners: parseListeningPorts(netstat), processes: parseTasklist(tasklist) }
  } catch {
    return { listeners: new Map(), processes: new Map() }
  }
}

export const createUefnPortOwnershipVerifier = ({ cacheMs = 1_000, snapshot = loadProcessSnapshot } = {}) => {
  let snapshotPromise = null
  let loadedAt = 0
  return async (port) => {
    const now = Date.now()
    if (!snapshotPromise || now - loadedAt > cacheMs) {
      loadedAt = now
      snapshotPromise = snapshot()
    }
    const { listeners, processes } = await snapshotPromise
    const pid = listeners.get(port)
    const processName = processes.get(pid) || ''
    return {
      verified: Boolean(pid && UEFN_PROCESS.test(processName)),
      pid: pid || null,
      processName,
    }
  }
}
