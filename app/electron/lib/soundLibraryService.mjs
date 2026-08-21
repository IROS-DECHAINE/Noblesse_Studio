import { createHash, randomUUID } from 'node:crypto'
import { access, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { discoverFfmpegExecutable } from './audioConversion.mjs'
import { MAX_SOUND_SOURCE_BYTES } from './audioFileProcessor.mjs'

const SELECTION_TTL_MS = 30 * 60 * 1_000
export const MAX_SOUND_BATCH_FILES = 200
export const MAX_SOUND_BATCH_BYTES = 2 * 1024 * 1024 * 1024
const SOUND_CATEGORIES = new Set(['Effets', 'Ambiances', 'Musiques', 'Voix'])
const FORMAT_BY_EXTENSION = new Map([['.wav', 'WAV'], ['.mp3', 'MP3']])

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')
const readJsonBuffer = (buffer) => JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/u, ''))
const jsonBuffer = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')

const atomicWrite = async (filePath, buffer) => {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp-${process.pid}-${randomUUID()}`
  await writeFile(temporary, buffer)
  await rename(temporary, filePath)
}

const assertWithin = (candidate, root, label) => {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(candidate)
  const relation = path.relative(resolvedRoot, resolved)
  if (!relation || relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw new Error(`${label} doit rester dans le Vault.`)
  }
  return resolved
}

const processInWorker = (request) => new Promise((resolve, reject) => {
  const worker = new Worker(new URL('./soundImportWorker.mjs', import.meta.url), { workerData: request })
  worker.once('message', (message) => {
    if (message?.ok) resolve(message.result)
    else reject(new Error(message?.error || 'Le traitement audio a échoué.'))
  })
  worker.once('error', reject)
  worker.once('exit', (code) => {
    if (code !== 0) reject(new Error(`Le worker audio s’est arrêté avec le code ${code}.`))
  })
})

const normalizeTitle = (value) => {
  const title = String(value || '').normalize('NFC').replace(/\s+/gu, ' ').trim()
  if (!title || title.length > 120 || /[\u0000-\u001F\u007F]/u.test(title)) throw new Error('Le titre du son doit contenir entre 1 et 120 caractères.')
  return title
}

export const suggestedSoundTitle = (fileName) => normalizeTitle(
  path.parse(String(fileName || '')).name.replaceAll('_', ' ').replace(/\s+/gu, ' ').trim(),
)

export const createSoundLibraryService = ({
  vaultRoot,
  rebuildIndexes,
  ffmpegOverride = '',
  processSource = processInWorker,
  now = () => new Date(),
  idFactory = randomUUID,
  withMutation = (task) => task(),
} = {}) => {
  if (!vaultRoot || typeof rebuildIndexes !== 'function' || typeof withMutation !== 'function') throw new Error('La configuration de la bibliothèque audio est invalide.')
  const selections = new Map()
  let queue = Promise.resolve()
  let ffmpegExecutablePromise = null

  const resolveFfmpegExecutable = () => {
    ffmpegExecutablePromise ||= discoverFfmpegExecutable({ override: ffmpegOverride })
    return ffmpegExecutablePromise
  }

  const pruneSelections = () => {
    const cutoff = Date.now() - SELECTION_TTL_MS
    for (const [token, selection] of selections) if (selection.createdAt < cutoff) selections.delete(token)
  }

  const describeSelection = async (filePath) => {
    pruneSelections()
    const absolutePath = path.resolve(String(filePath || ''))
    const format = FORMAT_BY_EXTENSION.get(path.extname(absolutePath).toLocaleLowerCase('en'))
    if (!format) throw new Error('Choisis un fichier WAV ou MP3.')
    const details = await lstat(absolutePath)
    if (!details.isFile() || details.isSymbolicLink() || details.size < 1 || details.size > MAX_SOUND_SOURCE_BYTES) {
      throw new Error('Le fichier audio est invalide ou dépasse 128 Mo.')
    }
    if (format === 'MP3' && !await resolveFfmpegExecutable()) {
      throw new Error('La conversion MP3 est indisponible sur ce poste. Les WAV restent importables.')
    }
    const selectionToken = `sound-selection-${randomUUID()}`
    selections.set(selectionToken, {
      sourcePath: absolutePath,
      sizeBytes: details.size,
      modifiedAt: details.mtimeMs,
      format,
      createdAt: Date.now(),
    })
    return {
      schemaVersion: 1,
      canceled: false,
      file: {
        selectionToken,
        originalName: path.basename(absolutePath),
        suggestedTitle: suggestedSoundTitle(path.basename(absolutePath)),
        sizeBytes: details.size,
        format,
        conversionRequired: format === 'MP3',
      },
    }
  }

  const describeSelections = async (filePaths) => {
    if (!Array.isArray(filePaths) || !filePaths.length || filePaths.length > MAX_SOUND_BATCH_FILES) {
      throw new Error(`Choisis entre 1 et ${MAX_SOUND_BATCH_FILES} fichiers audio à la fois.`)
    }
    const resolved = filePaths.map((filePath) => path.resolve(String(filePath || '')))
    if (new Set(resolved.map((filePath) => filePath.toLocaleLowerCase('en'))).size !== resolved.length) {
      throw new Error('La même source audio ne peut pas être sélectionnée deux fois dans un lot.')
    }
    const descriptions = []
    try {
      for (const filePath of resolved) descriptions.push(await describeSelection(filePath))
      const totalBytes = descriptions.reduce((total, description) => total + description.file.sizeBytes, 0)
      if (totalBytes > MAX_SOUND_BATCH_BYTES) throw new Error('Le lot audio dépasse la limite totale de 2 Go.')
      return { schemaVersion: 1, canceled: false, files: descriptions.map((description) => description.file) }
    } catch (error) {
      for (const description of descriptions) selections.delete(description.file.selectionToken)
      throw error
    }
  }

  const prepareBatch = ({ items, category, rightsConfirmed }) => {
    pruneSelections()
    if (rightsConfirmed !== true) throw new Error('La confirmation des droits d’utilisation est obligatoire.')
    if (!SOUND_CATEGORIES.has(category)) throw new Error('La catégorie audio est invalide.')
    if (!Array.isArray(items) || !items.length || items.length > MAX_SOUND_BATCH_FILES) {
      throw new Error(`Un lot audio doit contenir entre 1 et ${MAX_SOUND_BATCH_FILES} fichiers.`)
    }
    const tokens = new Set()
    const preparedItems = items.map((item) => {
      const selectionToken = String(item?.selectionToken || '')
      if (!selectionToken || tokens.has(selectionToken)) throw new Error('Chaque fichier du lot doit avoir une sélection unique.')
      tokens.add(selectionToken)
      const selection = selections.get(selectionToken)
      if (!selection) throw new Error('Une sélection audio a expiré. Choisis de nouveau les fichiers.')
      return {
        selectionToken,
        title: normalizeTitle(item?.title),
        sourcePath: selection.sourcePath,
        sizeBytes: selection.sizeBytes,
        modifiedAt: selection.modifiedAt,
        format: selection.format,
      }
    })
    return { category, rightsConfirmed: true, items: preparedItems }
  }

  const releaseSelections = (selectionTokens) => {
    for (const selectionToken of selectionTokens || []) selections.delete(selectionToken)
  }

  const runImportUnlocked = async ({ selectionToken, title, category, rightsConfirmed }, { rebuildAfter = true } = {}) => {
    pruneSelections()
    if (rightsConfirmed !== true) throw new Error('La confirmation des droits d’utilisation est obligatoire.')
    if (!SOUND_CATEGORIES.has(category)) throw new Error('La catégorie audio est invalide.')
    const safeTitle = normalizeTitle(title)
    const selection = selections.get(selectionToken)
    if (!selection) throw new Error('La sélection audio a expiré. Choisis de nouveau le fichier.')
    const details = await lstat(selection.sourcePath)
    if (!details.isFile() || details.isSymbolicLink() || details.size !== selection.sizeBytes || details.mtimeMs !== selection.modifiedAt) {
      throw new Error('Le fichier audio a changé depuis sa sélection.')
    }

    const root = path.resolve(vaultRoot)
    const catalogFile = path.join(root, 'catalog.json')
    const integrityFile = path.join(root, 'integrity.json')
    const importRoot = assertWithin(path.join(root, '.imports'), root, 'Le dossier temporaire audio')
    await mkdir(importRoot, { recursive: true })
    const temporaryWav = assertWithin(path.join(importRoot, `${randomUUID()}.wav.part`), root, 'Le fichier temporaire audio')
    const temporaryOriginal = selection.format === 'MP3'
      ? assertWithin(path.join(importRoot, `${randomUUID()}.mp3.part`), root, 'Le MP3 temporaire')
      : ''
    const ffmpegExecutable = selection.format === 'MP3'
      ? await resolveFfmpegExecutable()
      : ''
    const processed = await processSource({
      sourcePath: selection.sourcePath,
      destinationPath: temporaryWav,
      originalDestinationPath: temporaryOriginal,
      format: selection.format,
      ffmpegExecutable,
    })

    let originalCatalogBuffer
    let originalIntegrityBuffer
    try {
      [originalCatalogBuffer, originalIntegrityBuffer] = await Promise.all([
        readFile(catalogFile),
        readFile(integrityFile),
      ])
    } catch (error) {
      await rm(temporaryWav, { force: true }).catch(() => undefined)
      if (temporaryOriginal) await rm(temporaryOriginal, { force: true }).catch(() => undefined)
      throw error
    }
    const catalog = readJsonBuffer(originalCatalogBuffer)
    const integrity = readJsonBuffer(originalIntegrityBuffer)
    if (!Array.isArray(catalog.assets) || integrity.status !== 'PASS' || sha256(originalCatalogBuffer) !== integrity.catalogSha256) {
      await rm(temporaryWav, { force: true })
      if (temporaryOriginal) await rm(temporaryOriginal, { force: true })
      throw new Error('Le Vault doit être cohérent avant d’ajouter un son.')
    }
    const duplicate = catalog.assets.find((asset) => asset.asset_type === 'SoundWave' && asset.source_sha256 === processed.outputSha256)
    if (duplicate) {
      selections.delete(selectionToken)
      await rm(temporaryWav, { force: true })
      if (temporaryOriginal) await rm(temporaryOriginal, { force: true })
      return { status: 'ALREADY_PRESENT', asset: duplicate }
    }

    const assetId = `NOB-AUDIO-${String(idFactory()).toLocaleUpperCase('en')}`
    const destinationDirectory = assertWithin(path.join(root, 'user-audio', assetId), root, 'Le dossier audio géré')
    const destinationFile = assertWithin(path.join(destinationDirectory, 'audio.wav'), root, 'Le WAV géré')
    const originalFile = temporaryOriginal
      ? assertWithin(path.join(destinationDirectory, 'original.mp3'), root, 'Le MP3 source géré')
      : ''
    try {
      await mkdir(path.dirname(destinationDirectory), { recursive: true })
      await mkdir(destinationDirectory)
      await rename(temporaryWav, destinationFile)
      if (temporaryOriginal) await rename(temporaryOriginal, originalFile)
    } catch (error) {
      await rm(temporaryWav, { force: true }).catch(() => undefined)
      if (temporaryOriginal) await rm(temporaryOriginal, { force: true }).catch(() => undefined)
      await rm(destinationDirectory, { recursive: true, force: true }).catch(() => undefined)
      throw error
    }
    const importedAt = now().toISOString()
    const relativeSource = path.relative(root, destinationFile).replaceAll('\\', '/')
    const asset = {
      asset_id: assetId,
      display_name: safeTitle,
      label: safeTitle,
      asset_type: 'SoundWave',
      domain: 'Audio',
      category,
      pack_id: 'Noblesse_User_Audio',
      pack_version: '1.0.0',
      source_project: 'NOBLESSE_STUDIO_APP',
      source: relativeSource,
      source_sha256: processed.outputSha256,
      source_file_sha256: processed.sourceSha256,
      ...(originalFile ? {
        original_source: path.relative(root, originalFile).replaceAll('\\', '/'),
        original_source_sha256: processed.sourceSha256,
      } : {}),
      provenance: 'USER_CONFIRMED',
      license_evidence: `USER_CONFIRMED_AT_IMPORT:${importedAt}`,
      status: 'VALIDATED',
      platforms: [],
      original_format: selection.format,
      conversion_profile: processed.converted ? 'PCM_S24LE_48000' : 'WAV_PASSTHROUGH',
      converted: processed.converted,
      duration_seconds: Number(processed.durationSeconds.toFixed(3)),
      size_bytes: processed.sizeBytes,
      sample_rate: processed.sampleRate,
      channels: processed.channels,
      bit_depth: processed.bitDepth,
      imported_at: importedAt,
      validation_receipt: 'WAV_HEADER_AND_SHA256_VERIFIED',
      notes: processed.converted ? 'MP3 converti en WAV PCM 24 bits / 48 kHz lors de l’import.' : 'WAV validé et conservé sans réencodage.',
    }
    const nextCatalog = { ...catalog, generatedAt: importedAt, assets: [...catalog.assets, asset] }
    const nextCatalogBuffer = jsonBuffer(nextCatalog)
    const nextIntegrity = {
      ...integrity,
      generatedAt: importedAt,
      status: 'PASS',
      catalogSha256: sha256(nextCatalogBuffer),
      assetCount: nextCatalog.assets.length,
      soundCount: Number(integrity.soundCount || 0) + 1,
      checkedFileCount: Number(integrity.checkedFileCount || 0) + (originalFile ? 2 : 1),
      missingFileCount: 0,
      hashMismatchCount: 0,
    }

    let catalogMutated = false
    try {
      await atomicWrite(catalogFile, nextCatalogBuffer)
      catalogMutated = true
      await atomicWrite(integrityFile, jsonBuffer(nextIntegrity))
      if (rebuildAfter) await rebuildIndexes()
      selections.delete(selectionToken)
      return { status: 'IMPORTED', asset }
    } catch (error) {
      if (catalogMutated) {
        await atomicWrite(catalogFile, originalCatalogBuffer)
        await atomicWrite(integrityFile, originalIntegrityBuffer)
        if (rebuildAfter) await rebuildIndexes().catch(() => undefined)
      }
      await rm(destinationDirectory, { recursive: true, force: true }).catch(() => undefined)
      throw error
    }
  }

  const runImport = (request, options) => withMutation(() => runImportUnlocked(request, options))

  const importSound = (request, options) => {
    const operation = queue.then(() => runImport(request, options), () => runImport(request, options))
    queue = operation.catch(() => undefined)
    return operation
  }

  return Object.freeze({ describeSelection, describeSelections, importSound, prepareBatch, releaseSelections })
}
