import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ALLOWED_DOCUMENT_PROJECTS,
  BLOCKED_DOCUMENT_EXTENSIONS,
  DocumentLibraryError,
  createDocumentLibrary,
} from './documentLibrary.mjs'

const FORBIDDEN_PUBLIC_KEYS = new Set(['filePath', 'objectKey', 'relativePath', 'root', 'sourcePath', 'sourceRealPath'])

const assertNoPublicPath = (value) => {
  if (Array.isArray(value)) {
    value.forEach(assertNoPublicPath)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    assert.equal(FORBIDDEN_PUBLIC_KEYS.has(key), false, `public result leaked ${key}`)
    assertNoPublicPath(child)
  }
}

const expectCode = (code) => (error) => {
  assert.ok(error instanceof DocumentLibraryError)
  assert.equal(error.code, code)
  return true
}

async function fixture(t) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), 'noblesse-document-library-'))
  const sourceRoot = path.join(sandbox, 'sources')
  const libraryRoot = path.join(sandbox, 'library')
  await mkdir(sourceRoot, { recursive: true })
  let id = 0
  let clock = Date.parse('2026-08-21T10:00:00.000Z')
  const library = createDocumentLibrary({
    root: libraryRoot,
    idFactory: () => `document-${++id}`,
    now: () => new Date(clock++),
  })
  t.after(() => rm(sandbox, { recursive: true, force: true }))
  return { sandbox, sourceRoot, libraryRoot, library }
}

test('exports the exact four authorised project ids and blocks executable/script extensions', () => {
  assert.deepEqual(ALLOWED_DOCUMENT_PROJECTS, ['studio', 'primebot-rush', 'prime-industry', 'how-many-boxes'])
  for (const extension of ['.exe', '.bat', '.cmd', '.ps1', '.js', '.vbs', '.lnk']) {
    assert.ok(BLOCKED_DOCUMENT_EXTENSIONS.includes(extension))
  }
})

test('the packaged bootstrap is schema-v1, curated and uses only authorised projects with stable ids', async () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const bootstrap = JSON.parse(await readFile(path.join(currentDir, '..', 'data', 'document-bootstrap.v1.json'), 'utf8'))
  assert.equal(bootstrap.schemaVersion, 1)
  assert.deepEqual(bootstrap.projects.map((project) => project.id), ALLOWED_DOCUMENT_PROJECTS)
  assert.ok(bootstrap.documents.length >= 4)
  assert.equal(new Set(bootstrap.documents.map((document) => document.id)).size, bootstrap.documents.length)
  for (const document of bootstrap.documents) {
    assert.ok(ALLOWED_DOCUMENT_PROJECTS.includes(document.projectId))
    assert.match(document.id, /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/)
    assert.ok(path.isAbsolute(document.sourcePath))
    assert.ok(!BLOCKED_DOCUMENT_EXTENSIONS.includes(path.extname(document.sourcePath).toLowerCase()))
  }
})

test('ensure creates an isolated versioned library without exposing its root', async (t) => {
  const { library, libraryRoot } = await fixture(t)
  const ready = await library.ensure()

  assert.deepEqual(ready, {
    schemaVersion: 1,
    ready: true,
    projectIds: ['studio', 'primebot-rush', 'prime-industry', 'how-many-boxes'],
  })
  assertNoPublicPath(ready)
  for (const relative of ['manifests', 'objects', 'plans', '.tmp', '.trash/manifests', '.trash/objects']) {
    const details = await readdir(path.join(libraryRoot, relative))
    assert.deepEqual(details, [])
  }
})

test('describes a Unicode selection with an opaque token and imports a managed Markdown document', async (t) => {
  const { library, libraryRoot, sourceRoot } = await fixture(t)
  const source = path.join(sourceRoot, 'Décisions_finales.md')
  const contents = '# Décisions finales\n\nTexte canon.\n'
  await writeFile(source, contents, 'utf8')

  const selection = await library.describeSelection([source])
  assert.equal(selection.length, 1)
  assert.equal(selection[0].allowed, true)
  assert.match(selection[0].selectionToken, /^[0-9a-f-]{36}$/)
  assert.equal(selection[0].originalName, 'Décisions_finales.md')
  assert.equal(selection[0].kind, 'markdown')
  assertNoPublicPath(selection)

  const [document] = await library.import({
    projectId: 'studio',
    selectionTokens: [selection[0].selectionToken],
    title: 'Décisions du studio',
    canonicalStatus: 'canon',
    tags: ['Canon', 'Direction', 'Canon'],
  })
  assert.equal(document.id, 'document-1')
  assert.equal(document.title, 'Décisions du studio')
  assert.equal(document.origin, 'managed')
  assert.equal(document.canonicalStatus, 'CANON')
  assert.deepEqual(document.tags, ['Canon', 'Direction'])
  assert.equal(document.available, true)
  assertNoPublicPath(document)

  const objectNames = await readdir(path.join(libraryRoot, 'objects'))
  assert.deepEqual(objectNames, [document.sha256])
  assert.equal(await readFile(path.join(libraryRoot, 'objects', document.sha256), 'utf8'), contents)
  assert.equal(await readFile(source, 'utf8'), contents, 'import must copy, never move or mutate the selected source')

  const listed = await library.list({ projectId: 'studio', query: 'direction', kind: 'markdown' })
  assert.deepEqual(listed.map((entry) => entry.id), [document.id])
  assertNoPublicPath(listed)

  const text = await library.readText(document.id)
  assert.equal(text.text, contents)
  assert.equal(text.sha256, document.sha256)
  assertNoPublicPath(text)

  const privileged = await library.resolveFile(document.id)
  assert.equal(privileged.document.id, document.id)
  assert.ok(privileged.filePath.startsWith(path.join(libraryRoot, 'objects')))
})

test('applies an optional custom title only to a single import and deduplicates identical objects', async (t) => {
  const { library, libraryRoot, sourceRoot } = await fixture(t)
  const first = path.join(sourceRoot, 'Premier.pdf')
  const second = path.join(sourceRoot, 'Deuxieme.pdf')
  await writeFile(first, '%PDF-1.7\nsame bytes')
  await writeFile(second, '%PDF-1.7\nsame bytes')

  const imported = await library.import({
    projectId: 'primebot-rush',
    filePaths: [first, second],
    title: 'Titre à ignorer pour un lot',
  })
  assert.deepEqual(imported.map((entry) => entry.title), ['Premier', 'Deuxieme'])
  assert.ok(imported.every((entry) => entry.kind === 'pdf'))
  assert.equal(imported[0].sha256, imported[1].sha256)
  assert.equal((await readdir(path.join(libraryRoot, 'objects'))).length, 1)
  assertNoPublicPath(imported)
})

test('rejects disallowed projects, scripts and expired or changed selections', async (t) => {
  const { library, sourceRoot } = await fixture(t)
  const script = path.join(sourceRoot, 'danger.ps1')
  const note = path.join(sourceRoot, 'note.txt')
  await writeFile(script, 'Write-Host danger')
  await writeFile(note, 'version one')

  const described = await library.describeSelection([script, note])
  assert.equal(described[0].allowed, false)
  assert.equal(described[0].blockedReason, 'BLOCKED_EXTENSION')
  assert.equal(described[0].selectionToken, null)
  assert.equal(described[1].allowed, true)
  assertNoPublicPath(described)

  await assert.rejects(
    library.import({ projectId: 'unknown', filePaths: [note] }),
    expectCode('PROJECT_NOT_ALLOWED'),
  )
  await assert.rejects(
    library.import({ projectId: 'studio', filePaths: [script] }),
    expectCode('BLOCKED_EXTENSION'),
  )

  await writeFile(note, 'version two is different')
  await assert.rejects(
    library.import({ projectId: 'studio', selectionTokens: [described[1].selectionToken] }),
    expectCode('SELECTION_CHANGED'),
  )
})

test('bootstraps linked canon files idempotently without exposing or deleting their source', async (t) => {
  const { library, sourceRoot } = await fixture(t)
  const source = path.join(sourceRoot, 'CANON.md')
  await writeFile(source, '# Canon lié\n')
  const payload = {
    schemaVersion: 1,
    documents: [{
      id: 'linked-canon',
      projectId: 'prime-industry',
      title: 'Canon Prime Industry',
      sourcePath: source,
      canonicalStatus: 'CANON',
      tags: ['canon'],
    }],
  }

  const first = await library.bootstrap(payload)
  assert.equal(first.added, 1)
  assert.equal(first.existing, 0)
  assert.equal(first.documents[0].origin, 'linked')
  assertNoPublicPath(first)

  const second = await library.bootstrap(payload)
  assert.equal(second.added, 0)
  assert.equal(second.existing, 1)

  const plan = await library.planDelete('linked-canon')
  assert.equal(plan.action, 'UNLINK')
  assert.equal(plan.originalSourceWillBeDeleted, false)
  assertNoPublicPath(plan)
  const deleted = await library.applyDelete({ operationId: plan.operationId, planHash: plan.planHash })
  assert.ok(deleted.deletedAt)
  assert.equal(await readFile(source, 'utf8'), '# Canon lié\n')

  const whileDeleted = await library.bootstrap(payload)
  assert.equal(whileDeleted.skippedDeleted, 1, 'bootstrap must respect a user unlink and not resurrect it')

  const restored = await library.restore('linked-canon')
  assert.equal(restored.deletedAt, null)
  assert.equal(restored.origin, 'linked')
  assert.equal((await library.readText('linked-canon')).text, '# Canon lié\n')
})

test('reports missing and rejected bootstrap entries without leaking their paths', async (t) => {
  const { library, sourceRoot } = await fixture(t)
  const missing = path.join(sourceRoot, 'missing.pdf')
  const blocked = path.join(sourceRoot, 'blocked.exe')
  await writeFile(blocked, 'MZ')

  const result = await library.bootstrap({
    schemaVersion: 1,
    documents: [
      { id: 'missing-pdf', projectId: 'studio', title: 'Absent', sourcePath: missing },
      { id: 'blocked-executable', projectId: 'studio', title: 'Bloqué', sourcePath: blocked },
      { id: '../invalid', projectId: 'studio', title: 'Invalide', sourcePath: blocked },
    ],
  })
  assert.deepEqual(result.missing, [{ id: 'missing-pdf', projectId: 'studio', title: 'Absent', reason: 'SOURCE_MISSING' }])
  assert.deepEqual(result.rejected.map((entry) => entry.reason), ['BLOCKED_EXTENSION', 'INVALID_ID'])
  assertNoPublicPath(result)
  assert.equal(JSON.stringify(result).includes(sourceRoot), false)
})

test('managed deletion uses a persisted idempotent plan, moves the object to trash and restores it', async (t) => {
  const { library, libraryRoot, sourceRoot } = await fixture(t)
  const source = path.join(sourceRoot, 'portrait.png')
  await writeFile(source, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))
  const [document] = await library.import({ projectId: 'how-many-boxes', filePaths: [source] })

  const firstPlan = await library.planDelete(document.id)
  const secondPlan = await library.planDelete(document.id)
  assert.deepEqual(secondPlan, firstPlan, 'planning the same revision must be idempotent')
  assert.match(firstPlan.operationId, /^delete-[a-f0-9]{32}$/)
  assert.match(firstPlan.planHash, /^[a-f0-9]{64}$/)
  assert.equal(firstPlan.action, 'MOVE_TO_TRASH')

  await assert.rejects(
    library.applyDelete({ operationId: firstPlan.operationId, planHash: '0'.repeat(64) }),
    expectCode('PLAN_MISMATCH'),
  )
  const deleted = await library.applyDelete({ operationId: firstPlan.operationId, planHash: firstPlan.planHash })
  assert.ok(deleted.deletedAt)
  assert.equal((await readdir(path.join(libraryRoot, 'objects'))).length, 0)
  assert.deepEqual(await readdir(path.join(libraryRoot, '.trash', 'objects')), [document.sha256])
  assert.equal(await readFile(source).then((buffer) => buffer.length), 7, 'the originally selected source remains untouched')

  const replay = await library.applyDelete({ operationId: firstPlan.operationId, planHash: firstPlan.planHash })
  assert.deepEqual(replay, deleted, 'applying a completed operation is idempotent')
  assert.equal((await library.list()).length, 0)
  assert.equal((await library.list({ includeDeleted: true })).length, 1)

  const restored = await library.restore(document.id)
  assert.equal(restored.deletedAt, null)
  assert.equal(restored.available, true)
  assert.deepEqual(await readdir(path.join(libraryRoot, 'objects')), [document.sha256])
  assert.equal((await readdir(path.join(libraryRoot, '.trash', 'objects'))).length, 0)
  assert.deepEqual(await library.restore(document.id), restored, 'restore is also idempotent')
})

test('a delete plan refuses a changed manifest revision', async (t) => {
  const { library, libraryRoot, sourceRoot } = await fixture(t)
  const source = path.join(sourceRoot, 'roadmap.txt')
  await writeFile(source, 'roadmap')
  const [document] = await library.import({ projectId: 'studio', filePaths: [source] })
  const plan = await library.planDelete(document.id)

  const manifestFile = path.join(libraryRoot, 'manifests', `${document.id}.json`)
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
  manifest.title = 'Titre modifié après confirmation'
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2), 'utf8')

  await assert.rejects(
    library.applyDelete({ operationId: plan.operationId, planHash: plan.planHash }),
    expectCode('REVISION_CONFLICT'),
  )
  assert.equal((await library.list()).length, 1)
})

test('shared managed objects stay active until the final referencing document is deleted', async (t) => {
  const { library, libraryRoot, sourceRoot } = await fixture(t)
  const first = path.join(sourceRoot, 'same-a.wav')
  const second = path.join(sourceRoot, 'same-b.wav')
  await writeFile(first, 'same audio bytes')
  await writeFile(second, 'same audio bytes')
  const [left, right] = await library.import({ projectId: 'studio', filePaths: [first, second] })

  const leftPlan = await library.planDelete(left.id)
  await library.applyDelete({ operationId: leftPlan.operationId, planHash: leftPlan.planHash })
  assert.deepEqual(await readdir(path.join(libraryRoot, 'objects')), [left.sha256])
  assert.deepEqual(await readdir(path.join(libraryRoot, '.trash', 'objects')), [])

  const rightPlan = await library.planDelete(right.id)
  await library.applyDelete({ operationId: rightPlan.operationId, planHash: rightPlan.planHash })
  assert.deepEqual(await readdir(path.join(libraryRoot, 'objects')), [])
  assert.deepEqual(await readdir(path.join(libraryRoot, '.trash', 'objects')), [left.sha256])

  await library.restore(left.id)
  assert.deepEqual(await readdir(path.join(libraryRoot, 'objects')), [left.sha256])
  await library.restore(right.id)
  assert.deepEqual((await library.list()).map((entry) => entry.id).sort(), [left.id, right.id].sort())
})

test('readText enforces document type, size and binary guards', async (t) => {
  const { library, sourceRoot } = await fixture(t)
  const binary = path.join(sourceRoot, 'archive.bin')
  const nulText = path.join(sourceRoot, 'nul.txt')
  const longText = path.join(sourceRoot, 'long.txt')
  await writeFile(binary, Buffer.from([1, 2, 3]))
  await writeFile(nulText, Buffer.from([65, 0, 66]))
  await writeFile(longText, '123456789')
  const [binaryDocument, nulDocument, longDocument] = await library.import({
    projectId: 'studio',
    filePaths: [binary, nulText, longText],
  })

  await assert.rejects(library.readText(binaryDocument.id), expectCode('NOT_TEXT_DOCUMENT'))
  await assert.rejects(library.readText(nulDocument.id), expectCode('BINARY_TEXT'))
  await assert.rejects(library.readText(longDocument.id, { maxBytes: 5 }), expectCode('TEXT_TOO_LARGE'))
})

test('rejects corrupt manifests and symlinked internal storage', async (t) => {
  const { sandbox, library, libraryRoot } = await fixture(t)
  await library.ensure()
  await writeFile(path.join(libraryRoot, 'manifests', 'corrupt.json'), '{broken', 'utf8')
  await assert.rejects(library.list(), expectCode('MANIFEST_INVALID'))
  await rm(path.join(libraryRoot, 'manifests', 'corrupt.json'))

  const outside = path.join(sandbox, 'outside-objects')
  await mkdir(outside)
  await rm(path.join(libraryRoot, 'objects'), { recursive: true })
  try {
    await symlink(outside, path.join(libraryRoot, 'objects'), process.platform === 'win32' ? 'junction' : 'dir')
  } catch (error) {
    if (error?.code === 'EPERM' || error?.code === 'EACCES') {
      t.diagnostic('Symlink creation is not permitted on this host; corrupt-manifest guard was still verified.')
      return
    }
    throw error
  }

  const reloaded = createDocumentLibrary({ root: libraryRoot })
  await assert.rejects(reloaded.ensure(), expectCode('SYMLINK_NOT_ALLOWED'))
})

test('two injected roots remain fully isolated', async (t) => {
  const { sandbox, sourceRoot } = await fixture(t)
  const source = path.join(sourceRoot, 'isolated.md')
  await writeFile(source, '# Isolated')
  const left = createDocumentLibrary({ root: path.join(sandbox, 'left'), idFactory: () => 'left-document' })
  const right = createDocumentLibrary({ root: path.join(sandbox, 'right'), idFactory: () => 'right-document' })

  await left.import({ projectId: 'studio', filePaths: [source] })
  assert.equal((await left.list()).length, 1)
  assert.equal((await right.list()).length, 0)
})

test('managed documents keep immutable version history and can revert without losing newer objects', async (t) => {
  const { library, libraryRoot, sourceRoot } = await fixture(t)
  const firstSource = path.join(sourceRoot, 'brief-v1.md')
  const secondSource = path.join(sourceRoot, 'brief-v2.md')
  await writeFile(firstSource, '# Version 1\n', 'utf8')
  await writeFile(secondSource, '# Version 2\n', 'utf8')

  const [first] = await library.import({
    projectId: 'studio',
    filePaths: [firstSource],
    operationItemId: 'job-item-1',
  })
  assert.equal(first.revision, 1)

  const [idempotent] = await library.import({
    projectId: 'studio',
    filePaths: [firstSource],
    operationItemId: 'job-item-1',
  })
  assert.equal(idempotent.id, first.id)
  assert.equal((await readdir(path.join(libraryRoot, 'manifests'))).length, 1)

  const [replacementSelection] = await library.describeSelection([secondSource])
  const second = await library.replaceVersion(first.id, replacementSelection.selectionToken)
  assert.equal(second.revision, 2)
  assert.notEqual(second.sha256, first.sha256)
  assert.equal((await library.readText(first.id)).text, '# Version 2\n')

  const historyAfterReplace = await library.listHistory(first.id)
  assert.deepEqual(historyAfterReplace.map((entry) => entry.action), ['REPLACE', 'IMPORT'])
  assert.equal(historyAfterReplace[0].current, true)

  const reverted = await library.revertVersion(first.id, 1)
  assert.equal(reverted.revision, 3)
  assert.equal(reverted.sha256, first.sha256)
  assert.equal((await library.readText(first.id)).text, '# Version 1\n')
  assert.deepEqual((await readdir(path.join(libraryRoot, 'objects'))).sort(), [first.sha256, second.sha256].sort())

  const plan = await library.planDelete(first.id)
  await library.applyDelete({ operationId: plan.operationId, planHash: plan.planHash })
  const restored = await library.restore(first.id)
  assert.equal(restored.revision, 5)
  assert.deepEqual((await library.listHistory(first.id)).map((entry) => entry.action), ['RESTORE', 'DELETE', 'REVERT', 'REPLACE', 'IMPORT'])
})
