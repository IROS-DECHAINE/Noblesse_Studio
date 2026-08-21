import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  studioAppRoot,
  studioDatabaseFile,
  studioDocumentsRoot,
  studioLibraryRoot,
  studioVaultRoot,
} from '../electron/lib/studioPaths.mjs'

export const rebuildLibraryIndexes = async () => {
const SCHEMA_VERSION = 2
const DEPENDENCY_SCHEMA_VERSION = 1
const UNRESOLVED_DEPENDENCY_MARKERS = new Set(['UNRESOLVED_LIVE_SOURCE_GRAPH_INSPECTION'])
const generatedAt = new Date().toISOString()
const appRoot = studioAppRoot()
const libraryRoot = studioLibraryRoot()
const vaultRoot = studioVaultRoot()
const documentsRoot = studioDocumentsRoot()
const databaseFile = studioDatabaseFile()

const exists = async (target) => {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

const readJson = async (file) => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')
const slash = (value) => String(value || '').replaceAll('\\', '/')
const markdown = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')

const dependencyReferences = (value) => {
  const values = Array.isArray(value) ? value : String(value || '').split(/[;,\n]/u)
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))]
}

const atomicWrite = async (file, content) => {
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}`
  await writeFile(temporary, content, 'utf8')
  await rename(temporary, file)
}

const categoryFor = (assetType) => {
  if (assetType === 'Texture2D') return 'textures'
  if (['Material', 'MaterialRecipe', 'MaterialReference', 'UnrealMaterialInstance'].includes(assetType)) return 'materials'
  if (['SoundWave', 'Audio', 'AudioClip'].includes(assetType)) return 'sounds'
  return 'assets'
}

const storagePathFor = (asset) => {
  if (asset.source) return slash(path.join('library', 'storage', asset.source))
  if (asset.asset_type === 'MaterialRecipe') {
    return `library/storage/packs/${asset.pack_id}/recipes.json#${asset.asset_id}`
  }
  return ''
}

const normalizeAsset = (asset) => {
  const category = categoryFor(asset.asset_type)
  return {
    id: asset.asset_id,
    name: asset.display_name,
    category,
    type: asset.asset_type,
    version: String(asset.pack_version || '1'),
    status: asset.status || 'UNKNOWN',
    packId: asset.pack_id || '',
    hash: asset.source_sha256 || asset.preview_sha256 || '',
    storageMode: asset.source || asset.asset_type === 'MaterialRecipe' ? 'MANAGED' : 'REFERENCE',
    storagePath: storagePathFor(asset),
    previewPath: asset.preview_source ? slash(path.join('library', 'storage', asset.preview_source)) : '',
    sourceOrigin: slash(asset.source_origin || asset.source_path || asset.source_project || ''),
    licenseEvidence: slash(asset.license_evidence || ''),
    platforms: Array.isArray(asset.platforms) ? asset.platforms : [],
    dependencies: dependencyReferences(asset.dependencies),
    tags: [asset.asset_type, asset.category, asset.surface_group, asset.group_label, asset.pack_id].filter(Boolean),
  }
}

const normalizeDocument = (manifest, manifestFile) => {
  const revision = Number.isSafeInteger(manifest.revision) ? manifest.revision : 1
  const history = Array.isArray(manifest.history) && manifest.history.length
    ? manifest.history
    : [{
        revision: 1,
        action: 'BASELINE',
        at: manifest.createdAt || manifest.updatedAt,
        sha256: manifest.sha256 || '',
        sizeBytes: Number(manifest.sizeBytes || 0),
        originalName: manifest.originalName || manifest.title,
      }]
  return {
    id: manifest.id,
    name: manifest.title,
    category: 'documents',
    type: manifest.kind || 'document',
    version: String(manifest.schemaVersion || 1),
    revision,
    history,
    status: manifest.deletedAt ? 'DELETED' : (manifest.canonicalStatus || 'REFERENCE'),
    projectId: manifest.projectId || '',
    hash: manifest.sha256 || '',
    storagePath: slash(path.relative(appRoot, manifestFile)),
    sourceOrigin: slash(manifest.origin?.sourcePath || manifest.origin?.objectKey || ''),
    sizeBytes: Number(manifest.sizeBytes || 0),
    tags: Array.isArray(manifest.tags) ? manifest.tags : [],
    createdAt: manifest.createdAt || '',
    updatedAt: manifest.updatedAt || '',
  }
}

const catalogFile = path.join(vaultRoot, 'catalog.json')
const integrityFile = path.join(vaultRoot, 'integrity.json')
const [catalogBuffer, integrity] = await Promise.all([readFile(catalogFile), readJson(integrityFile)])
const catalog = JSON.parse(catalogBuffer.toString('utf8').replace(/^\uFEFF/, ''))

if (integrity.status !== 'PASS') throw new Error('Le Vault doit être PASS avant de reconstruire ses index.')
if (sha256(catalogBuffer) !== integrity.catalogSha256) throw new Error('Le hash du catalogue ne correspond pas au reçu d’intégrité.')
if (!Array.isArray(catalog.assets) || catalog.assets.length !== integrity.assetCount) {
  throw new Error('Le nombre d’assets du catalogue est incohérent.')
}

const items = catalog.assets.map(normalizeAsset)
const uniqueIds = new Set(items.map((item) => item.id))
if (uniqueIds.size !== items.length || items.some((item) => !item.id || !item.name)) {
  throw new Error('Chaque entrée de bibliothèque doit avoir un ID et un nom uniques.')
}

const assetsById = new Map(items.map((item) => [item.id, item]))
const assetIdsByName = new Map(items.map((item) => [item.name, item.id]))
const dependencyEdges = items.flatMap((item) => item.dependencies.map((reference) => {
  const marker = UNRESOLVED_DEPENDENCY_MARKERS.has(reference)
  const targetId = marker ? null : (assetsById.has(reference) ? reference : assetIdsByName.get(reference) || null)
  return {
    fromId: item.id,
    toId: targetId,
    reference,
    relationType: 'DEPENDS_ON',
    status: targetId ? 'RESOLVED' : 'UNRESOLVED',
  }
}))
const dependencyGraph = {
  schemaVersion: DEPENDENCY_SCHEMA_VERSION,
  generatedAt,
  nodeCount: items.length,
  edgeCount: dependencyEdges.length,
  resolvedEdgeCount: dependencyEdges.filter((edge) => edge.status === 'RESOLVED').length,
  unresolvedEdgeCount: dependencyEdges.filter((edge) => edge.status === 'UNRESOLVED').length,
  nodes: items.map((item) => ({ id: item.id, name: item.name, type: item.type, version: item.version })),
  edges: dependencyEdges,
}

const documentManifestRoot = path.join(documentsRoot, 'manifests')
const documents = []
if (await exists(documentManifestRoot)) {
  const entries = await readdir(documentManifestRoot, { withFileTypes: true })
  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name, 'fr'))) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const manifestFile = path.join(documentManifestRoot, entry.name)
    documents.push(normalizeDocument(await readJson(manifestFile), manifestFile))
  }
}

const documentIds = new Set(documents.map((item) => item.id))
if (documentIds.size !== documents.length || documents.some((item) => !item.id || !item.name)) {
  throw new Error('Chaque document indexé doit avoir un ID et un nom uniques.')
}

const categories = {
  assets: items.filter((item) => item.category === 'assets'),
  textures: items.filter((item) => item.category === 'textures'),
  materials: items.filter((item) => item.category === 'materials'),
  sounds: items.filter((item) => item.category === 'sounds'),
  documents,
}

for (const list of Object.values(categories)) {
  list.sort((left, right) => left.name.localeCompare(right.name, 'fr') || left.id.localeCompare(right.id, 'fr'))
}

const master = {
  schemaVersion: SCHEMA_VERSION,
  generatedAt,
  authority: {
    catalog: 'library/storage/catalog.json',
    integrity: 'library/storage/integrity.json',
    database: 'data/database/noblesse-studio.db',
    databaseRole: 'REBUILDABLE_INDEX',
    dependencies: 'library/dependencies.json',
  },
  integrity: {
    status: integrity.status,
    catalogSha256: integrity.catalogSha256,
    checkedFileCount: integrity.checkedFileCount,
    missingFileCount: integrity.missingFileCount,
    hashMismatchCount: integrity.hashMismatchCount,
  },
  counts: Object.fromEntries(Object.entries(categories).map(([key, list]) => [key, list.length])),
  totalLibraryItems: items.length,
  totalDocuments: documents.length,
  relations: {
    dependencyEdges: dependencyGraph.edgeCount,
    resolved: dependencyGraph.resolvedEdgeCount,
    unresolved: dependencyGraph.unresolvedEdgeCount,
  },
  storage: {
    managed: items.filter((item) => item.storageMode === 'MANAGED').length,
    references: items.filter((item) => item.storageMode === 'REFERENCE').length,
  },
  indexes: Object.keys(categories).map((category) => ({ category, json: `${category}/index.json`, human: `${category}/INDEX.md` })),
}

const categoryLabels = {
  assets: 'Assets',
  textures: 'Textures',
  materials: 'Matériaux',
  sounds: 'Sons',
  documents: 'Documents',
}

const categoryMarkdown = (category, list) => {
  const label = categoryLabels[category]
  const lines = [
    `# Index ${label}`,
    '',
    `Généré automatiquement le ${generatedAt}. Ne pas modifier ce fichier à la main.`,
    '',
    `Total : **${list.length}**`,
    '',
  ]
  if (!list.length) return `${lines.join('\n')}Aucune entrée pour le moment.\n`
  lines.push('| ID permanent | Nom | Type | Version | Statut | Mode | Emplacement |', '|---|---|---|---:|---|---|---|')
  for (const item of list) {
    lines.push(`| ${markdown(item.id)} | ${markdown(item.name)} | ${markdown(item.type)} | ${markdown(item.version)} | ${markdown(item.status)} | ${markdown(item.storageMode || 'MANAGED')} | ${markdown(item.storagePath || 'Référence externe — provenance conservée')} |`)
  }
  return `${lines.join('\n')}\n`
}

await mkdir(libraryRoot, { recursive: true })
for (const [category, list] of Object.entries(categories)) {
  const folder = path.join(libraryRoot, category)
  await atomicWrite(path.join(folder, 'index.json'), `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, generatedAt, category, count: list.length, items: list }, null, 2)}\n`)
  await atomicWrite(path.join(folder, 'INDEX.md'), categoryMarkdown(category, list))
}

await atomicWrite(path.join(libraryRoot, 'index.json'), `${JSON.stringify(master, null, 2)}\n`)
await atomicWrite(path.join(libraryRoot, 'dependencies.json'), `${JSON.stringify(dependencyGraph, null, 2)}\n`)
await atomicWrite(path.join(libraryRoot, 'DEPENDENCIES.md'), `# Dépendances de la bibliothèque

Index généré automatiquement le ${generatedAt}. Les références non résolues restent visibles : elles ne sont jamais supprimées silencieusement.

| Relations | Résolues | À résoudre |
|---:|---:|---:|
| ${dependencyGraph.edgeCount} | ${dependencyGraph.resolvedEdgeCount} | ${dependencyGraph.unresolvedEdgeCount} |

${dependencyEdges.length ? `| Source | Référence | Cible | État |
|---|---|---|---|
${dependencyEdges.map((edge) => `| ${markdown(edge.fromId)} | ${markdown(edge.reference)} | ${markdown(edge.toId || '—')} | ${edge.status} |`).join('\n')}` : 'Aucune dépendance déclarée pour le moment.'}
`)
await atomicWrite(path.join(libraryRoot, 'INDEX.md'), `# Bibliothèque Noblesse Studio

Point d’entrée humain et IA de la bibliothèque locale. Généré le ${generatedAt}.

| Domaine | Nombre | Index lisible | Index machine |
|---|---:|---|---|
| Assets | ${categories.assets.length} | [assets/INDEX.md](assets/INDEX.md) | [assets/index.json](assets/index.json) |
| Textures | ${categories.textures.length} | [textures/INDEX.md](textures/INDEX.md) | [textures/index.json](textures/index.json) |
| Matériaux | ${categories.materials.length} | [materials/INDEX.md](materials/INDEX.md) | [materials/index.json](materials/index.json) |
| Sons | ${categories.sounds.length} | [sounds/INDEX.md](sounds/INDEX.md) | [sounds/index.json](sounds/index.json) |
| Documents | ${categories.documents.length} | [documents/INDEX.md](documents/INDEX.md) | [documents/index.json](documents/index.json) |

Les relations entre éléments sont consultables dans [DEPENDENCIES.md](DEPENDENCIES.md) et [dependencies.json](dependencies.json).

## Règles d’autorité

- Les originaux gérés restent sous \`library/storage/\`.
- Chaque entrée possède un ID permanent; un déplacement ne doit jamais changer cet ID.
- \`library/storage/catalog.json\` et \`integrity.json\` prouvent l’état publié du Vault.
- La base SQLite est un index reconstructible, jamais l’unique copie d’un original.
- Les aperçus et caches sont reconstructibles et ne font pas autorité.
`)

await atomicWrite(path.join(vaultRoot, 'INDEX.md'), `# Stockage interne du Vault

Ce dossier contient les originaux gérés, les packs, les recettes et les reçus d’intégrité.

N’utilisez pas ce fichier comme index métier. Ouvrez [../INDEX.md](../INDEX.md).

- Statut : **${integrity.status}**
- Assets publiés : **${integrity.assetCount}**
- Fichiers contrôlés : **${integrity.checkedFileCount}**
- Fichiers manquants : **${integrity.missingFileCount}**
- Hash invalides : **${integrity.hashMismatchCount}**
`)
await atomicWrite(path.join(vaultRoot, 'library-index.json'), `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, generatedAt, canonicalIndex: '../index.json', counts: master.counts, integrity: master.integrity }, null, 2)}\n`)

await mkdir(path.dirname(databaseFile), { recursive: true })
const nextDatabase = `${databaseFile}.next`
const previousDatabase = `${databaseFile}.previous`
await rm(nextDatabase, { force: true })
await rm(previousDatabase, { force: true })

const db = new DatabaseSync(nextDatabase)
try {
  db.exec(`
    PRAGMA journal_mode = DELETE;
    PRAGMA synchronous = FULL;
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE library_items (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      item_type TEXT NOT NULL,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      status TEXT NOT NULL,
      pack_id TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      storage_mode TEXT NOT NULL CHECK (storage_mode IN ('MANAGED', 'REFERENCE')),
      storage_path TEXT NOT NULL,
      preview_path TEXT NOT NULL,
      source_origin TEXT NOT NULL,
      license_evidence TEXT NOT NULL,
      platforms_json TEXT NOT NULL,
      dependencies_json TEXT NOT NULL,
      tags_json TEXT NOT NULL
    );
    CREATE TABLE documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      document_type TEXT NOT NULL,
      current_revision INTEGER NOT NULL,
      status TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      source_origin TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE document_revisions (
      document_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      action TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      restored_from_revision INTEGER,
      PRIMARY KEY (document_id, revision),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );
    CREATE TABLE library_relations (
      source_id TEXT NOT NULL,
      target_id TEXT,
      relation_type TEXT NOT NULL,
      reference TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('RESOLVED', 'UNRESOLVED')),
      metadata_json TEXT NOT NULL,
      PRIMARY KEY (source_id, relation_type, reference),
      FOREIGN KEY (source_id) REFERENCES library_items(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES library_items(id) ON DELETE SET NULL
    );
    CREATE INDEX library_relations_target_idx ON library_relations(target_id);
    CREATE INDEX document_revisions_hash_idx ON document_revisions(sha256);
    CREATE VIRTUAL TABLE library_search USING fts5(id UNINDEXED, category UNINDEXED, name, item_type, tags);
  `)
  const insertMigration = db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
  for (let version = 1; version <= SCHEMA_VERSION; version += 1) insertMigration.run(version, generatedAt)
  const insertMeta = db.prepare('INSERT INTO metadata(key, value) VALUES (?, ?)')
  insertMeta.run('generated_at', generatedAt)
  insertMeta.run('catalog_sha256', integrity.catalogSha256)
  insertMeta.run('database_role', 'REBUILDABLE_INDEX')
  const insertItem = db.prepare(`INSERT INTO library_items (
    id, category, item_type, name, version, status, pack_id, sha256, storage_mode, storage_path,
    preview_path, source_origin, license_evidence, platforms_json, dependencies_json, tags_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const insertDocument = db.prepare(`INSERT INTO documents (
    id, project_id, name, document_type, current_revision, status, sha256, size_bytes, storage_path,
    source_origin, tags_json, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const insertSearch = db.prepare('INSERT INTO library_search(id, category, name, item_type, tags) VALUES (?, ?, ?, ?, ?)')
  const insertRelation = db.prepare('INSERT INTO library_relations(source_id, target_id, relation_type, reference, status, metadata_json) VALUES (?, ?, ?, ?, ?, ?)')
  const insertRevision = db.prepare('INSERT INTO document_revisions(document_id, revision, action, recorded_at, sha256, size_bytes, original_name, restored_from_revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const item of items) {
      insertItem.run(item.id, item.category, item.type, item.name, item.version, item.status, item.packId, item.hash, item.storageMode, item.storagePath, item.previewPath, item.sourceOrigin, item.licenseEvidence, JSON.stringify(item.platforms), JSON.stringify(item.dependencies), JSON.stringify(item.tags))
      insertSearch.run(item.id, item.category, item.name, item.type, item.tags.join(' '))
    }
    for (const item of documents) {
      insertDocument.run(item.id, item.projectId, item.name, item.type, item.revision, item.status, item.hash, item.sizeBytes, item.storagePath, item.sourceOrigin, JSON.stringify(item.tags), item.createdAt, item.updatedAt)
      insertSearch.run(item.id, item.category, item.name, item.type, item.tags.join(' '))
      for (const revision of item.history) {
        insertRevision.run(item.id, revision.revision, revision.action, revision.at, revision.sha256, revision.sizeBytes, revision.originalName, revision.restoredFromRevision ?? null)
      }
    }
    for (const edge of dependencyEdges) {
      insertRelation.run(edge.fromId, edge.toId, edge.relationType, edge.reference, edge.status, '{}')
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
} finally {
  db.close()
}

if (await exists(databaseFile)) await rename(databaseFile, previousDatabase)
try {
  await rename(nextDatabase, databaseFile)
  await rm(previousDatabase, { force: true })
} catch (error) {
  if (await exists(previousDatabase)) await rename(previousDatabase, databaseFile)
  throw error
}

return { appRoot, libraryRoot, vaultRoot, databaseFile, counts: master.counts, integrity: master.integrity }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await rebuildLibraryIndexes(), null, 2))
}
