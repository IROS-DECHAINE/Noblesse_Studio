import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDefaultRoadmapProgress,
  buildRoadmapOverrides,
  createRoadmapWorkspaceEnvelope,
  getRoadmapSnapshot,
  loadRoadmapWorkspace,
  mergeRoadmapProgress,
  portfolioProjects,
  PROJECT_ROADMAP_LEGACY_STORAGE_KEY,
  PROJECT_ROADMAP_SCHEMA_VERSION,
  PROJECT_ROADMAP_STORAGE_KEY,
  resolveSelectedProjectId,
  saveRoadmapWorkspace,
  toggleRoadmapStep,
  validatePortfolioProjects,
} from './projectRoadmaps.js'

test('roadmap defaults mirror only canonically proven milestones', () => {
  const progress = buildDefaultRoadmapProgress()

  assert.equal(progress['primebot-rush'].foundations, true)
  assert.equal(progress['primebot-rush']['field-playtest'], false)
  assert.equal(progress['prime-industry']['product-canon'], true)
  assert.equal(progress['prime-industry']['bakery-career'], false)
  assert.equal(progress['how-many-boxes']['workshop-chest'], true)
  assert.equal(progress['how-many-boxes']['roblox-release'], false)
})

test('saved progress is merged without accepting stale projects or non-booleans', () => {
  const progress = mergeRoadmapProgress({
    'primebot-rush': { foundations: false, 'field-playtest': true, 'runtime-cleanup': 'yes' },
    'retired-project': { launch: true },
  })

  assert.equal(progress['primebot-rush'].foundations, false)
  assert.equal(progress['primebot-rush']['field-playtest'], true)
  assert.equal(progress['primebot-rush']['runtime-cleanup'], false)
  assert.equal('retired-project' in progress, false)
})

test('toggling one bubble is immutable and scoped to one project', () => {
  const initial = buildDefaultRoadmapProgress()
  const updated = toggleRoadmapStep(initial, 'prime-industry', 'bakery-career')

  assert.notEqual(updated, initial)
  assert.notEqual(updated['prime-industry'], initial['prime-industry'])
  assert.equal(updated['prime-industry']['bakery-career'], true)
  assert.equal(initial['prime-industry']['bakery-career'], false)
  assert.deepEqual(updated['primebot-rush'], initial['primebot-rush'])
})

test('every project and roadmap step has a stable unique identifier', () => {
  assert.equal(new Set(portfolioProjects.map((project) => project.id)).size, portfolioProjects.length)
  for (const project of portfolioProjects) {
    assert.equal(new Set(project.roadmap.map((step) => step.id)).size, project.roadmap.length)
  }
})

test('v2 stores only manual overrides so future canon defaults can evolve', () => {
  const progress = buildDefaultRoadmapProgress()
  progress['primebot-rush']['runtime-cleanup'] = true
  const overrides = buildRoadmapOverrides(progress)

  assert.deepEqual(overrides, { 'primebot-rush': { 'runtime-cleanup': true } })

  const futureProjects = [{
    id: 'future-project',
    name: 'Future',
    roadmapName: 'Future',
    roadmap: [{ id: 'canon-proof', title: 'Canon proof', description: 'Proof', defaultDone: true }],
  }]
  const restored = mergeRoadmapProgress({ schemaVersion: PROJECT_ROADMAP_SCHEMA_VERSION, overrides: {} }, futureProjects)
  assert.equal(restored['future-project']['canon-proof'], true)
})

test('workspace envelope keeps a valid project selection and timestamp', () => {
  const progress = buildDefaultRoadmapProgress()
  const envelope = createRoadmapWorkspaceEnvelope(
    { progress, selectedProjectId: 'prime-industry' },
    portfolioProjects,
    new Date('2026-08-21T10:00:00.000Z'),
  )

  assert.equal(envelope.schemaVersion, PROJECT_ROADMAP_SCHEMA_VERSION)
  assert.equal(envelope.selectedProjectId, 'prime-industry')
  assert.equal(envelope.updatedAt, '2026-08-21T10:00:00.000Z')
  assert.deepEqual(envelope.overrides, {})
  assert.equal(resolveSelectedProjectId('retired-project'), 'primebot-rush')
})

test('loading migrates a legacy snapshot and tolerates corrupt or unavailable storage', () => {
  const legacy = buildDefaultRoadmapProgress()
  legacy['prime-industry']['bakery-career'] = true
  const legacyStorage = {
    getItem: (key) => key === PROJECT_ROADMAP_LEGACY_STORAGE_KEY ? JSON.stringify(legacy) : null,
  }

  const migrated = loadRoadmapWorkspace(legacyStorage)
  assert.equal(migrated.source, 'v1')
  assert.equal(migrated.progress['prime-industry']['bakery-career'], true)
  assert.equal(loadRoadmapWorkspace({ getItem: () => '{broken' }).source, 'default')
  assert.equal(loadRoadmapWorkspace({ getItem: () => { throw new Error('denied') } }).source, 'default')
})

test('saving writes v2, removes v1 and reports storage failures without throwing', () => {
  const progress = buildDefaultRoadmapProgress()
  const writes = []
  const removals = []
  const storage = {
    setItem: (...args) => writes.push(args),
    removeItem: (...args) => removals.push(args),
  }

  assert.equal(saveRoadmapWorkspace(storage, { progress, selectedProjectId: 'how-many-boxes' }), true)
  assert.equal(writes[0][0], PROJECT_ROADMAP_STORAGE_KEY)
  assert.equal(JSON.parse(writes[0][1]).selectedProjectId, 'how-many-boxes')
  assert.deepEqual(removals, [[PROJECT_ROADMAP_LEGACY_STORAGE_KEY]])
  assert.equal(saveRoadmapWorkspace({ setItem: () => { throw new Error('quota') } }, { progress }), false)
})

test('roadmap snapshots and registry validation stay safe for future projects', () => {
  const emptySnapshot = getRoadmapSnapshot({ roadmap: [] }, {})
  assert.equal(emptySnapshot.progressPercent, 0)
  assert.equal(emptySnapshot.nextStep, null)
  assert.equal(emptySnapshot.isComplete, false)
  assert.deepEqual(validatePortfolioProjects(), [])
  assert.ok(validatePortfolioProjects([{ id: 'empty', name: 'Empty', roadmapName: 'Empty', roadmap: [] }]).some((error) => error.includes('Roadmap vide')))
})

test('unknown roadmap targets never mutate progress', () => {
  const progress = buildDefaultRoadmapProgress()
  assert.equal(toggleRoadmapStep(progress, 'missing-project', 'missing-step'), progress)
})
