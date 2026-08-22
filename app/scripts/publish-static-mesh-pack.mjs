import { execFile } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { publishManagedStaticMeshPack } from '../electron/lib/managedStaticMeshPackPublisher.mjs'
import { studioVaultRoot } from '../electron/lib/studioPaths.mjs'
import { rebuildLibraryIndexes } from './rebuild-library-index.mjs'

const execFileAsync = promisify(execFile)
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.dirname(scriptDirectory)

const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : ''
}

const packKey = valueAfter('--pack')
const sourceRoot = valueAfter('--source')
const blenderOverride = valueAfter('--blender') || process.env.NOBLESSE_BLENDER_EXECUTABLE || ''
if (!packKey || !sourceRoot) {
  throw new Error('Usage : node scripts/publish-static-mesh-pack.mjs --pack <clé> --source <dossier> [--blender <blender.exe>]')
}

const registry = JSON.parse(await readFile(path.join(appRoot, 'electron', 'data', 'managed-static-mesh-packs.v1.json'), 'utf8'))
const definition = registry.packs?.find((pack) => pack.key === packKey)
if (!definition) throw new Error(`Pack inconnu : ${packKey}`)

const blenderCandidates = [
  blenderOverride,
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Blender Foundation', 'Blender 4.3', 'blender.exe'),
].filter(Boolean)
let blenderExecutable = ''
for (const candidate of blenderCandidates) {
  try {
    await access(candidate)
    blenderExecutable = candidate
    break
  } catch {
    // Continue with the next bounded candidate.
  }
}
if (!blenderExecutable) throw new Error('Blender 4.3 est introuvable. Utilise --blender avec son chemin explicite.')

const blenderScript = path.join(scriptDirectory, 'blender', 'export-static-mesh-preview.py')
const result = await publishManagedStaticMeshPack({
  definition,
  sourceRoot: path.resolve(sourceRoot),
  vaultRoot: studioVaultRoot(),
  rebuildIndexes: rebuildLibraryIndexes,
  buildPreview: async ({ sourceBlend, destinationGlb }) => {
    const { stdout, stderr } = await execFileAsync(blenderExecutable, [
      '--background', '--factory-startup', '--python', blenderScript, '--', sourceBlend, destinationGlb,
    ], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
    if (stderr?.trim()) process.stderr.write(stderr)
    if (!stdout.includes('NOBLESSE_PREVIEW_GLB=')) throw new Error('Blender n’a pas confirmé la génération du GLB.')
  },
})

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
