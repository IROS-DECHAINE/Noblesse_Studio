import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createFortnitePrimebotFetcher,
  normaliseMetric,
  summariseMetricSeries,
} from '../../electron/lib/fortniteData.mjs'

const response = (payload) => ({ ok: true, json: async () => payload })

test('preserves Epic privacy suppression as null instead of inventing zero', () => {
  const series = normaliseMetric([
    { timestamp: '2026-08-20T22:00:00Z', value: null },
    { timestamp: '2026-08-20T23:00:00Z', value: 7 },
  ])

  assert.deepEqual(series.map((point) => point.value), [null, 7])
  assert.deepEqual(series.map((point) => point.available), [false, true])
})

test('marks partial totals and keeps peaks accurate when some buckets are suppressed', () => {
  const series = normaliseMetric([
    { timestamp: '2026-08-20T22:00:00Z', value: null },
    { timestamp: '2026-08-20T23:00:00Z', value: 7 },
  ])

  assert.deepEqual(summariseMetricSeries(series, 'peak'), {
    value: 7,
    available: true,
    complete: false,
    availableBuckets: 1,
    totalBuckets: 2,
    suppressedBuckets: 1,
  })
  assert.equal(summariseMetricSeries(series, 'total').value, 7)
})

test('returns a suppressed source state when the official API is reachable but all buckets are private', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/metrics/minute')) {
      return response({ peakCCU: [{ timestamp: '2026-08-20T23:00:00Z', value: null }] })
    }
    if (url.includes('/metrics/hour')) {
      return response({
        peakCCU: [{ timestamp: '2026-08-20T23:00:00Z', value: null }],
        plays: [{ timestamp: '2026-08-20T23:00:00Z', value: null }],
        minutesPlayed: [{ timestamp: '2026-08-20T23:00:00Z', value: null }],
      })
    }
    return response({ code: '4971-3856-2517', title: 'PRIMEBOT RUSH' })
  }

  const getStats = createFortnitePrimebotFetcher({ fetchImpl, now: () => Date.parse('2026-08-21T00:00:00Z') })
  const stats = await getStats()

  assert.equal(stats.connected, true)
  assert.equal(stats.dataStatus, 'SUPPRESSED')
  assert.equal(stats.currentPlayers, null)
  assert.equal(stats.currentPlayersSuppressed, true)
  assert.equal(stats.peak24h, null)
  assert.equal(stats.plays24h, null)
})

test('reports incomplete 24-hour totals without hiding the known portion', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/metrics/minute')) {
      return response({ peakCCU: [{ timestamp: '2026-08-20T23:00:00Z', value: 6 }] })
    }
    if (url.includes('/metrics/hour')) {
      return response({
        peakCCU: [
          { timestamp: '2026-08-20T22:00:00Z', value: null },
          { timestamp: '2026-08-20T23:00:00Z', value: 8 },
        ],
        plays: [
          { timestamp: '2026-08-20T22:00:00Z', value: null },
          { timestamp: '2026-08-20T23:00:00Z', value: 11 },
        ],
        minutesPlayed: [
          { timestamp: '2026-08-20T22:00:00Z', value: null },
          { timestamp: '2026-08-20T23:00:00Z', value: 74 },
        ],
      })
    }
    return response({ code: '4971-3856-2517', title: 'PRIMEBOT RUSH' })
  }

  const stats = await createFortnitePrimebotFetcher({ fetchImpl })()

  assert.equal(stats.dataStatus, 'AVAILABLE')
  assert.equal(stats.currentPlayers, 6)
  assert.equal(stats.peak24h, 8)
  assert.equal(stats.plays24h, 11)
  assert.equal(stats.plays24hComplete, false)
})

test('distinguishes an empty official response from privacy-suppressed buckets', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/metrics/')) {
      return response({ peakCCU: [], plays: [], minutesPlayed: [], uniquePlayers: [] })
    }
    return response({ code: '4971-3856-2517', title: 'PRIMEBOT RUSH' })
  }

  const stats = await createFortnitePrimebotFetcher({ fetchImpl })()

  assert.equal(stats.connected, true)
  assert.equal(stats.dataStatus, 'UNAVAILABLE')
  assert.equal(stats.currentPlayersSuppressed, false)
  assert.equal(stats.peak24hSuppressed, false)
  assert.equal(stats.hourlyPeakCCU.length, 0)
})

test('uses exactly the latest 24 hourly buckets when Epic returns a boundary bucket', async () => {
  const hourly = Array.from({ length: 25 }, (_, index) => ({
    timestamp: new Date(Date.UTC(2026, 7, 19, index)).toISOString(),
    value: index + 1,
  }))
  const fetchImpl = async (url) => {
    if (url.includes('/metrics/minute')) {
      return response({ peakCCU: [hourly.at(-1)] })
    }
    if (url.includes('/metrics/hour')) {
      return response({ peakCCU: hourly, plays: hourly, minutesPlayed: hourly })
    }
    return response({ code: '4971-3856-2517', title: 'PRIMEBOT RUSH' })
  }

  const stats = await createFortnitePrimebotFetcher({ fetchImpl })()

  assert.equal(stats.hourlyPeakCCU.length, 24)
  assert.equal(stats.hourlyPeakCCU[0].value, 2)
  assert.equal(stats.peak24h, 25)
  assert.equal(stats.plays24h, 324)
})

test('force refresh bypasses the cache without changing normal cached reads', async () => {
  let metricCalls = 0
  const fetchImpl = async (url) => {
    if (url.includes('/metrics/minute')) {
      metricCalls += 1
      return response({ peakCCU: [{ timestamp: '2026-08-21T00:00:00Z', value: 5 + metricCalls }] })
    }
    if (url.includes('/metrics/hour')) {
      return response({
        peakCCU: [{ timestamp: '2026-08-21T00:00:00Z', value: 8 }],
        plays: [{ timestamp: '2026-08-21T00:00:00Z', value: 10 }],
        minutesPlayed: [{ timestamp: '2026-08-21T00:00:00Z', value: 60 }],
      })
    }
    return response({ code: '4971-3856-2517', title: 'PRIMEBOT RUSH' })
  }
  const getStats = createFortnitePrimebotFetcher({ fetchImpl })

  const first = await getStats()
  const cached = await getStats()
  const refreshed = await getStats({ force: true })

  assert.equal(first.currentPlayers, 6)
  assert.equal(cached.currentPlayers, 6)
  assert.equal(refreshed.currentPlayers, 7)
  assert.equal(metricCalls, 2)
})

test('keeps the last successful observation when a forced refresh fails', async () => {
  let fail = false
  let currentTime = Date.parse('2026-08-21T00:00:00Z')
  const fetchImpl = async (url) => {
    if (fail) throw new Error('network offline')
    if (url.includes('/metrics/minute')) {
      return response({ peakCCU: [{ timestamp: '2026-08-21T00:00:00Z', value: 9 }] })
    }
    if (url.includes('/metrics/hour')) {
      return response({
        peakCCU: [{ timestamp: '2026-08-21T00:00:00Z', value: 12 }],
        plays: [{ timestamp: '2026-08-21T00:00:00Z', value: 17 }],
        minutesPlayed: [{ timestamp: '2026-08-21T00:00:00Z', value: 93 }],
      })
    }
    return response({ code: '4971-3856-2517', title: 'PRIMEBOT RUSH' })
  }
  const getStats = createFortnitePrimebotFetcher({ fetchImpl, now: () => currentTime })

  const fresh = await getStats()
  fail = true
  currentTime += 6 * 60 * 1000
  const stale = await getStats({ force: true })

  assert.equal(fresh.dataStatus, 'AVAILABLE')
  assert.equal(stale.dataStatus, 'STALE')
  assert.equal(stale.stale, true)
  assert.equal(stale.connected, false)
  assert.equal(stale.currentPlayers, 9)
  assert.equal(stale.updatedAt, fresh.updatedAt)
  assert.notEqual(stale.checkedAt, fresh.checkedAt)
})
