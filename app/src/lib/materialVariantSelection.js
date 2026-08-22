const DEFAULT_VARIANT_ID = 'Standard'

export function describeMaterialVariantSelection(surface) {
  const surfaceId = surface?.id ?? ''
  const variantIds = Array.isArray(surface?.variantOptions)
    ? surface.variantOptions
      .map((variant) => variant?.id)
      .filter((variantId) => typeof variantId === 'string' && variantId.length > 0)
    : []

  return {
    surfaceId,
    variantIds,
    key: JSON.stringify([surfaceId, ...variantIds]),
  }
}

export function reconcileMaterialVariantId({ currentVariantId, previousSurfaceId, selection }) {
  const fallbackVariantId = selection.variantIds[0] || DEFAULT_VARIANT_ID
  if (previousSurfaceId !== selection.surfaceId) return fallbackVariantId
  return selection.variantIds.includes(currentVariantId) ? currentVariantId : fallbackVariantId
}
