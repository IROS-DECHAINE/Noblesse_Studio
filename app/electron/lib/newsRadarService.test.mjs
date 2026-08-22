import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createNewsRadarService, NEWS_RADAR_SOURCES, parseEpicStatus, parseOfficialRss } from './newsRadarService.mjs'

const temporaryRoot = async (t) => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'noblesse-news-radar-'))
  t.after(async () => rm(rootDir, { recursive: true, force: true }))
  return rootDir
}

test('lit un flux RSS officiel et refuse les liens hors domaine', () => {
  const source = NEWS_RADAR_SOURCES[0]
  const items = parseOfficialRss(`<?xml version="1.0"?><rss><channel>
    <item><title><![CDATA[UEFN &amp; nouveautés]]></title><link>https://www.unrealengine.com/news/uefn-update</link><description><![CDATA[<p>Une mise à jour utile.</p>]]></description><pubDate>Fri, 21 Aug 2026 10:00:00 GMT</pubDate></item>
    <item><title>Piège</title><link>https://example.com/faux</link><description>Ignorer</description></item>
  </channel></rss>`, source)
  assert.equal(items.length, 1)
  assert.equal(items[0].title, 'UEFN & nouveautés')
  assert.equal(items[0].summary, 'Une mise à jour utile.')
  assert.equal(items[0].topic, 'unreal')
})

test('met les incidents Epic non résolus en évidence', () => {
  const items = parseEpicStatus({ incidents: [{
    id: 'incident-1',
    name: 'Fab Plugin Issue',
    status: 'investigating',
    impact: 'minor',
    shortlink: 'https://stspg.io/example',
    updated_at: '2026-08-21T12:00:00.000Z',
    incident_updates: [{ body: 'Investigation en cours.' }],
  }] })
  assert.equal(items.length, 1)
  assert.equal(items[0].active, true)
  assert.equal(items[0].kind, 'incident')
})

test('agrège les trois sources, persiste un cache sûr et le réutilise pendant dix minutes', async (t) => {
  const rootDir = await temporaryRoot(t)
  let requestCount = 0
  const service = createNewsRadarService({
    rootDir,
    now: () => new Date('2026-08-22T10:00:00.000Z'),
    fetchImpl: async (url) => {
      requestCount += 1
      if (String(url).includes('incidents.json')) return new Response(JSON.stringify({ incidents: [{ id: 'epic-1', name: 'Incident résolu', status: 'resolved', shortlink: 'https://stspg.io/epic-1', updated_at: '2026-08-22T09:00:00.000Z', incident_updates: [] }] }), { status: 200 })
      const link = String(url).includes('roblox') ? 'https://devforum.roblox.com/t/studio-update/123' : 'https://www.unrealengine.com/news/uefn-update'
      return new Response(`<rss><channel><item><title>Actualité officielle</title><link>${link}</link><description>Résumé</description><pubDate>Sat, 22 Aug 2026 08:00:00 GMT</pubDate></item></channel></rss>`, { status: 200 })
    },
  })
  const first = await service.snapshot({ force: true })
  assert.equal(first.items.length, 3)
  assert.equal(first.sources.every((source) => source.ok), true)
  assert.equal(requestCount, 3)
  const cached = await service.snapshot()
  assert.equal(cached.items.length, 3)
  assert.equal(requestCount, 3)
  const stored = await readFile(service.paths.statePath, 'utf8')
  assert.doesNotMatch(stored, /example\.com/)
  assert.match(stored, /Actualité officielle/)
})
