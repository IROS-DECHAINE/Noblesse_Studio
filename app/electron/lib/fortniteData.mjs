const DEFAULT_ISLAND_CODE = '4971-3856-2517'
const DEFAULT_API_ROOT = 'https://api.fortnite.com/ecosystem/v1'
const DEFAULT_PRIVACY_THRESHOLD = 5

export const normaliseMetric = (series = []) => series.map((entry) => ({
  timestamp: entry?.timestamp || null,
  value: Number.isFinite(entry?.value) ? Number(entry.value) : null,
  available: Number.isFinite(entry?.value),
}))

export const latestMetricBuckets = (series = [], limit = 24) => [...series]
  .sort((left, right) => {
    const leftTime = Date.parse(left.timestamp || '')
    const rightTime = Date.parse(right.timestamp || '')
    if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return 0
    return leftTime - rightTime
  })
  .slice(-limit)

export const summariseMetricSeries = (series = [], mode = 'total') => {
  const available = series.filter((entry) => entry.available)
  const values = available.map((entry) => entry.value)
  const complete = series.length > 0 && available.length === series.length
  let value = null

  if (values.length) {
    value = mode === 'peak'
      ? Math.max(...values)
      : values.reduce((sum, point) => sum + point, 0)
  }

  return {
    value,
    available: values.length > 0,
    complete,
    availableBuckets: available.length,
    totalBuckets: series.length,
    suppressedBuckets: Math.max(0, series.length - available.length),
  }
}

const fetchJson = async (fetchImpl, url, timeout = 6500) => {
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeout),
  })
  if (!response.ok) throw new Error(`Source distante indisponible (${response.status})`)
  return response.json()
}

export const createFortnitePrimebotFetcher = ({
  fetchImpl = fetch,
  apiRoot = DEFAULT_API_ROOT,
  islandCode = DEFAULT_ISLAND_CODE,
  privacyThreshold = DEFAULT_PRIVACY_THRESHOLD,
  cacheTtlMs = 5 * 60 * 1000,
  now = () => Date.now(),
} = {}) => {
  let cache = { expiresAt: 0, payload: null }

  return async ({ force = false } = {}) => {
    if (!force && cache.payload && now() < cache.expiresAt) return cache.payload

    try {
      const checkedAt = new Date(now()).toISOString()
      const [island, minuteMetrics, hourlyMetrics] = await Promise.all([
        fetchJson(fetchImpl, `${apiRoot}/islands/${islandCode}`),
        fetchJson(fetchImpl, `${apiRoot}/islands/${islandCode}/metrics/minute?metrics=peakCCU&metrics=plays&metrics=uniquePlayers`),
        fetchJson(fetchImpl, `${apiRoot}/islands/${islandCode}/metrics/hour?metrics=peakCCU&metrics=plays&metrics=minutesPlayed&metrics=uniquePlayers`),
      ])

      const minutePeakCCU = latestMetricBuckets(normaliseMetric(minuteMetrics.peakCCU), 6)
      const hourlyPeakCCU = latestMetricBuckets(normaliseMetric(hourlyMetrics.peakCCU), 24)
      const hourlyPlays = latestMetricBuckets(normaliseMetric(hourlyMetrics.plays), 24)
      const hourlyMinutes = latestMetricBuckets(normaliseMetric(hourlyMetrics.minutesPlayed), 24)
      const latestMinute = minutePeakCCU.at(-1)
      const peak24h = summariseMetricSeries(hourlyPeakCCU, 'peak')
      const plays24h = summariseMetricSeries(hourlyPlays, 'total')
      const minutesPlayed24h = summariseMetricSeries(hourlyMinutes, 'total')
      const hasPublicAudienceData = Boolean(latestMinute?.available || peak24h.available)
      const allMetricBuckets = [...minutePeakCCU, ...hourlyPeakCCU, ...hourlyPlays, ...hourlyMinutes]
      const hasMetricBuckets = allMetricBuckets.length > 0
      const hasSuppressedBuckets = allMetricBuckets.some((entry) => !entry.available)
      const dataStatus = hasPublicAudienceData
        ? 'AVAILABLE'
        : (hasMetricBuckets && hasSuppressedBuckets ? 'SUPPRESSED' : 'UNAVAILABLE')

      const payload = {
        connected: true,
        dataStatus,
        stale: false,
        source: 'Epic Games · Fortnite Data API',
        checkedAt,
        updatedAt: checkedAt,
        island,
        currentPlayers: latestMinute?.available ? latestMinute.value : null,
        currentPlayersAvailable: Boolean(latestMinute?.available),
        currentPlayersSuppressed: Boolean(latestMinute && !latestMinute.available),
        peak24h: peak24h.value,
        peak24hAvailable: peak24h.available,
        peak24hSuppressed: !peak24h.available && peak24h.suppressedBuckets > 0,
        plays24h: plays24h.value,
        plays24hAvailable: plays24h.available,
        plays24hComplete: plays24h.complete,
        plays24hSuppressed: !plays24h.available && plays24h.suppressedBuckets > 0,
        minutesPlayed24h: minutesPlayed24h.value,
        minutesPlayed24hAvailable: minutesPlayed24h.available,
        minutesPlayed24hComplete: minutesPlayed24h.complete,
        minutesPlayed24hSuppressed: !minutesPlayed24h.available && minutesPlayed24h.suppressedBuckets > 0,
        hourlyPeakCCU,
        threshold: privacyThreshold,
      }

      cache = { expiresAt: now() + cacheTtlMs, payload }
      return payload
    } catch (error) {
      const checkedAt = new Date(now()).toISOString()
      const message = error instanceof Error ? error.message : 'Source indisponible'
      if (cache.payload) {
        return {
          ...cache.payload,
          connected: false,
          dataStatus: 'STALE',
          stale: true,
          checkedAt,
          error: message,
        }
      }
      return {
        connected: false,
        dataStatus: 'UNAVAILABLE',
        stale: false,
        source: 'Epic Games · Fortnite Data API',
        checkedAt,
        updatedAt: null,
        island: { code: islandCode, title: 'PRIMEBOT RUSH', createdIn: 'UEFN' },
        currentPlayers: null,
        currentPlayersAvailable: false,
        currentPlayersSuppressed: false,
        peak24h: null,
        peak24hAvailable: false,
        peak24hSuppressed: false,
        plays24h: null,
        plays24hAvailable: false,
        plays24hComplete: false,
        plays24hSuppressed: false,
        minutesPlayed24h: null,
        minutesPlayed24hAvailable: false,
        minutesPlayed24hComplete: false,
        minutesPlayed24hSuppressed: false,
        hourlyPeakCCU: [],
        threshold: privacyThreshold,
        error: message,
      }
    }
  }
}
