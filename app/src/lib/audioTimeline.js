const finitePositive = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export const resolvePlaybackDuration = (measuredDuration, catalogDuration = 0) => (
  finitePositive(measuredDuration) || finitePositive(catalogDuration)
)

export const clampPlaybackTime = (value, duration) => {
  const maximum = finitePositive(duration)
  if (!maximum) return 0
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.min(maximum, Math.max(0, parsed))
}

export const playbackProgress = (currentTime, duration) => {
  const maximum = finitePositive(duration)
  if (!maximum) return 0
  return (clampPlaybackTime(currentTime, maximum) / maximum) * 100
}

export const formatPlaybackTime = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remainingSeconds = total % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}
