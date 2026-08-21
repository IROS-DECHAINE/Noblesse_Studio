import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  assertMaterialPreviewDescriptor,
  assertMaterialPreviewShape,
  materialPreviewResourceKey,
} from './previewContract.js'

const LIVE_WITHOUT_TEXTURES = new Set(['solid_parameters'])
const LIVE_WITH_TEXTURES = new Set(['pbr_maps', 'texture_reference'])

export const materialPreviewCommitKey = (resourceKey, shape, renderEpoch = 0) => (
  resourceKey ? `${resourceKey}:${shape}:${renderEpoch}` : ''
)

const sourcePresentation = ({ descriptor, previewUrl, surfacePreviewUrl, shape, diagnostic }) => ({
  diagnostic,
  label: descriptor?.mode === 'rendered_capture' ? 'Capture source' : 'Aper\u00e7u source',
  mode: 'source',
  previewUrl: previewUrl || surfacePreviewUrl || '',
  shape,
  sourceKind: descriptor?.mode === 'rendered_capture' ? 'rendered_capture' : 'poster',
  sourceVisible: true,
})

const livePresentation = ({
  committedResourceKey,
  descriptor,
  previewUrl,
  resourceKey,
  renderEpoch,
  shape,
  surfacePreviewUrl,
  ...resources
}) => {
  const commitKey = materialPreviewCommitKey(resourceKey, shape, renderEpoch)
  return ({
  commitKey,
  descriptor,
  diagnostic: committedResourceKey === commitKey ? 'ready' : 'warming',
  fallbackLabel: 'Aper\u00e7u source',
  fallbackPreviewUrl: previewUrl || surfacePreviewUrl || '',
  fallbackSourceKind: 'poster',
  mode: 'live',
  resourceKey,
  shape,
  sourceVisible: committedResourceKey !== commitKey,
  ...resources,
  })
}

export function resolveAtomicPreviewFailover({
  committedResourceKey = '',
  descriptorState,
  previewUrl = '',
  renderEpoch = 0,
  runtimeState = null,
  shape = 'sphere',
  surfacePreviewUrl = '',
  textureState = null,
} = {}) {
  assertMaterialPreviewShape(shape)
  const descriptor = descriptorState?.descriptor || null

  if (descriptorState?.status !== 'ready' || !descriptor) {
    return sourcePresentation({
      descriptor,
      previewUrl,
      surfacePreviewUrl,
      shape,
      diagnostic: descriptorState?.status || 'descriptor_unavailable',
    })
  }

  assertMaterialPreviewDescriptor(descriptor)
  const resourceKey = materialPreviewResourceKey(descriptor)

  if (['rendered_capture', 'unsupported'].includes(descriptor.mode)) {
    return sourcePresentation({ descriptor, previewUrl, surfacePreviewUrl, shape, diagnostic: descriptor.mode })
  }

  if (LIVE_WITHOUT_TEXTURES.has(descriptor.mode)) {
    return livePresentation({
      committedResourceKey,
      descriptor,
      previewUrl,
      resourceKey,
      renderEpoch,
      shape,
      surfacePreviewUrl,
    })
  }

  if (descriptor.mode === 'shader_recipe') {
    const runtimeNeedsTextures = Boolean(runtimeState?.plan?.compilerPlan?.textures?.length)
    if (runtimeState?.status === 'ready'
      && runtimeState.resourceKey === resourceKey
      && (!runtimeNeedsTextures
        || (textureState?.status === 'ready' && textureState.resourceKey === resourceKey))) {
      return livePresentation({
        committedResourceKey,
        descriptor,
        previewUrl,
        resourceKey,
        renderEpoch,
        runtimePlan: runtimeState.plan,
        shape,
        surfacePreviewUrl,
        textures: textureState?.textures || Object.freeze({}),
      })
    }
    return sourcePresentation({
      descriptor,
      previewUrl,
      surfacePreviewUrl,
      shape,
      diagnostic: runtimeState?.status !== 'ready'
        ? runtimeState?.status || 'shader_recipe_unavailable'
        : textureState?.status || 'shader_texture_set_unavailable',
    })
  }

  if (LIVE_WITH_TEXTURES.has(descriptor.mode)
    && textureState?.status === 'ready'
    && textureState.resourceKey === resourceKey) {
    return livePresentation({
      committedResourceKey,
      descriptor,
      previewUrl,
      resourceKey,
      renderEpoch,
      shape,
      surfacePreviewUrl,
      textures: textureState.textures,
    })
  }

  return sourcePresentation({
    descriptor,
    previewUrl,
    surfacePreviewUrl,
    shape,
    diagnostic: textureState?.status || 'texture_set_unavailable',
  })
}

export function useAtomicPreviewFailover(options) {
  return useMemo(
    () => resolveAtomicPreviewFailover(options),
    [
      options?.descriptorState,
      options?.committedResourceKey,
      options?.previewUrl,
      options?.runtimeState,
      options?.renderEpoch,
      options?.shape,
      options?.surfacePreviewUrl,
      options?.textureState,
    ],
  )
}

export function useCommittedLivePreview(resourceKey = '') {
  const [committedResourceKey, setCommittedResourceKey] = useState('')
  const belongsToTarget = useCallback(
    (candidate) => Boolean(resourceKey)
      && (candidate === resourceKey || candidate.startsWith(`${resourceKey}:`)),
    [resourceKey],
  )

  useEffect(() => {
    if (committedResourceKey && !belongsToTarget(committedResourceKey)) setCommittedResourceKey('')
  }, [belongsToTarget, committedResourceKey])

  const markCommitted = useCallback((renderedResourceKey) => {
    if (renderedResourceKey && belongsToTarget(renderedResourceKey)) {
      setCommittedResourceKey(renderedResourceKey)
    }
  }, [belongsToTarget])

  return { committedResourceKey, markCommitted }
}
