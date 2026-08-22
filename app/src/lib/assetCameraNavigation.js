const NAVIGATION_KEYS = new Set(['z', 'q', 's', 'd', 'a', 'e', 'shift'])

export const normalizeAssetNavigationKey = (value) => {
  const key = String(value || '').trim().toLowerCase()
  return NAVIGATION_KEYS.has(key) ? key : ''
}

export const readAssetNavigationIntent = (pressedKeys) => {
  const has = (key) => pressedKeys?.has?.(key) === true
  return {
    forward: Number(has('z')) - Number(has('s')),
    right: Number(has('d')) - Number(has('q')),
    vertical: Number(has('e')) - Number(has('a')),
    precise: has('shift'),
  }
}

export const clampAssetNavigationDelta = (deltaSeconds) => (
  Number.isFinite(deltaSeconds) ? Math.min(Math.max(deltaSeconds, 0), 0.05) : 0
)

export const computeAssetNavigationSpeed = ({ distanceToTarget, precise }) => {
  const distance = Number.isFinite(distanceToTarget) ? Math.max(0.1, distanceToTarget) : 1
  const unitsPerSecond = Math.min(Math.max(distance * 0.42, 0.28), 12)
  return unitsPerSecond * (precise ? 0.2 : 1)
}

export const computeAssetNavigationBlend = ({ deltaSeconds, accelerating }) => {
  const delta = clampAssetNavigationDelta(deltaSeconds)
  const response = accelerating ? 6.5 : 7
  return 1 - Math.exp(-response * delta)
}

export const dampAssetNavigationValue = ({ current, target, deltaSeconds, accelerating }) => {
  const from = Number.isFinite(current) ? current : 0
  const to = Number.isFinite(target) ? target : 0
  return from + (to - from) * computeAssetNavigationBlend({ deltaSeconds, accelerating })
}
