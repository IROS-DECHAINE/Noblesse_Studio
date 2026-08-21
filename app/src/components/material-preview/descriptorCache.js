export class PreviewDescriptorCacheError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'PreviewDescriptorCacheError'
    this.code = code
    this.details = details
  }
}

const cacheKey = (repositoryKey, assetId) => `${repositoryKey}\u0000${assetId}`

export class BoundedPreviewDescriptorCache {
  constructor({ maxEntries = 24 } = {}) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 256) {
      throw new PreviewDescriptorCacheError('INVALID_CACHE_SIZE', 'maxEntries doit être compris entre 1 et 256.')
    }
    this.maxEntries = maxEntries
    this.entries = new Map()
    this.clock = 0
  }

  key(repositoryKey, assetId) {
    if (typeof repositoryKey !== 'string' || !repositoryKey || typeof assetId !== 'string' || !assetId) {
      throw new PreviewDescriptorCacheError('INVALID_CACHE_KEY', 'repositoryKey et assetId sont obligatoires.')
    }
    return cacheKey(repositoryKey, assetId)
  }

  acquire(key, loader) {
    if (typeof loader !== 'function') {
      throw new PreviewDescriptorCacheError('INVALID_DESCRIPTOR_LOADER', 'Le chargeur de descripteur doit être une fonction.')
    }

    let entry = this.entries.get(key)
    if (!entry) {
      this.ensureCapacity()
      const controller = new AbortController()
      entry = {
        controller,
        error: null,
        invalidated: false,
        lastUsed: ++this.clock,
        promise: null,
        refs: 0,
        status: 'loading',
        value: null,
      }
      this.entries.set(key, entry)
      entry.promise = Promise.resolve()
        .then(() => loader({ signal: controller.signal }))
        .then((value) => {
          if (this.entries.get(key) === entry && !entry.invalidated) {
            entry.status = 'ready'
            entry.value = value
            entry.error = null
            entry.lastUsed = ++this.clock
          }
          return value
        })
        .catch((error) => {
          if (this.entries.get(key) === entry && !entry.invalidated) {
            entry.status = 'error'
            entry.error = error
            entry.lastUsed = ++this.clock
          }
          throw error
        })
    }

    entry.refs += 1
    entry.lastUsed = ++this.clock
    let released = false

    return {
      promise: entry.promise,
      snapshot: () => ({ status: entry.status, value: entry.value, error: entry.error }),
      release: () => {
        if (released) return
        released = true
        entry.refs = Math.max(0, entry.refs - 1)
        entry.lastUsed = ++this.clock
        if (entry.invalidated && entry.refs === 0) this.remove(key, entry)
        this.trim()
      },
    }
  }

  invalidate(key) {
    const entry = this.entries.get(key)
    if (!entry) return false
    entry.invalidated = true
    if (entry.refs === 0) this.remove(key, entry)
    return true
  }

  clear() {
    for (const [key, entry] of this.entries) this.remove(key, entry)
  }

  ensureCapacity() {
    this.trim(this.maxEntries - 1)
    if (this.entries.size < this.maxEntries) return
    throw new PreviewDescriptorCacheError(
      'CACHE_CAPACITY_EXHAUSTED',
      'Le cache de descripteurs est plein et toutes ses entrées sont encore utilisées.',
      { maxEntries: this.maxEntries },
    )
  }

  trim(targetSize = this.maxEntries) {
    while (this.entries.size > targetSize) {
      const candidate = [...this.entries.entries()]
        .filter(([, entry]) => entry.refs === 0)
        .sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0]
      if (!candidate) return
      this.remove(candidate[0], candidate[1])
    }
  }

  remove(key, entry) {
    if (this.entries.get(key) !== entry) return
    this.entries.delete(key)
    entry.invalidated = true
    if (entry.status === 'loading') entry.controller.abort()
  }
}

export const defaultPreviewDescriptorCache = new BoundedPreviewDescriptorCache()
