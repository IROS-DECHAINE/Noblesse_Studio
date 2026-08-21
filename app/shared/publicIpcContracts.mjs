import Ajv2020 from 'ajv/dist/2020.js'

export const PUBLIC_IPC_SCHEMA_VERSION = 1

const publicString = (maxLength = 512) => ({ type: 'string', maxLength })
const requiredPublicString = (maxLength = 512) => ({ type: 'string', minLength: 1, maxLength })
const publicPort = { anyOf: [{ type: 'integer', minimum: 1, maximum: 65_535 }, { type: 'null' }] }
const nullableIssue = {
  anyOf: [
    { type: 'null' },
    {
      type: 'object',
      additionalProperties: false,
      required: ['code'],
      properties: {
        code: requiredPublicString(80),
        cause: publicString(80),
        message: publicString(500),
        port: publicPort,
        expectedPort: publicPort,
        actualPort: publicPort,
        preferredPort: publicPort,
      },
    },
  ],
}

export const publicAssetSchemaV1 = {
  $id: 'https://noblesse.studio/schemas/ipc/public-asset.v1.json',
  type: 'object',
  additionalProperties: false,
  required: ['asset_id', 'asset_type', 'display_name', 'status'],
  properties: {
    asset_id: requiredPublicString(160),
    asset_type: requiredPublicString(80),
    display_name: requiredPublicString(240),
    pack_id: publicString(160),
    provenance: publicString(500),
    notes: publicString(2_000),
    preview_asset: publicString(500),
    preview_url: { type: 'string', maxLength: 500, pattern: '^noblesse-vault://preview/' },
    status: requiredPublicString(80),
    pack_version: publicString(80),
    source_project: publicString(240),
    uefn_version: publicString(80),
    target_path: publicString(500),
    surface_group: publicString(240),
    source_family: publicString(160),
    variant_id: publicString(160),
    variant_label: publicString(240),
    preview_kind: publicString(80),
    preview_color: publicString(80),
    install_mode: publicString(80),
    group_label: publicString(240),
    label: publicString(240),
    category: publicString(160),
    dependencies: publicString(4_000),
    platforms: { type: 'array', maxItems: 16, items: publicString(80) },
    order: { type: 'number', minimum: -1_000_000, maximum: 1_000_000 },
    technical_maps: { type: 'number', minimum: 0, maximum: 100_000 },
    animated: { type: 'boolean' },
  },
}

export const publicProjectSchemaV1 = {
  $id: 'https://noblesse.studio/schemas/ipc/public-project.v1.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'id', 'name', 'platform', 'opened', 'connected', 'canInstall',
    'transferReady', 'favorite', 'registered', 'status',
  ],
  properties: {
    id: requiredPublicString(160),
    name: requiredPublicString(240),
    platform: { enum: ['UEFN', 'Unreal', 'Roblox'] },
    opened: { type: 'boolean' },
    connected: { type: 'boolean' },
    canInstall: { type: 'boolean' },
    transferReady: { type: 'boolean' },
    favorite: { type: 'boolean' },
    registered: { type: 'boolean' },
    port: publicPort,
    assignedPort: publicPort,
    preferredPort: publicPort,
    engineVersion: publicString(80),
    status: requiredPublicString(80),
    protection: publicString(100),
    mcpIssue: nullableIssue,
    mcpWarning: nullableIssue,
  },
}

export const assetsResponseSchemaV1 = {
  $id: 'https://noblesse.studio/schemas/ipc/assets-response.v1.json',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'items'],
  properties: {
    schemaVersion: { const: PUBLIC_IPC_SCHEMA_VERSION },
    items: { type: 'array', maxItems: 100_000, items: publicAssetSchemaV1 },
  },
}

export const projectsResponseSchemaV1 = {
  $id: 'https://noblesse.studio/schemas/ipc/projects-response.v1.json',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'items', 'diagnostics'],
  properties: {
    schemaVersion: { const: PUBLIC_IPC_SCHEMA_VERSION },
    items: { type: 'array', maxItems: 10_000, items: publicProjectSchemaV1 },
    diagnostics: {
      type: 'object',
      additionalProperties: false,
      required: ['unregisteredCount'],
      properties: {
        unregisteredCount: { type: 'integer', minimum: 0, maximum: 10_000 },
      },
    },
  },
}

export const projectFavoriteRequestSchemaV1 = {
  $id: 'https://noblesse.studio/schemas/ipc/project-favorite-request.v1.json',
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'favorite'],
  properties: {
    projectId: requiredPublicString(160),
    favorite: { type: 'boolean' },
  },
}

const ajv = new Ajv2020({ allErrors: true, strict: true })
const validateAssetsResponse = ajv.compile(assetsResponseSchemaV1)
const validateProjectsResponse = ajv.compile(projectsResponseSchemaV1)
const validateProjectFavoriteRequest = ajv.compile(projectFavoriteRequestSchemaV1)

const PRIVATE_PATH_PATTERNS = [
  { kind: 'Windows drive path', pattern: /(?:^|[^a-z0-9+.-])[a-z]:[\\/]/i },
  { kind: 'UNC path', pattern: /\\\\[^\\/\s]+[\\/]/ },
  { kind: 'Windows device path', pattern: /\\\\[?.][\\/]/ },
  { kind: 'file URL', pattern: /\bfile:\/\//i },
]

const findPrivatePath = (value, trail = '$') => {
  if (typeof value === 'string') {
    const match = PRIVATE_PATH_PATTERNS.find(({ pattern }) => pattern.test(value))
    return match ? { trail, kind: match.kind } : null
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const match = findPrivatePath(value[index], `${trail}[${index}]`)
      if (match) return match
    }
    return null
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      const match = findPrivatePath(nested, `${trail}.${key}`)
      if (match) return match
    }
  }
  return null
}

const formatErrors = (validator) => ajv.errorsText(validator.errors, { separator: '; ' })

const assertValid = (validator, payload, label) => {
  if (!validator(payload)) throw new Error(`${label} invalide: ${formatErrors(validator)}`)
  const privatePath = findPrivatePath(payload)
  if (privatePath) {
    throw new Error(`${label} contient un chemin privé (${privatePath.kind}) à ${privatePath.trail}`)
  }
  return payload
}

const copyString = (target, source, key) => {
  if (typeof source?.[key] === 'string') target[key] = source[key]
}

const copyNumber = (target, source, key) => {
  if (typeof source?.[key] === 'number' && Number.isFinite(source[key])) target[key] = source[key]
}

const publicIssue = (issue) => {
  if (!issue || typeof issue !== 'object') return null
  const result = {}
  for (const key of ['code', 'cause', 'message']) copyString(result, issue, key)
  for (const key of ['port', 'expectedPort', 'actualPort', 'preferredPort']) {
    if (issue[key] === null || Number.isInteger(issue[key])) result[key] = issue[key]
  }
  return result.code ? result : null
}

export const publicAssetFromInternal = (asset) => {
  const dto = {
    asset_id: String(asset?.asset_id || ''),
    asset_type: String(asset?.asset_type || ''),
    display_name: String(asset?.display_name || ''),
    status: String(asset?.status || ''),
  }
  for (const key of [
    'pack_id', 'provenance', 'notes', 'preview_asset', 'pack_version', 'source_project',
    'uefn_version', 'target_path', 'surface_group', 'source_family', 'variant_id',
    'variant_label', 'preview_kind', 'preview_color', 'install_mode', 'group_label',
    'label', 'category', 'dependencies',
  ]) copyString(dto, asset, key)
  for (const key of ['order', 'technical_maps']) copyNumber(dto, asset, key)
  if (typeof asset?.animated === 'boolean') dto.animated = asset.animated
  if (Array.isArray(asset?.platforms)) {
    dto.platforms = asset.platforms.filter((value) => typeof value === 'string')
  }
  if (typeof asset?.preview_source === 'string' && asset.preview_source && dto.asset_id) {
    dto.preview_url = `noblesse-vault://preview/${encodeURIComponent(dto.asset_id)}`
  }
  return dto
}

export const publicProjectFromInternal = (project) => {
  const dto = {
    id: String(project?.id || ''),
    name: String(project?.name || ''),
    platform: String(project?.platform || ''),
    opened: project?.opened === true,
    connected: project?.connected === true,
    canInstall: project?.canInstall === true,
    transferReady: project?.transferReady === true,
    favorite: project?.favorite === true,
    registered: project?.registered === true,
    status: String(project?.status || 'UNKNOWN'),
  }
  for (const key of ['engineVersion', 'protection']) copyString(dto, project, key)
  for (const key of ['port', 'assignedPort', 'preferredPort']) {
    dto[key] = Number.isInteger(project?.[key]) ? project[key] : null
  }
  dto.mcpIssue = publicIssue(project?.mcpIssue)
  dto.mcpWarning = publicIssue(project?.mcpWarning)
  return dto
}

export const assertAssetsResponseV1 = (payload) => assertValid(
  validateAssetsResponse,
  payload,
  'Réponse publique assets v1',
)

export const assertProjectsResponseV1 = (payload) => assertValid(
  validateProjectsResponse,
  payload,
  'Réponse publique projets v1',
)

export const assertProjectFavoriteRequestV1 = (payload) => {
  if (!validateProjectFavoriteRequest(payload)) {
    throw new Error(`Requête favori projet v1 invalide: ${formatErrors(validateProjectFavoriteRequest)}`)
  }
  const privatePath = findPrivatePath(payload)
  if (privatePath) throw new Error('Requête favori projet v1 contient un chemin privé')
  return payload
}

export const serializeAssetsResponseV1 = (assets) => {
  if (!Array.isArray(assets)) throw new Error('Le service assets doit retourner une liste.')
  return assertAssetsResponseV1({
    schemaVersion: PUBLIC_IPC_SCHEMA_VERSION,
    items: assets.map(publicAssetFromInternal),
  })
}

export const serializeProjectsResponseV1 = (projects) => {
  if (!Array.isArray(projects)) throw new Error('Le service projets doit retourner une liste.')
  const source = projects
  const registered = source.filter((project) => project?.registered === true && typeof project?.id === 'string' && project.id)
  return assertProjectsResponseV1({
    schemaVersion: PUBLIC_IPC_SCHEMA_VERSION,
    items: registered.map(publicProjectFromInternal),
    diagnostics: { unregisteredCount: source.length - registered.length },
  })
}

export const publicIpcContractInternals = { findPrivatePath }
