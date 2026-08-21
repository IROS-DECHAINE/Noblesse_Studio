import { useCallback, useEffect, useMemo, useState } from 'react'
import { defaultPreviewDescriptorCache } from './descriptorCache.js'
import { assertMaterialPreviewDescriptor } from './previewContract.js'

const disabledState = Object.freeze({ descriptor: null, error: null, status: 'disabled' })
const waitForRetry = (delayMs, signal) => new Promise((resolve, reject) => {
  const abortError = () => {
    const error = new Error('Chargement du descripteur annulé.')
    error.name = 'AbortError'
    return error
  }
  if (signal?.aborted) {
    reject(abortError())
    return
  }
  const onAbort = () => {
    globalThis.clearTimeout(timer)
    reject(abortError())
  }
  const timer = globalThis.setTimeout(() => {
    signal?.removeEventListener('abort', onAbort)
    resolve()
  }, delayMs)
  signal?.addEventListener('abort', onAbort, { once: true })
})

export function usePreviewDescriptor({
  assetId,
  cache = defaultPreviewDescriptorCache,
  enabled = true,
  loadDescriptor,
  maxRetries = 1,
  repositoryKey = 'noblesse-vault',
  retryDelayMs = 140,
  validateDescriptor = assertMaterialPreviewDescriptor,
} = {}) {
  const [reloadToken, setReloadToken] = useState(0)
  const [state, setState] = useState(disabledState)
  const key = useMemo(
    () => enabled && assetId ? cache.key(repositoryKey, assetId) : '',
    [assetId, cache, enabled, repositoryKey],
  )

  useEffect(() => {
    if (!key) {
      setState(disabledState)
      return undefined
    }
    if (typeof loadDescriptor !== 'function') {
      setState({ descriptor: null, error: new TypeError('loadDescriptor est obligatoire.'), status: 'error' })
      return undefined
    }
    if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 3) {
      setState({ descriptor: null, error: new RangeError('maxRetries doit être compris entre 0 et 3.'), status: 'error' })
      return undefined
    }

    let active = true
    let lease
    try {
      lease = cache.acquire(key, async ({ signal }) => {
        for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
          try {
            const descriptor = await loadDescriptor(assetId, { signal })
            return validateDescriptor(descriptor, { assetId })
          } catch (error) {
            if (error?.name === 'AbortError' || attempt === maxRetries) throw error
            await waitForRetry(retryDelayMs, signal)
          }
        }
        throw new Error('Chargement du descripteur impossible.')
      })
    } catch (error) {
      setState({ descriptor: null, error, status: 'error' })
      return undefined
    }

    const snapshot = lease.snapshot()
    if (snapshot.status === 'ready') {
      setState({ descriptor: snapshot.value, error: null, status: 'ready' })
    } else if (snapshot.status === 'error') {
      setState({ descriptor: null, error: snapshot.error, status: 'error' })
    } else {
      setState({ descriptor: null, error: null, status: 'loading' })
    }

    lease.promise.then(
      (descriptor) => {
        if (active) setState({ descriptor, error: null, status: 'ready' })
      },
      (error) => {
        if (active) setState({ descriptor: null, error, status: 'error' })
      },
    )

    return () => {
      active = false
      lease.release()
    }
  }, [assetId, cache, key, loadDescriptor, maxRetries, reloadToken, retryDelayMs, validateDescriptor])

  const reload = useCallback(() => {
    if (!key) return
    cache.invalidate(key)
    setReloadToken((value) => value + 1)
  }, [cache, key])

  return { ...state, reload }
}
