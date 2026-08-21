export const adjacentSound = (sounds, currentId, direction) => {
  const items = Array.isArray(sounds) ? sounds.filter((item) => item?.kind === 'sound') : []
  if (!items.length) return null
  const currentIndex = items.findIndex((item) => item.id === currentId)
  const startIndex = currentIndex >= 0 ? currentIndex : 0
  const step = Number(direction) < 0 ? -1 : 1
  return items[(startIndex + step + items.length) % items.length]
}

export const soundPosition = (sounds, currentId) => {
  const items = Array.isArray(sounds) ? sounds.filter((item) => item?.kind === 'sound') : []
  const index = items.findIndex((item) => item.id === currentId)
  return { index: index >= 0 ? index : 0, total: items.length }
}
