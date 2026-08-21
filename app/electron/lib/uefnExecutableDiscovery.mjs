import { access, readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const UEFN_EXECUTABLE_NAME = 'UnrealEditorFortnite-Win64-Shipping.exe'
const DEFAULT_MANIFESTS_DIRECTORY = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'

const exists = async (file) => {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

export const executableFromEpicManifest = (manifest) => {
  if (String(manifest?.AppName || '').trim() !== 'Fortnite_Studio') return ''
  const installLocation = String(manifest?.InstallLocation || '').trim()
  const launchExecutable = String(manifest?.LaunchExecutable || '').trim()
  if (!installLocation || !launchExecutable) return ''
  const candidate = path.resolve(installLocation, launchExecutable.replaceAll('/', path.sep))
  return path.basename(candidate).toLocaleLowerCase('en-US') === UEFN_EXECUTABLE_NAME.toLocaleLowerCase('en-US')
    ? candidate
    : ''
}

export const discoverUefnEditorExecutable = async ({
  override = '',
  manifestsDirectory = DEFAULT_MANIFESTS_DIRECTORY,
  fileExists = exists,
  listManifests = readdir,
  loadManifest = readFile,
  fileStat = stat,
} = {}) => {
  const configured = String(override || '').trim()
  if (configured) {
    const candidate = path.resolve(configured)
    if (path.basename(candidate).toLocaleLowerCase('en-US') !== UEFN_EXECUTABLE_NAME.toLocaleLowerCase('en-US')) {
      throw new Error('L\u2019exécutable UEFN configuré n\u2019est pas autorisé.')
    }
    if (!await fileExists(candidate)) throw new Error('L\u2019exécutable UEFN configuré est introuvable.')
    return candidate
  }

  let entries
  try {
    entries = await listManifests(manifestsDirectory, { withFileTypes: true })
  } catch {
    throw new Error('Installation UEFN introuvable dans Epic Games Launcher.')
  }
  const candidates = []
  for (const entry of entries) {
    const name = typeof entry === 'string' ? entry : entry.name
    const isFile = typeof entry === 'string' || entry.isFile()
    if (!isFile || !/\.item$/i.test(name)) continue
    const file = path.join(manifestsDirectory, name)
    try {
      const payload = JSON.parse(String(await loadManifest(file, 'utf8')).replace(/^\uFEFF/, ''))
      const executable = executableFromEpicManifest(payload)
      if (!executable || !await fileExists(executable)) continue
      const metadata = await fileStat(file)
      candidates.push({ executable, modifiedAt: Number(metadata.mtimeMs) || 0 })
    } catch {
      // A stale or unrelated Epic manifest must not block valid installations.
    }
  }
  candidates.sort((left, right) => right.modifiedAt - left.modifiedAt)
  if (!candidates.length) throw new Error('Installation UEFN valide introuvable dans Epic Games Launcher.')
  return candidates[0].executable
}

export const uefnExecutableDiscoveryInternals = {
  DEFAULT_MANIFESTS_DIRECTORY,
  UEFN_EXECUTABLE_NAME,
}
