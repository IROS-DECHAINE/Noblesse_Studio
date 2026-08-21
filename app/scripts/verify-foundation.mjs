import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  describeStudioPaths,
  NOBLESSE_APP_FOLDER,
  studioAppRoot,
  studioDatabaseFile,
  studioLibraryRoot,
  studioVaultRoot,
} from '../electron/lib/studioPaths.mjs'

const readJson = async (file) => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

const appRoot = studioAppRoot()
const libraryRoot = studioLibraryRoot()
const vaultRoot = studioVaultRoot()
const databaseFile = studioDatabaseFile()

if (path.basename(appRoot).toLocaleLowerCase('en') !== NOBLESSE_APP_FOLDER.toLocaleLowerCase('en')) {
  throw new Error(`La racine active n’est pas ${NOBLESSE_APP_FOLDER}: ${appRoot}`)
}

const required = [
  'README.md',
  'AGENTS.md',
  '.gitignore',
  'app/package.json',
  'config/studio-paths.v1.json',
  'app/electron/main.mjs',
  'app/electron/preload.cjs',
  'app/src',
  'app/shared',
  'app/scripts',
  'data/README.md',
  'library/INDEX.md',
  'library/index.json',
  'library/DEPENDENCIES.md',
  'library/dependencies.json',
  'library/assets/index.json',
  'library/textures/index.json',
  'library/materials/index.json',
  'library/documents/index.json',
  'library/storage/catalog.json',
  'library/storage/integrity.json',
]
for (const relativePath of required) await access(path.join(appRoot, relativePath))
await access(databaseFile)

const [catalogBuffer, integrity, master, dependencies, assets, textures, materials, documents] = await Promise.all([
  readFile(path.join(vaultRoot, 'catalog.json')),
  readJson(path.join(vaultRoot, 'integrity.json')),
  readJson(path.join(libraryRoot, 'index.json')),
  readJson(path.join(libraryRoot, 'dependencies.json')),
  readJson(path.join(libraryRoot, 'assets', 'index.json')),
  readJson(path.join(libraryRoot, 'textures', 'index.json')),
  readJson(path.join(libraryRoot, 'materials', 'index.json')),
  readJson(path.join(libraryRoot, 'documents', 'index.json')),
])
const catalog = JSON.parse(catalogBuffer.toString('utf8').replace(/^\uFEFF/, ''))

if (integrity.status !== 'PASS') throw new Error('Le Vault n’est pas PASS.')
if (sha256(catalogBuffer) !== integrity.catalogSha256) throw new Error('Le hash du catalogue a changé.')
if (catalog.assets.length !== integrity.assetCount) throw new Error('Le total catalogue/intégrité diffère.')
if (new Set(catalog.assets.map((item) => item.asset_id)).size !== catalog.assets.length) throw new Error('Des IDs de bibliothèque sont dupliqués.')

const indexedLibraryTotal = assets.count + textures.count + materials.count
if (indexedLibraryTotal !== catalog.assets.length) throw new Error('Tous les éléments du catalogue ne sont pas classés.')
if (master.totalLibraryItems !== catalog.assets.length || master.totalDocuments !== documents.count) {
  throw new Error('L’index maître ne correspond pas aux index de catégorie.')
}

if (master.schemaVersion < 2 || dependencies.schemaVersion !== 1 || dependencies.nodeCount !== catalog.assets.length) {
  throw new Error('Le graphe de dépendances ou le schéma maître est obsolète.')
}
if (master.storage.managed + master.storage.references !== catalog.assets.length) {
  throw new Error('Tous les éléments doivent déclarer un mode de stockage explicite.')
}
for (const item of [...assets.items, ...textures.items, ...materials.items]) {
  if (!['MANAGED', 'REFERENCE'].includes(item.storageMode)) throw new Error(`Mode de stockage invalide : ${item.id}`)
  if (item.storageMode === 'MANAGED' && !item.storagePath.startsWith('library/storage/')) throw new Error(`Emplacement géré invalide : ${item.id}`)
  if (item.storageMode === 'REFERENCE' && item.storagePath) throw new Error(`Une référence externe ne doit pas devenir un chemin de stockage : ${item.id}`)
}
if (dependencies.edgeCount !== dependencies.edges.length || dependencies.resolvedEdgeCount + dependencies.unresolvedEdgeCount !== dependencies.edgeCount) {
  throw new Error('Les compteurs du graphe de dépendances sont incohérents.')
}

const db = new DatabaseSync(databaseFile, { readOnly: true })
let databaseCounts
try {
  databaseCounts = {
    libraryItems: Number(db.prepare('SELECT COUNT(*) AS count FROM library_items').get().count),
    documents: Number(db.prepare('SELECT COUNT(*) AS count FROM documents').get().count),
    migrations: Number(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count),
    maxMigration: Number(db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version),
    relations: Number(db.prepare('SELECT COUNT(*) AS count FROM library_relations').get().count),
    revisions: Number(db.prepare('SELECT COUNT(*) AS count FROM document_revisions').get().count),
    managedItems: Number(db.prepare("SELECT COUNT(*) AS count FROM library_items WHERE storage_mode = 'MANAGED'").get().count),
    referenceItems: Number(db.prepare("SELECT COUNT(*) AS count FROM library_items WHERE storage_mode = 'REFERENCE'").get().count),
  }
} finally {
  db.close()
}

if (databaseCounts.libraryItems !== catalog.assets.length) throw new Error('La base SQLite ne contient pas tous les éléments de bibliothèque.')
if (databaseCounts.documents !== documents.count) throw new Error('La base SQLite ne contient pas tous les documents indexés.')
if (databaseCounts.migrations < 2 || databaseCounts.maxMigration < 2) throw new Error('La base SQLite n’a pas toutes ses migrations enregistrées.')
if (databaseCounts.relations !== dependencies.edgeCount) throw new Error('La base SQLite ne contient pas toutes les relations indexées.')
if (databaseCounts.managedItems !== master.storage.managed || databaseCounts.referenceItems !== master.storage.references) throw new Error('Les modes de stockage SQLite ne correspondent pas aux index.')

console.log(JSON.stringify({
  status: 'PASS',
  paths: describeStudioPaths(),
  counts: {
    assets: assets.count,
    textures: textures.count,
    materials: materials.count,
    documents: documents.count,
    database: databaseCounts,
  },
  integrity: {
    catalogSha256: integrity.catalogSha256,
    checkedFileCount: integrity.checkedFileCount,
    missingFileCount: integrity.missingFileCount,
    hashMismatchCount: integrity.hashMismatchCount,
  },
}, null, 2))
