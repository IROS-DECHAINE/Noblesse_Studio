import { MaterialPreviewContractError } from './previewContract.js'

const CUSTOM_SCHEMES = new Set(['noblesse-vault:'])

const defaultBaseUrl = () => globalThis.location?.href || ''

export function assertLocalPreviewUri(uri, { baseUrl = defaultBaseUrl(), customSchemes = CUSTOM_SCHEMES } = {}) {
  if (typeof uri !== 'string' || !uri.trim()) {
    throw new MaterialPreviewContractError('INVALID_PREVIEW_URI', 'Une URI de preview locale est obligatoire.')
  }

  const value = uri.trim()
  let parsed
  try {
    parsed = baseUrl ? new URL(value, baseUrl) : new URL(value)
  } catch {
    throw new MaterialPreviewContractError('INVALID_PREVIEW_URI', 'URI de preview invalide.', { uri: value })
  }

  if (customSchemes.has(parsed.protocol)) {
    if (parsed.protocol === 'noblesse-vault:' && parsed.hostname !== 'preview') {
      throw new MaterialPreviewContractError('INVALID_PREVIEW_HOST', 'Seul le host preview du Coffre est autorisé.', { uri: value })
    }
    return parsed.href
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new MaterialPreviewContractError('FORBIDDEN_PREVIEW_SCHEME', 'Le schéma de cette preview n’est pas autorisé.', {
      protocol: parsed.protocol,
    })
  }

  if (!baseUrl) {
    throw new MaterialPreviewContractError('MISSING_PREVIEW_ORIGIN', 'Une origine locale est requise pour valider cette preview.')
  }
  const base = new URL(baseUrl)
  if (parsed.origin !== base.origin) {
    throw new MaterialPreviewContractError('CROSS_ORIGIN_PREVIEW', 'Les previews distantes arbitraires sont interdites.', {
      expectedOrigin: base.origin,
      receivedOrigin: parsed.origin,
    })
  }
  return parsed.href
}
