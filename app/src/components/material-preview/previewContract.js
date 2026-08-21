export const MATERIAL_PREVIEW_SCHEMA_VERSION = 1

export const MATERIAL_PREVIEW_MODES = Object.freeze([
  'rendered_capture',
  'pbr_maps',
  'solid_parameters',
  'shader_recipe',
  'texture_reference',
  'unsupported',
])

export const MATERIAL_PREVIEW_SHAPES = Object.freeze(['sphere', 'plane'])

const MODE_SET = new Set(MATERIAL_PREVIEW_MODES)
const SHAPE_SET = new Set(MATERIAL_PREVIEW_SHAPES)
const MAP_COLOR_SPACES = new Set(['srgb', 'linear'])
const TEMPORAL_NODE_KINDS = new Set(['Panner', 'Rotator', 'Sine', 'Time'])

export class MaterialPreviewContractError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'MaterialPreviewContractError'
    this.code = code
    this.details = details
  }
}

const fail = (code, message, details) => {
  throw new MaterialPreviewContractError(code, message, details)
}

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const assertFinite = (value, path) => {
  if (!Number.isFinite(value)) fail('INVALID_NUMBER', `${path} doit être un nombre fini.`, { path, value })
}

const assertColor = (value, path) => {
  if (!Array.isArray(value) || value.length < 3 || value.length > 4) {
    fail('INVALID_COLOR', `${path} doit contenir trois ou quatre composantes.`, { path })
  }
  value.forEach((component, index) => assertFinite(component, `${path}[${index}]`))
}

const assertMaterial = (material, path = 'material') => {
  if (!isRecord(material)) fail('MISSING_MATERIAL', `${path} est obligatoire.`)
  assertColor(material.baseColor, `${path}.baseColor`)
  assertColor(material.emissiveColor, `${path}.emissiveColor`)
  for (const field of ['emissiveIntensity', 'metalness', 'roughness', 'specularIntensity']) {
    assertFinite(material[field], `${path}.${field}`)
  }
  if (material.metalness < 0 || material.metalness > 1 || material.roughness < 0 || material.roughness > 1) {
    fail('INVALID_PBR_RANGE', `${path}.metalness et ${path}.roughness doivent rester entre 0 et 1.`)
  }
  if (material.emissiveIntensity < 0 || material.specularIntensity < 0) {
    fail('INVALID_PBR_RANGE', `${path}.emissiveIntensity et ${path}.specularIntensity doivent être positifs.`)
  }
}

const assertMap = (map, role, { required = false } = {}) => {
  if (!map) {
    if (required) fail('MISSING_MAP', `La carte ${role} est obligatoire.`, { role })
    return
  }
  if (!isRecord(map) || typeof map.source !== 'string' || !map.source.trim()) {
    fail('INVALID_MAP', `La carte ${role} doit référencer une source manifestée.`, { role })
  }
  if (!MAP_COLOR_SPACES.has(map.colorSpace)) {
    fail('INVALID_COLOR_SPACE', `Espace couleur non autorisé pour ${role}.`, { role, colorSpace: map.colorSpace })
  }
  if (['normal', 'orm'].includes(role) && map.colorSpace !== 'linear') {
    fail('INVALID_COLOR_SPACE', `${role} doit être linéaire.`, { role })
  }
  if (['baseColor', 'emissive'].includes(role) && map.colorSpace !== 'srgb') {
    fail('INVALID_COLOR_SPACE', `${role} doit être sRGB.`, { role })
  }
}

export function assertMaterialPreviewShape(shape) {
  if (!SHAPE_SET.has(shape)) fail('UNSUPPORTED_SHAPE', `Forme de preview non autorisée : ${shape}.`, { shape })
  return shape
}

export function assertMaterialPreviewDescriptor(descriptor, { assetId = '' } = {}) {
  if (!isRecord(descriptor)) fail('INVALID_DESCRIPTOR', 'Le descripteur de preview doit être un objet.')
  if (descriptor.schemaVersion !== MATERIAL_PREVIEW_SCHEMA_VERSION) {
    fail('UNSUPPORTED_SCHEMA', `Version de descripteur non prise en charge : ${descriptor.schemaVersion}.`)
  }
  if (typeof descriptor.assetId !== 'string' || !descriptor.assetId.trim()) {
    fail('INVALID_ASSET_ID', 'Le descripteur doit porter un assetId stable.')
  }
  if (assetId && descriptor.assetId !== assetId) {
    fail('ASSET_ID_MISMATCH', 'Le descripteur reçu ne correspond pas à l’asset demandé.', {
      expected: assetId,
      received: descriptor.assetId,
    })
  }
  if (!MODE_SET.has(descriptor.mode)) {
    fail('UNSUPPORTED_MODE', `Mode de preview non autorisé : ${descriptor.mode}.`, { mode: descriptor.mode })
  }
  if (typeof descriptor.previewSource !== 'string') {
    fail('INVALID_PREVIEW_SOURCE', 'previewSource doit être une chaîne, même lorsqu’elle est vide.')
  }
  if (typeof descriptor.animated !== 'boolean') {
    fail('INVALID_ANIMATION_FLAG', 'animated doit être un booléen propre à la variante active.')
  }
  if (descriptor.recommendedShape !== undefined) assertMaterialPreviewShape(descriptor.recommendedShape)
  const hasTemporalNode = Array.isArray(descriptor.graph?.nodes)
    && descriptor.graph.nodes.some((node) => TEMPORAL_NODE_KINDS.has(node?.kind))
  if (descriptor.animated && (descriptor.mode !== 'shader_recipe' || !hasTemporalNode)) {
    fail(
      'UNPROVEN_ANIMATION',
      'animated=true exige un mode shader_recipe et un noeud temporel autorisé dans le graphe actif.',
    )
  }

  switch (descriptor.mode) {
    case 'rendered_capture':
      if (!descriptor.previewSource.trim()) fail('MISSING_SOURCE_CAPTURE', 'Une capture rendue doit référencer previewSource.')
      break
    case 'pbr_maps':
      assertMaterial(descriptor.material)
      if (descriptor.uvScale !== undefined) assertFinite(descriptor.uvScale, 'uvScale')
      if (descriptor.normalScale !== undefined) assertFinite(descriptor.normalScale, 'normalScale')
      if (!isRecord(descriptor.maps)) fail('MISSING_MAPS', 'Le mode pbr_maps exige un jeu de cartes.')
      assertMap(descriptor.maps.baseColor, 'baseColor', { required: true })
      assertMap(descriptor.maps.normal, 'normal', { required: true })
      assertMap(descriptor.maps.orm, 'orm', { required: true })
      assertMap(descriptor.maps.emissive, 'emissive')
      if (!String(descriptor.maps.orm.channels || '').match(/R\s*=\s*AO/i)
        || !String(descriptor.maps.orm.channels || '').match(/G\s*=\s*Roughness/i)
        || !String(descriptor.maps.orm.channels || '').match(/B\s*=\s*Metallic/i)) {
        fail('INVALID_ORM_CHANNELS', 'Le packing ORM doit déclarer R=AO, G=Roughness et B=Metallic.')
      }
      break
    case 'solid_parameters':
      assertMaterial(descriptor.material)
      break
    case 'shader_recipe':
      assertMaterial(descriptor.material)
      if (!isRecord(descriptor.graph)) fail('MISSING_SHADER_RECIPE', 'Le mode shader_recipe exige un graphe contrôlé.')
      if (!descriptor.animated || !hasTemporalNode) {
        fail('UNPROVEN_ANIMATION', 'Le mode shader_recipe exige une animation temporelle prouvée.')
      }
      break
    case 'texture_reference':
      if (!descriptor.previewSource.trim() && !descriptor.maps?.baseColor?.source) {
        fail('MISSING_TEXTURE_REFERENCE', 'Une texture de référence doit être manifestée.')
      }
      if (descriptor.maps?.baseColor) assertMap(descriptor.maps.baseColor, 'baseColor')
      if (descriptor.material) assertMaterial(descriptor.material)
      break
    case 'unsupported':
      if (typeof descriptor.unsupportedReason !== 'string' || !descriptor.unsupportedReason.trim()) {
        fail('MISSING_UNSUPPORTED_REASON', 'Un mode unsupported doit expliquer la raison du refus.')
      }
      break
    default:
      fail('UNSUPPORTED_MODE', `Mode de preview non autorisé : ${descriptor.mode}.`)
  }

  return descriptor
}

export function materialPreviewResourceKey(descriptor) {
  assertMaterialPreviewDescriptor(descriptor)
  const revision = descriptor.revision || descriptor.variantId || descriptor.previewSource || descriptor.fidelity || 'v1'
  return `${descriptor.assetId}:${descriptor.mode}:${revision}`
}
