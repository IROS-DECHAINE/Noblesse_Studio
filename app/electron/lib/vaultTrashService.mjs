import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const SCHEMA_VERSION = 1
const TRASH_ID_PATTERN = /^trash-[a-f0-9-]{36}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const jsonBuffer = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
const readJsonBuffer = (buffer) => JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/u, ''))
const cleanText = (value, max = 260) => String(value || '').normalize('NFC').replace(/\s+/gu, ' ').trim().slice(0, max)

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''))
  const rightBuffer = Buffer.from(String(right || ''))
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

const atomicWrite = async (file, buffer) => {
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`
  await writeFile(temporary, buffer, { mode: 0o600 })
  await rename(temporary, file)
}

const publicTarget = (asset) => ({
  id: String(asset.asset_id),
  name: cleanText(asset.display_name || asset.label || asset.asset_id),
  type: cleanText(asset.asset_type, 100),
})

const dependencyReferences = (value) => {
  const source = Array.isArray(value) ? value : String(value || '').split(/[;,\n]/u)
  return new Set(source.map((item) => cleanText(item, 300)).filter(Boolean))
}

const countsFor = (assets) => ({
  assetCount: assets.length,
  materialRecipeCount: assets.filter((asset) => asset.asset_type === 'MaterialRecipe').length,
  materialReferenceCount: assets.filter((asset) => asset.asset_type === 'MaterialReference').length,
  unrealMaterialInstanceCount: assets.filter((asset) => asset.asset_type === 'UnrealMaterialInstance').length,
  staticMeshCount: assets.filter((asset) => asset.asset_type === 'StaticMesh').length,
  textureCount: assets.filter((asset) => asset.asset_type === 'Texture2D').length,
  soundCount: assets.filter((asset) => ['SoundWave', 'Audio', 'AudioClip'].includes(asset.asset_type)).length,
})

const nextIntegrityFor = (integrity, catalogBuffer, assets, timestamp) => ({
  ...integrity,
  ...countsFor(assets),
  generatedAt: timestamp,
  status: 'PASS',
  catalogSha256: sha256(catalogBuffer),
  missingFileCount: 0,
  hashMismatchCount: 0,
})

export class VaultTrashService {
  constructor({ vaultRoot, rebuildIndexes, now = () => new Date(), idFactory = randomUUID, withMutation = (task) => task() } = {}) {
    if (typeof vaultRoot !== 'string' || !path.isAbsolute(vaultRoot) || typeof rebuildIndexes !== 'function'
      || typeof now !== 'function' || typeof idFactory !== 'function' || typeof withMutation !== 'function') {
      throw new Error('La configuration de la corbeille du Coffre est invalide.')
    }
    this.vaultRoot = path.resolve(vaultRoot)
    this.rebuildIndexes = rebuildIndexes
    this.now = now
    this.idFactory = idFactory
    this.withMutation = withMutation
    this.catalogFile = path.join(this.vaultRoot, 'catalog.json')
    this.integrityFile = path.join(this.vaultRoot, 'integrity.json')
    this.trashRoot = path.join(this.vaultRoot, '.trash')
    this.planRoot = path.join(this.trashRoot, 'plans')
    this.receiptRoot = path.join(this.trashRoot, 'receipts')
  }

  _nowIso() {
    const date = this.now()
    const value = date instanceof Date ? date : new Date(date)
    if (Number.isNaN(value.getTime())) throw new Error('La date de la corbeille est invalide.')
    return value.toISOString()
  }

  _validateTrashId(value) {
    const id = String(value || '')
    if (!TRASH_ID_PATTERN.test(id)) throw new Error('L’identifiant de corbeille est invalide.')
    return id
  }

  _planFile(id) {
    return path.join(this.planRoot, `${this._validateTrashId(id)}.json`)
  }

  _receiptFile(id) {
    return path.join(this.receiptRoot, `${this._validateTrashId(id)}.json`)
  }

  async _readJsonFile(file, label) {
    const details = await lstat(file)
    if (!details.isFile() || details.isSymbolicLink()) throw new Error(`${label} doit être un fichier réel.`)
    return readJsonBuffer(await readFile(file))
  }

  async ensure() {
    await mkdir(this.planRoot, { recursive: true })
    await mkdir(this.receiptRoot, { recursive: true })
    for (const folder of [this.vaultRoot, this.trashRoot, this.planRoot, this.receiptRoot]) {
      const details = await lstat(folder)
      if (!details.isDirectory() || details.isSymbolicLink()) throw new Error('La corbeille du Coffre doit utiliser des dossiers réels.')
    }
  }

  async _catalogState() {
    const [catalogBuffer, integrityBuffer] = await Promise.all([readFile(this.catalogFile), readFile(this.integrityFile)])
    const catalog = readJsonBuffer(catalogBuffer)
    const integrity = readJsonBuffer(integrityBuffer)
    if (!Array.isArray(catalog.assets) || integrity.status !== 'PASS' || sha256(catalogBuffer) !== integrity.catalogSha256
      || catalog.assets.length !== integrity.assetCount) {
      throw new Error('Le Coffre doit être cohérent avant une opération de corbeille.')
    }
    return { catalog, catalogBuffer, integrity, integrityBuffer, revision: sha256(catalogBuffer) }
  }

  async _rawCatalogState() {
    const [catalogBuffer, integrityBuffer] = await Promise.all([readFile(this.catalogFile), readFile(this.integrityFile)])
    return {
      catalogBuffer,
      integrityBuffer,
      catalog: readJsonBuffer(catalogBuffer),
      integrity: readJsonBuffer(integrityBuffer),
      revision: sha256(catalogBuffer),
    }
  }

  _planHash(plan) {
    const { planHash: _ignored, status: _status, completedAt: _completedAt, ...value } = plan
    return sha256(JSON.stringify(value))
  }

  _publicPlan(plan) {
    return {
      schemaVersion: SCHEMA_VERSION,
      operationId: plan.operationId,
      planHash: plan.planHash,
      title: plan.title,
      targetCount: plan.targets.length,
      targets: plan.targets,
      blockers: plan.blockers,
      blocked: plan.blockers.length > 0,
      recoverable: true,
      originalsPreserved: true,
    }
  }

  _publicReceipt(receipt) {
    return {
      schemaVersion: SCHEMA_VERSION,
      trashId: receipt.trashId,
      title: receipt.title,
      deletedAt: receipt.deletedAt,
      targetCount: receipt.targets.length,
      targets: receipt.targets,
      originalsPreserved: true,
    }
  }

  async plan({ assetIds } = {}) {
    await this.ensure()
    if (!Array.isArray(assetIds) || !assetIds.length || assetIds.length > 200) throw new Error('Choisis entre 1 et 200 éléments du Coffre.')
    const normalizedIds = assetIds.map((id) => cleanText(id, 180))
    if (normalizedIds.some((id) => !id || id.includes('/') || id.includes('\\')) || new Set(normalizedIds).size !== normalizedIds.length) {
      throw new Error('La sélection à placer dans la corbeille est invalide.')
    }
    const state = await this._catalogState()
    const requested = new Set(normalizedIds)
    const targets = state.catalog.assets.filter((asset) => requested.has(asset.asset_id))
    if (targets.length !== requested.size) throw new Error('Un élément sélectionné n’existe plus dans le Coffre.')
    const targetNames = new Set(targets.flatMap((asset) => [asset.asset_id, asset.display_name]).filter(Boolean))
    const blockers = state.catalog.assets.filter((asset) => !requested.has(asset.asset_id)
      && [...dependencyReferences(asset.dependencies)].some((reference) => targetNames.has(reference)))
    const operationId = `trash-${this.idFactory()}`
    const publicTargets = targets.map(publicTarget)
    const plan = {
      schemaVersion: SCHEMA_VERSION,
      operationId,
      catalogRevision: state.revision,
      assetIds: normalizedIds,
      title: publicTargets.length === 1 ? publicTargets[0].name : `${publicTargets[0].name} et ${publicTargets.length - 1} autre${publicTargets.length > 2 ? 's' : ''}`,
      targets: publicTargets,
      blockers: blockers.map(publicTarget),
      createdAt: this._nowIso(),
      status: 'PLANNED',
      originalsPreserved: true,
    }
    plan.planHash = this._planHash(plan)
    await atomicWrite(this._planFile(operationId), jsonBuffer(plan))
    return this._publicPlan(plan)
  }

  async _readPlan(operationId) {
    const plan = await this._readJsonFile(this._planFile(operationId), 'Le plan de corbeille')
    if (plan.schemaVersion !== SCHEMA_VERSION || plan.operationId !== operationId || !SHA256_PATTERN.test(String(plan.planHash || ''))
      || !safeEqual(this._planHash(plan), plan.planHash)) throw new Error('Le plan de corbeille a été altéré.')
    return plan
  }

  async _readReceipt(trashId) {
    const receipt = await this._readJsonFile(this._receiptFile(trashId), 'Le reçu de corbeille')
    if (receipt.schemaVersion !== SCHEMA_VERSION || receipt.trashId !== trashId || !Array.isArray(receipt.assets) || !receipt.assets.length) {
      throw new Error('Le reçu de corbeille est invalide.')
    }
    return receipt
  }

  async initialize() {
    await this.ensure()
    const entries = await readdir(this.receiptRoot, { withFileTypes: true })
    let recovered = 0
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const id = entry.name.slice(0, -5)
      if (!TRASH_ID_PATTERN.test(id)) continue
      const receipt = await this._readReceipt(id)
      if (receipt.status !== 'PREPARED') continue
      await this.withMutation(async () => {
        const state = await this._rawCatalogState()
        if (state.revision === receipt.nextCatalogHash) {
          await atomicWrite(this.integrityFile, jsonBuffer(receipt.nextIntegrity))
          await this.rebuildIndexes()
          const completed = { ...receipt, status: 'COMPLETED' }
          await atomicWrite(this._receiptFile(id), jsonBuffer(completed))
          const plan = await this._readPlan(id)
          const completedPlan = { ...plan, status: 'COMPLETED', completedAt: receipt.deletedAt }
          completedPlan.planHash = this._planHash(completedPlan)
          await atomicWrite(this._planFile(id), jsonBuffer(completedPlan))
          recovered += 1
        } else if (state.revision === receipt.originalCatalogHash) {
          await atomicWrite(this.integrityFile, jsonBuffer(receipt.originalIntegrity))
          await rm(this._receiptFile(id), { force: true })
          recovered += 1
        } else {
          throw new Error(`La transaction de corbeille ${id} exige une intervention manuelle.`)
        }
      })
    }
    return { ready: true, recovered }
  }

  async apply({ operationId, planHash, confirmationPhrase } = {}) {
    await this.ensure()
    if (confirmationPhrase !== 'CORBEILLE') throw new Error('La seconde confirmation de corbeille est absente.')
    const id = this._validateTrashId(operationId)
    const plan = await this._readPlan(id)
    if (!safeEqual(plan.planHash, planHash)) throw new Error('La confirmation ne correspond pas au plan préparé.')
    if (plan.blockers.length) throw new Error('Cet élément est encore utilisé par un autre élément du Coffre.')
    if (plan.status === 'COMPLETED') return this._publicReceipt(await this._readReceipt(id))

    return this.withMutation(async () => {
      const state = await this._catalogState()
      if (!safeEqual(state.revision, plan.catalogRevision)) throw new Error('Le Coffre a changé depuis la première validation. Prépare un nouveau plan.')
      const targetIds = new Set(plan.assetIds)
      const assets = state.catalog.assets.filter((asset) => targetIds.has(asset.asset_id))
      if (assets.length !== targetIds.size) throw new Error('Un élément du plan n’existe plus.')
      const nextAssets = state.catalog.assets.filter((asset) => !targetIds.has(asset.asset_id))
      const deletedAt = this._nowIso()
      const nextCatalog = { ...state.catalog, generatedAt: deletedAt, assets: nextAssets }
      const nextCatalogBuffer = jsonBuffer(nextCatalog)
      const nextIntegrity = nextIntegrityFor(state.integrity, nextCatalogBuffer, nextAssets, deletedAt)
      const receipt = {
        schemaVersion: SCHEMA_VERSION,
        trashId: id,
        title: plan.title,
        targets: plan.targets,
        assets,
        deletedAt,
        status: 'PREPARED',
        originalsPreserved: true,
        originalCatalogHash: state.revision,
        originalIntegrity: state.integrity,
        nextCatalogHash: sha256(nextCatalogBuffer),
        nextIntegrity,
      }
      await atomicWrite(this._receiptFile(id), jsonBuffer(receipt))
      let catalogMutated = false
      try {
        await atomicWrite(this.catalogFile, nextCatalogBuffer)
        catalogMutated = true
        await atomicWrite(this.integrityFile, jsonBuffer(nextIntegrity))
        await this.rebuildIndexes()
        const completedReceipt = { ...receipt, status: 'COMPLETED' }
        await atomicWrite(this._receiptFile(id), jsonBuffer(completedReceipt))
        const completedPlan = { ...plan, status: 'COMPLETED', completedAt: deletedAt }
        completedPlan.planHash = this._planHash(completedPlan)
        await atomicWrite(this._planFile(id), jsonBuffer(completedPlan))
        return this._publicReceipt(completedReceipt)
      } catch (error) {
        if (catalogMutated) {
          await atomicWrite(this.catalogFile, state.catalogBuffer)
          await atomicWrite(this.integrityFile, state.integrityBuffer)
          await this.rebuildIndexes().catch(() => undefined)
        }
        await rm(this._receiptFile(id), { force: true }).catch(() => undefined)
        throw error
      }
    })
  }

  async list() {
    await this.ensure()
    const entries = await readdir(this.receiptRoot, { withFileTypes: true })
    const receipts = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const id = entry.name.slice(0, -5)
      if (!TRASH_ID_PATTERN.test(id)) continue
      const receipt = await this._readReceipt(id)
      if (receipt.status === 'COMPLETED') receipts.push(this._publicReceipt(receipt))
    }
    return { schemaVersion: SCHEMA_VERSION, items: receipts.sort((left, right) => right.deletedAt.localeCompare(left.deletedAt)) }
  }

  async _verifyManagedSources(assets) {
    for (const asset of assets) {
      for (const [field, hashField] of [['source', 'source_sha256'], ['original_source', 'original_source_sha256']]) {
        const relative = String(asset[field] || '')
        if (!relative) continue
        if (path.isAbsolute(relative) || relative.includes('\0')) throw new Error('Une source gérée à restaurer est invalide.')
        const file = path.resolve(this.vaultRoot, relative)
        const relation = path.relative(this.vaultRoot, file)
        if (!relation || relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) throw new Error('Une source à restaurer sort du Coffre.')
        const details = await lstat(file)
        if (!details.isFile() || details.isSymbolicLink()) throw new Error(`La source de ${cleanText(asset.display_name)} est indisponible.`)
        if (asset[hashField] && sha256(await readFile(file)) !== asset[hashField]) throw new Error(`La source de ${cleanText(asset.display_name)} a changé.`)
      }
    }
  }

  async restore({ trashId } = {}) {
    await this.ensure()
    const id = this._validateTrashId(trashId)
    return this.withMutation(async () => {
      const receipt = await this._readReceipt(id)
      if (receipt.status !== 'COMPLETED') throw new Error('Cet élément ne peut pas être restauré dans son état actuel.')
      const state = await this._catalogState()
      const existingIds = new Set(state.catalog.assets.map((asset) => asset.asset_id))
      if (receipt.assets.some((asset) => existingIds.has(asset.asset_id))) throw new Error('Un identifiant restauré existe déjà dans le Coffre.')
      await this._verifyManagedSources(receipt.assets)
      const restoredAt = this._nowIso()
      const nextAssets = [...state.catalog.assets, ...receipt.assets]
      const nextCatalog = { ...state.catalog, generatedAt: restoredAt, assets: nextAssets }
      const nextCatalogBuffer = jsonBuffer(nextCatalog)
      const nextIntegrity = nextIntegrityFor(state.integrity, nextCatalogBuffer, nextAssets, restoredAt)
      let catalogMutated = false
      try {
        await atomicWrite(this.catalogFile, nextCatalogBuffer)
        catalogMutated = true
        await atomicWrite(this.integrityFile, jsonBuffer(nextIntegrity))
        await this.rebuildIndexes()
        await atomicWrite(this._receiptFile(id), jsonBuffer({ ...receipt, status: 'RESTORED', restoredAt }))
        return { schemaVersion: SCHEMA_VERSION, restored: true, trashId: id, targetCount: receipt.assets.length }
      } catch (error) {
        if (catalogMutated) {
          await atomicWrite(this.catalogFile, state.catalogBuffer)
          await atomicWrite(this.integrityFile, state.integrityBuffer)
          await this.rebuildIndexes().catch(() => undefined)
        }
        throw error
      }
    })
  }
}

export const createVaultTrashService = (options) => new VaultTrashService(options)
