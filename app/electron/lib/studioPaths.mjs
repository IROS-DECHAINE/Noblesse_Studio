import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const moduleCodeRoot = path.resolve(currentDir, '..', '..')
const moduleAppRoot = path.basename(moduleCodeRoot).toLocaleLowerCase('en') === 'app'
  ? path.dirname(moduleCodeRoot)
  : moduleCodeRoot

export const NOBLESSE_APP_FOLDER = 'Noblesse Studio App'
export const DEFAULT_STUDIO_ROOT = 'D:\\NO_BLESSE Studio'

const configuredPath = (name) => {
  const value = String(process.env[name] || '').trim()
  return value ? path.resolve(value) : ''
}

export const studioRoot = () => configuredPath('NOBLESSE_STUDIO_ROOT') || DEFAULT_STUDIO_ROOT

export const studioAppRoot = () => {
  const configured = configuredPath('NOBLESSE_APP_ROOT')
  if (configured) return configured

  if (path.basename(moduleAppRoot).toLocaleLowerCase('en') === NOBLESSE_APP_FOLDER.toLocaleLowerCase('en')) {
    return moduleAppRoot
  }

  const canonical = path.join(studioRoot(), NOBLESSE_APP_FOLDER)
  return existsSync(canonical) ? canonical : moduleAppRoot
}

export const studioDataRoot = () => configuredPath('NOBLESSE_DATA_ROOT') || path.join(studioAppRoot(), 'data')
export const studioStateRoot = () => path.join(studioDataRoot(), 'state')
export const studioRuntimeRoot = () => path.join(studioDataRoot(), 'runtime', 'electron-user-data')
export const studioDatabaseFile = () => path.join(studioDataRoot(), 'database', 'noblesse-studio.db')
export const studioBackupsRoot = () => configuredPath('NOBLESSE_BACKUP_ROOT') || path.join(studioDataRoot(), 'backups', 'repository-v1')
export const studioOperationsRoot = () => path.join(studioStateRoot(), 'operations')

export const studioLibraryRoot = () => configuredPath('NOBLESSE_LIBRARY_ROOT') || path.join(studioAppRoot(), 'library')
export const studioVaultRoot = () => configuredPath('NOBLESSE_VAULT_ROOT') || path.join(studioLibraryRoot(), 'storage')
export const studioDocumentsRoot = () => configuredPath('NOBLESSE_DOCUMENT_ROOT') || path.join(studioRoot(), 'Documents')
export const studioUnrealRoot = () => configuredPath('NOBLESSE_UNREAL_PROJECT_ROOT') || path.join(studioRoot(), 'Unreal')
export const studioUefnEditorExecutable = () => configuredPath('NOBLESSE_UEFN_EDITOR_EXECUTABLE')

export const studioUefnProjectRoots = () => {
  const configured = String(process.env.NOBLESSE_UEFN_PROJECT_ROOTS || '').trim()
  if (configured) return configured.split(path.delimiter).map((item) => path.resolve(item)).filter(Boolean)
  return [path.join(studioRoot(), 'Fortnite')]
}

export const describeStudioPaths = () => ({
  studioRoot: studioRoot(),
  appRoot: studioAppRoot(),
  dataRoot: studioDataRoot(),
  stateRoot: studioStateRoot(),
  runtimeRoot: studioRuntimeRoot(),
  databaseFile: studioDatabaseFile(),
  backupsRoot: studioBackupsRoot(),
  operationsRoot: studioOperationsRoot(),
  libraryRoot: studioLibraryRoot(),
  vaultRoot: studioVaultRoot(),
  documentsRoot: studioDocumentsRoot(),
  unrealRoot: studioUnrealRoot(),
  uefnEditorExecutableOverride: studioUefnEditorExecutable(),
  uefnProjectRoots: studioUefnProjectRoots(),
})
