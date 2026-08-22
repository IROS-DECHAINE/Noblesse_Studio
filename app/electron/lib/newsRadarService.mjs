import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const STATE_FILE_NAME = 'news-radar.v1.json'
const CACHE_TTL_MS = 10 * 60 * 1000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_ITEMS_PER_SOURCE = 8
const MAX_ITEMS = 18

export const NEWS_RADAR_SOURCES = Object.freeze([
  Object.freeze({
    id: 'unreal',
    label: 'Unreal Engine',
    topic: 'unreal',
    feedUrl: 'https://www.unrealengine.com/rss',
    homeUrl: 'https://www.unrealengine.com/news',
    kind: 'rss',
    allowedHosts: Object.freeze(['www.unrealengine.com', 'unrealengine.com']),
  }),
  Object.freeze({
    id: 'roblox',
    label: 'Roblox DevForum',
    topic: 'roblox',
    feedUrl: 'https://devforum.roblox.com/c/updates/announcements/36.rss',
    homeUrl: 'https://devforum.roblox.com/c/updates/announcements/36',
    kind: 'rss',
    allowedHosts: Object.freeze(['devforum.roblox.com']),
  }),
  Object.freeze({
    id: 'epic-status',
    label: 'État Epic Games',
    topic: 'epic-status',
    feedUrl: 'https://status.epicgames.com/api/v2/incidents.json',
    homeUrl: 'https://status.epicgames.com',
    kind: 'epic-status',
    allowedHosts: Object.freeze(['status.epicgames.com', 'stspg.io']),
  }),
])

const nowIso = (now) => new Date(now()).toISOString()
const clone = (value) => JSON.parse(JSON.stringify(value))
const cleanText = (value, max = 460) => String(value || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&apos;|&#39;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max)

const cleanError = (error) => cleanText(error instanceof Error ? error.message : error || 'Source indisponible', 220)
const stableId = (...parts) => createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24)

const safeHttpsUrl = (value, allowedHosts) => {
  try {
    const parsed = new URL(String(value || '').trim())
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !allowedHosts.includes(parsed.hostname.toLowerCase())) return ''
    return parsed.toString()
  } catch {
    return ''
  }
}

const tagValue = (block, tag) => {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return match?.[1] || ''
}

export const parseOfficialRss = (xml, source) => {
  if (typeof xml !== 'string' || !source?.id) throw new Error('Flux RSS officiel invalide.')
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)]
    .slice(0, MAX_ITEMS_PER_SOURCE)
    .flatMap((match) => {
      const block = match[1]
      const title = cleanText(tagValue(block, 'title'), 180)
      const url = safeHttpsUrl(cleanText(tagValue(block, 'link'), 1800), source.allowedHosts)
      if (!title || !url) return []
      const publishedValue = cleanText(tagValue(block, 'pubDate') || tagValue(block, 'dc:date'), 120)
      const publishedAt = Number.isFinite(new Date(publishedValue).getTime()) ? new Date(publishedValue).toISOString() : null
      return [{
        id: stableId(source.id, url, title),
        sourceId: source.id,
        sourceLabel: source.label,
        topic: source.topic,
        kind: 'news',
        title,
        summary: cleanText(tagValue(block, 'description') || tagValue(block, 'content:encoded')),
        url,
        publishedAt,
        active: false,
      }]
    })
}

export const parseEpicStatus = (payload, source = NEWS_RADAR_SOURCES.find((entry) => entry.id === 'epic-status')) => {
  if (!payload || !Array.isArray(payload.incidents)) throw new Error('État Epic Games illisible.')
  return payload.incidents.slice(0, MAX_ITEMS_PER_SOURCE).flatMap((incident) => {
    const title = cleanText(incident?.name, 180)
    const url = safeHttpsUrl(incident?.shortlink || source.homeUrl, source.allowedHosts)
    if (!title || !url) return []
    const update = Array.isArray(incident.incident_updates) ? incident.incident_updates[0] : null
    const publishedValue = incident.updated_at || incident.created_at
    const publishedAt = Number.isFinite(new Date(publishedValue).getTime()) ? new Date(publishedValue).toISOString() : null
    const status = cleanText(incident.status, 40)
    return [{
      id: stableId(source.id, incident.id || url, title),
      sourceId: source.id,
      sourceLabel: source.label,
      topic: source.topic,
      kind: 'incident',
      title,
      summary: cleanText(update?.body || `Incident Epic Games : ${status || 'mise à jour en cours'}.`),
      url,
      publishedAt,
      active: !['resolved', 'completed'].includes(status.toLowerCase()),
      status,
      impact: cleanText(incident.impact, 40),
    }]
  })
}

const emptySnapshot = () => ({
  schemaVersion: 1,
  available: true,
  refreshedAt: null,
  stale: true,
  items: [],
  sources: NEWS_RADAR_SOURCES.map((source) => ({ id: source.id, label: source.label, topic: source.topic, homeUrl: source.homeUrl, ok: false, error: '' })),
  error: '',
})

const normalizeSnapshot = (value) => {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.items)) return emptySnapshot()
  const sourceById = new Map(NEWS_RADAR_SOURCES.map((source) => [source.id, source]))
  const items = value.items.slice(0, MAX_ITEMS).flatMap((item) => {
    const source = sourceById.get(item?.sourceId)
    const url = source ? safeHttpsUrl(item?.url, source.allowedHosts) : ''
    const title = cleanText(item?.title, 180)
    if (!source || !url || !title) return []
    return [{
      id: cleanText(item.id, 80) || stableId(source.id, url, title),
      sourceId: source.id,
      sourceLabel: source.label,
      topic: source.topic,
      kind: item.kind === 'incident' ? 'incident' : 'news',
      title,
      summary: cleanText(item.summary),
      url,
      publishedAt: Number.isFinite(new Date(item.publishedAt).getTime()) ? new Date(item.publishedAt).toISOString() : null,
      active: item.active === true,
      ...(item.status ? { status: cleanText(item.status, 40) } : {}),
      ...(item.impact ? { impact: cleanText(item.impact, 40) } : {}),
    }]
  })
  const storedSources = new Map((Array.isArray(value.sources) ? value.sources : []).map((entry) => [entry?.id, entry]))
  return {
    ...emptySnapshot(),
    refreshedAt: Number.isFinite(new Date(value.refreshedAt).getTime()) ? new Date(value.refreshedAt).toISOString() : null,
    stale: value.stale !== false,
    items,
    sources: NEWS_RADAR_SOURCES.map((source) => ({
      id: source.id,
      label: source.label,
      topic: source.topic,
      homeUrl: source.homeUrl,
      ok: storedSources.get(source.id)?.ok === true,
      error: cleanError(storedSources.get(source.id)?.error || ''),
    })),
    error: cleanError(value.error || ''),
  }
}

export const createNewsRadarService = ({ rootDir, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) => {
  if (typeof rootDir !== 'string' || !rootDir.trim()) throw new TypeError('rootDir Radar requis.')
  if (typeof fetchImpl !== 'function') throw new TypeError('Client réseau Radar requis.')
  const directory = path.resolve(rootDir)
  const statePath = path.join(directory, STATE_FILE_NAME)
  const backupPath = `${statePath}.backup`
  let state = emptySnapshot()
  let initialized = false
  let refreshPromise = null
  let writer = Promise.resolve()

  const publicSnapshot = () => Object.freeze(clone(state))
  const enqueueWrite = (operation) => {
    const result = writer.then(operation, operation)
    writer = result.catch(() => undefined)
    return result
  }
  const persist = () => enqueueWrite(async () => {
    await mkdir(directory, { recursive: true })
    const temporaryPath = path.join(directory, `.${STATE_FILE_NAME}.${process.pid}.${Date.now()}.tmp`)
    try {
      await writeFile(temporaryPath, `${JSON.stringify(normalizeSnapshot(state), null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
      await copyFile(statePath, backupPath).catch((error) => { if (error?.code !== 'ENOENT') throw error })
      await rename(temporaryPath, statePath)
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  })

  const initialize = async () => {
    if (initialized) return publicSnapshot()
    await mkdir(directory, { recursive: true })
    try {
      state = normalizeSnapshot(JSON.parse(await readFile(statePath, 'utf8')))
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        try { state = normalizeSnapshot(JSON.parse(await readFile(backupPath, 'utf8'))) } catch { state = emptySnapshot() }
      }
    }
    initialized = true
    return publicSnapshot()
  }

  const fetchSource = async (source) => {
    const response = await fetchImpl(source.feedUrl, {
      headers: { Accept: source.kind === 'rss' ? 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8' : 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`${source.label} : HTTP ${response.status}`)
    const contentLength = Number(response.headers?.get?.('content-length'))
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new Error(`${source.label} : réponse trop volumineuse.`)
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new Error(`${source.label} : réponse trop volumineuse.`)
    return source.kind === 'rss' ? parseOfficialRss(text, source) : parseEpicStatus(JSON.parse(text), source)
  }

  const performRefresh = async () => {
    await initialize()
    const previousItems = state.items
    const results = await Promise.all(NEWS_RADAR_SOURCES.map(async (source) => {
      try { return { source, ok: true, items: await fetchSource(source), error: '' } }
      catch (error) { return { source, ok: false, items: previousItems.filter((item) => item.sourceId === source.id), error: cleanError(error) } }
    }))
    const successCount = results.filter((result) => result.ok).length
    const items = results.flatMap((result) => result.items).sort((left, right) => {
      if (left.active !== right.active) return left.active ? -1 : 1
      return String(right.publishedAt || '').localeCompare(String(left.publishedAt || ''))
    }).slice(0, MAX_ITEMS)
    state = normalizeSnapshot({
      schemaVersion: 1,
      available: true,
      refreshedAt: successCount ? nowIso(now) : state.refreshedAt,
      stale: successCount === 0,
      items,
      sources: results.map(({ source, ok, error }) => ({ id: source.id, ok, error })),
      error: successCount === 0 ? 'Les sources officielles sont momentanément indisponibles. Le dernier cache reste affiché.' : '',
    })
    await persist().catch(() => undefined)
    return publicSnapshot()
  }

  const snapshot = async ({ force = false } = {}) => {
    await initialize()
    const refreshedMs = new Date(state.refreshedAt).getTime()
    const fresh = Number.isFinite(refreshedMs) && new Date(now()).getTime() - refreshedMs < CACHE_TTL_MS
    if (!force && fresh) return publicSnapshot()
    refreshPromise ||= performRefresh().finally(() => { refreshPromise = null })
    return refreshPromise
  }

  return Object.freeze({ initialize, snapshot, paths: Object.freeze({ directory, statePath, backupPath }) })
}
