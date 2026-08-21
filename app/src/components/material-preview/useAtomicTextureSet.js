import { useEffect, useMemo, useState } from 'react'
import {
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
} from 'three'
import { assertLocalPreviewUri } from './localPreviewUri.js'
import {
  assertMaterialPreviewDescriptor,
  materialPreviewResourceKey,
  MaterialPreviewContractError,
} from './previewContract.js'
import { compileShaderRecipe } from './shaderRecipeCompiler.js'
import { shaderRecipeCompilerInput } from './shaderRecipeTransport.js'

const textureLoader = new TextureLoader()
const LOADABLE_MODES = new Set(['pbr_maps', 'shader_recipe', 'texture_reference'])

export class PreviewTextureSetError extends Error {
  constructor(code, message, details = {}, cause = null) {
    super(message, cause ? { cause } : undefined)
    this.name = 'PreviewTextureSetError'
    this.code = code
    this.details = details
  }
}

const abortError = () => {
  const error = new Error('Chargement de texture annulé.')
  error.name = 'AbortError'
  return error
}

const finitePair = (value, fallback, field) => {
  const pair = Array.isArray(value) ? value : [value, value]
  const result = pair.length >= 2 ? [Number(pair[0]), Number(pair[1])] : fallback
  if (!result.every(Number.isFinite)) {
    throw new MaterialPreviewContractError('INVALID_UV_TRANSFORM', `${field} doit contenir deux nombres finis.`)
  }
  return result
}

const textureTransform = (descriptor, map) => {
  const descriptorScale = descriptor.uvScale ?? 1
  const repeat = finitePair(map.repeat ?? descriptorScale, [1, 1], 'repeat')
  const offset = finitePair(map.offset ?? [0, 0], [0, 0], 'offset')
  const rotation = Number(map.rotation ?? 0)
  if (!Number.isFinite(rotation)) {
    throw new MaterialPreviewContractError('INVALID_UV_TRANSFORM', 'rotation doit être un nombre fini.')
  }
  return { offset, repeat, rotation }
}

const defaultResolveSource = (source, { descriptor, role } = {}) => {
  if (descriptor?.mode === 'shader_recipe') {
    const texture = descriptor.graph?.textures?.find((entry) => (entry.role || entry.assetName) === role)
    if (texture?.url) return texture.url
  }
  return descriptor?.maps?.[role]?.url
    || (role === 'baseColor' ? descriptor?.previewUrl : '')
    || source
}
const defaultLoadTexture = (uri) => textureLoader.loadAsync(uri)

export function descriptorTextureRequests(
  descriptor,
  { baseUrl, resolveSource = defaultResolveSource } = {},
) {
  assertMaterialPreviewDescriptor(descriptor)
  if (!LOADABLE_MODES.has(descriptor.mode)) return []

  if (descriptor.mode === 'shader_recipe') {
    const compiled = compileShaderRecipe(shaderRecipeCompilerInput(descriptor.graph))
    if (!compiled.ok) {
      throw new PreviewTextureSetError(
        'INVALID_SHADER_RECIPE',
        'La recette shader a été refusée avant le chargement de ses textures.',
        { errors: compiled.errors },
      )
    }
    const manifest = new Map()
    for (const texture of descriptor.graph.textures || []) {
      const role = texture.role || texture.assetName
      if (role) manifest.set(role, texture)
      if (texture.assetName) manifest.set(texture.assetName, texture)
    }
    return compiled.plan.textures.map(({ role, sampler }) => {
      const texture = manifest.get(role)
      const resolved = resolveSource(texture?.source, { descriptor, role })
      if (!texture?.source || typeof resolved !== 'string' || !resolved.trim()) {
        throw new PreviewTextureSetError(
          'UNRESOLVED_TEXTURE_SOURCE',
          `La source manifestée de ${role} n'a pas pu être résolue localement.`,
          { role, source: texture?.source || '' },
        )
      }
      return {
        colorSpace: sampler === 'color' ? 'srgb' : 'linear',
        role,
        sampler,
        transform: { offset: [0, 0], repeat: [1, 1], rotation: 0 },
        uri: assertLocalPreviewUri(resolved, { baseUrl }),
      }
    })
  }

  const maps = descriptor.mode === 'texture_reference'
    ? {
        baseColor: descriptor.maps?.baseColor || {
          source: descriptor.previewSource,
          colorSpace: 'srgb',
        },
      }
    : descriptor.maps

  return ['baseColor', 'normal', 'orm', 'emissive']
    .filter((role) => maps?.[role])
    .map((role) => {
      const map = maps[role]
      const resolved = resolveSource(map.source, { descriptor, role })
      if (typeof resolved !== 'string' || !resolved.trim()) {
        throw new PreviewTextureSetError(
          'UNRESOLVED_TEXTURE_SOURCE',
          `La source manifestée de ${role} n’a pas pu être résolue localement.`,
          { role, source: map.source },
        )
      }
      return {
        colorSpace: map.colorSpace,
        role,
        transform: textureTransform(descriptor, map),
        uri: assertLocalPreviewUri(resolved, { baseUrl }),
      }
    })
}

export function configurePreviewTexture(texture, request, { maxAnisotropy = 1 } = {}) {
  if (!texture?.isTexture) {
    throw new PreviewTextureSetError('INVALID_TEXTURE', `Le chargeur n’a pas retourné de texture Three.js pour ${request.role}.`)
  }
  const anisotropy = Math.max(1, Math.min(16, Number(maxAnisotropy) || 1))
  texture.colorSpace = request.colorSpace === 'srgb' ? SRGBColorSpace : NoColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(...request.transform.repeat)
  texture.offset.set(...request.transform.offset)
  texture.center.set(0.5, 0.5)
  texture.rotation = request.transform.rotation
  texture.anisotropy = anisotropy
  texture.needsUpdate = true
  return texture
}

export function disposePreviewTextureSet(textures) {
  const unique = new Set(Object.values(textures || {}).filter(Boolean))
  unique.forEach((texture) => texture.dispose())
}

export async function loadPreviewTextureSet(
  requests,
  {
    loadTexture = defaultLoadTexture,
    maxAnisotropy = 1,
    signal,
  } = {},
) {
  if (!Array.isArray(requests)) {
    throw new PreviewTextureSetError('INVALID_TEXTURE_REQUESTS', 'Les requêtes texture doivent former un tableau.')
  }
  if (!requests.length) return Object.freeze({})
  if (signal?.aborted) throw abortError()

  const uniqueRequests = new Map()
  for (const request of requests) {
    const transform = request.transform
    const key = [
      request.uri,
      request.colorSpace,
      ...transform.repeat,
      ...transform.offset,
      transform.rotation,
    ].join('|')
    if (!uniqueRequests.has(key)) uniqueRequests.set(key, { ...request, roles: [] })
    uniqueRequests.get(key).roles.push(request.role)
  }

  const entries = [...uniqueRequests.values()]
  const results = await Promise.allSettled(entries.map(async (request) => {
    const texture = await loadTexture(request.uri, { request, signal })
    if (signal?.aborted) {
      texture?.dispose?.()
      throw abortError()
    }
    return { request, texture: configurePreviewTexture(texture, request, { maxAnisotropy }) }
  }))

  const loaded = results.filter((result) => result.status === 'fulfilled').map((result) => result.value)
  const failed = results.find((result) => result.status === 'rejected')
  if (failed) {
    loaded.forEach(({ texture }) => texture.dispose())
    if (failed.reason?.name === 'AbortError') throw failed.reason
    throw new PreviewTextureSetError(
      'TEXTURE_SET_LOAD_FAILED',
      'Le jeu de textures exact n’a pas pu être chargé intégralement.',
      { roles: requests.map((request) => request.role) },
      failed.reason,
    )
  }

  const textures = {}
  for (const { request, texture } of loaded) {
    request.roles.forEach((role) => { textures[role] = texture })
  }
  if (textures.orm) {
    textures.ao = textures.orm
    textures.roughness = textures.orm
    textures.metalness = textures.orm
  }
  return Object.freeze(textures)
}

const waitForRetry = (delayMs, signal) => new Promise((resolve, reject) => {
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

const disabledLoadState = Object.freeze({ attempt: 0, error: null, status: 'disabled', targetResourceKey: '' })

export function useAtomicTextureSet(
  descriptor,
  {
    baseUrl,
    loadTexture = defaultLoadTexture,
    maxAnisotropy = 1,
    maxRetries = 1,
    resolveSource = defaultResolveSource,
    retryDelayMs = 180,
  } = {},
) {
  const [resource, setResource] = useState(null)
  const [loadState, setLoadState] = useState(disabledLoadState)
  const resourceKey = useMemo(
    () => descriptor && LOADABLE_MODES.has(descriptor.mode) ? materialPreviewResourceKey(descriptor) : '',
    [descriptor],
  )

  useEffect(() => () => {
    if (resource?.textures) disposePreviewTextureSet(resource.textures)
  }, [resource])

  useEffect(() => {
    if (!descriptor || !resourceKey) {
      setLoadState(disabledLoadState)
      return undefined
    }
    if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 3) {
      setLoadState({
        attempt: 0,
        error: new PreviewTextureSetError('INVALID_RETRY_COUNT', 'maxRetries doit être compris entre 0 et 3.'),
        status: 'error',
        targetResourceKey: resourceKey,
      })
      return undefined
    }

    const controller = new AbortController()
    let active = true
    let requests
    try {
      requests = descriptorTextureRequests(descriptor, { baseUrl, resolveSource })
    } catch (error) {
      setLoadState({ attempt: 0, error, status: 'error', targetResourceKey: resourceKey })
      return () => controller.abort()
    }

    const run = async () => {
      for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
        if (!active) return
        setLoadState({
          attempt,
          error: null,
          status: attempt === 1 ? 'loading' : 'retrying',
          targetResourceKey: resourceKey,
        })
        try {
          const textures = await loadPreviewTextureSet(requests, {
            loadTexture,
            maxAnisotropy,
            signal: controller.signal,
          })
          if (!active) {
            disposePreviewTextureSet(textures)
            return
          }
          setResource({ resourceKey, textures })
          setLoadState({ attempt, error: null, status: 'ready', targetResourceKey: resourceKey })
          return
        } catch (error) {
          if (!active || error?.name === 'AbortError') return
          if (attempt > maxRetries) {
            setLoadState({ attempt, error, status: 'error', targetResourceKey: resourceKey })
            return
          }
          try {
            await waitForRetry(retryDelayMs, controller.signal)
          } catch {
            return
          }
        }
      }
    }

    run()
    return () => {
      active = false
      controller.abort()
    }
  }, [baseUrl, descriptor, loadTexture, maxAnisotropy, maxRetries, resolveSource, resourceKey, retryDelayMs])

  return {
    ...loadState,
    resourceKey: resource?.resourceKey || '',
    textures: resource?.textures || null,
  }
}
