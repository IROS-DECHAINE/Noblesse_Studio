import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { studioVaultRoot } from '../electron/lib/studioPaths.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '..')
const publicData = resolve(appRoot, 'public', 'data')
const vaultRoot = studioVaultRoot()
const catalogFile = resolve(vaultRoot, 'catalog.json')
const integrityFile = resolve(vaultRoot, 'integrity.json')

await mkdir(publicData, { recursive: true })

const [catalog, integrity] = await Promise.all([
  readFile(catalogFile, 'utf8').then(JSON.parse),
  readFile(integrityFile, 'utf8').then(JSON.parse),
])

if (integrity.status !== 'PASS') throw new Error('Le Vault canonique n\'a pas un statut PASS.')
if (!Array.isArray(catalog.assets) || catalog.assets.length !== integrity.assetCount) {
  throw new Error('Le catalogue et le reçu d\'intégrité ne portent pas le même nombre d\'assets.')
}

// Cette copie JSON sert uniquement au mode web de développement. Les aperçus
// restent dans le Vault et sont servis à la demande; ils ne sont plus dupliqués
// dans public/ ni dans le bundle Electron.
await copyFile(catalogFile, resolve(publicData, 'vault-assets.json'))

console.log(`Synced ${catalog.assets.length} Noblesse Studio assets from ${vaultRoot}.`)
