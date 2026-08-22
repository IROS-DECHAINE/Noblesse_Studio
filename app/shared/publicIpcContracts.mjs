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
    audio_url: { type: 'string', maxLength: 500, pattern: '^noblesse-vault://audio/' },
    model_preview_url: { type: 'string', maxLength: 500, pattern: '^noblesse-vault://model/' },
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
    description: publicString(1_000),
    category: publicString(160),
    asset_group: publicString(160),
    module_id: publicString(160),
    module_label: publicString(240),
    catalog_visibility: publicString(80),
    dependencies: publicString(4_000),
    original_format: publicString(20),
    conversion_profile: publicString(80),
    platforms: { type: 'array', maxItems: 16, items: publicString(80) },
    order: { type: 'number', minimum: -1_000_000, maximum: 1_000_000 },
    technical_maps: { type: 'number', minimum: 0, maximum: 100_000 },
    module_order: { type: 'number', minimum: 0, maximum: 10_000 },
    mesh_object_count: { type: 'number', minimum: 1, maximum: 10_000_000 },
    vertex_count: { type: 'number', minimum: 1, maximum: 1_000_000_000 },
    triangle_count: { type: 'number', minimum: 1, maximum: 1_000_000_000 },
    bounds_x_m: { type: 'number', exclusiveMinimum: 0, maximum: 1_000_000 },
    bounds_y_m: { type: 'number', exclusiveMinimum: 0, maximum: 1_000_000 },
    bounds_z_m: { type: 'number', exclusiveMinimum: 0, maximum: 1_000_000 },
    duration_seconds: { type: 'number', minimum: 0, maximum: 21_600 },
    size_bytes: { type: 'number', minimum: 0, maximum: 536_870_912 },
    sample_rate: { type: 'number', minimum: 8_000, maximum: 384_000 },
    channels: { type: 'number', minimum: 1, maximum: 8 },
    bit_depth: { type: 'number', minimum: 8, maximum: 64 },
    animated: { type: 'boolean' },
    converted: { type: 'boolean' },
  },
}

export const soundSelectionResponseSchemaV1 = {
  $id: 'https://noblesse.studio/schemas/ipc/sound-selection-response.v1.json',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'canceled', 'files'],
  properties: {
    schemaVersion: { const: PUBLIC_IPC_SCHEMA_VERSION },
    canceled: { type: 'boolean' },
    files: {
      type: 'array',
      maxItems: 200,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['selectionToken', 'originalName', 'suggestedTitle', 'sizeBytes', 'format', 'conversionRequired'],
        properties: {
          selectionToken: requiredPublicString(160),
          originalName: requiredPublicString(260),
          suggestedTitle: requiredPublicString(120),
          sizeBytes: { type: 'number', minimum: 1, maximum: 134_217_728 },
          format: { enum: ['WAV', 'MP3'] },
          conversionRequired: { type: 'boolean' },
        },
      },
    },
  },
}

export const soundImportRequestSchemaV1 = {
  $id: 'https://noblesse.studio/schemas/ipc/sound-import-request.v1.json',
  type: 'object',
  additionalProperties: false,
  required: ['items', 'category', 'rightsConfirmed'],
  properties: {
    items: {
      type: 'array',
      minItems: 1,
      maxItems: 200,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['selectionToken', 'title'],
        properties: {
          selectionToken: requiredPublicString(160),
          title: requiredPublicString(120),
        },
      },
    },
    category: { enum: ['Effets', 'Ambiances', 'Musiques', 'Voix'] },
    rightsConfirmed: { const: true },
  },
}

export const soundImportResponseSchemaV1 = {
  $id: 'https://noblesse.studio/schemas/ipc/sound-import-response.v1.json',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'jobId', 'status', 'total'],
  properties: {
    schemaVersion: { const: PUBLIC_IPC_SCHEMA_VERSION },
    jobId: { type: 'string', pattern: '^job-[a-f0-9-]{36}$' },
    status: { enum: ['QUEUED', 'RUNNING'] },
    total: { type: 'integer', minimum: 1, maximum: 200 },
  },
}

export const publicProjectSchemaV1 = {
  $id: 'https://noblesse.studio/schemas/ipc/public-project.v1.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'id', 'name', 'platform', 'opened', 'connected', 'canInstall',
    'transferReady', 'favorite', 'registered', 'status', 'installCapabilities',
  ],
  properties: {
    id: requiredPublicString(160),
    name: requiredPublicString(240),
    platform: { enum: ['UEFN', 'Unreal', 'Roblox'] },
    opened: { type: 'boolean' },
    connected: { type: 'boolean' },
    canInstall: { type: 'boolean' },
    installCapabilities: {
      type: 'object',
      additionalProperties: false,
      required: ['material', 'sound', 'staticMesh', 'vfx'],
      properties: {
        material: { type: 'boolean' },
        sound: { type: 'boolean' },
        staticMesh: { type: 'boolean' },
        vfx: { type: 'boolean' },
      },
    },
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

export const installAssetRequestSchemaV1 = {
  $id: 'https://noblesse.studio/schemas/ipc/install-asset-request.v1.json',
  type: 'object',
  additionalProperties: false,
  required: ['assetId', 'projectId'],
  properties: {
    assetId: requiredPublicString(180),
    projectId: requiredPublicString(180),
  },
}

export const installAssetResponseSchemaV1 = {
  $id: 'https://noblesse.studio/schemas/ipc/install-asset-response.v1.json',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'accepted', 'mode', 'project'],
  properties: {
    schemaVersion: { const: PUBLIC_IPC_SCHEMA_VERSION },
    accepted: { const: true },
    mode: {
      enum: [
        'ALREADY_INSTALLED',
        'INSTALLED',
        'INSTALLED_AND_VALIDATED',
        'INSTALLED_AND_VERIFIED',
        'MANUAL_AUDIO_IMPORT_READY',
      ],
    },
    project: requiredPublicString(240),
  },
}

const vaultTrashTargetSchemaV1 = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'type'],
  properties: {
    id: requiredPublicString(180),
    name: requiredPublicString(260),
    type: requiredPublicString(100),
  },
}

export const vaultTrashPlanRequestSchemaV1 = {
  $id: 'https://noblesse.studio/schemas/ipc/vault-trash-plan-request.v1.json',
  type: 'object',
  additionalProperties: false,
  required: ['assetIds'],
  properties: {
    assetIds: { type: 'array', minItems: 1, maxItems: 200, uniqueItems: true, items: requiredPublicString(180) },
  },
}

export const vaultTrashPlanResponseSchemaV1 = {
  $id: 'https://noblesse.studio/schemas/ipc/vault-trash-plan-response.v1.json',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'operationId', 'planHash', 'title', 'targetCount', 'targets', 'blockers', 'blocked', 'recoverable', 'originalsPreserved'],
  properties: {
    schemaVersion: { const: PUBLIC_IPC_SCHEMA_VERSION },
    operationId: requiredPublicString(100),
    planHash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    title: requiredPublicString(260),
    targetCount: { type: 'integer', minimum: 1, maximum: 200 },
    targets: { type: 'array', minItems: 1, maxItems: 200, items: vaultTrashTargetSchemaV1 },
    blockers: { type: 'array', maxItems: 200, items: vaultTrashTargetSchemaV1 },
    blocked: { type: 'boolean' },
    recoverable: { const: true },
    originalsPreserved: { const: true },
  },
}

export const vaultTrashApplyRequestSchemaV1 = {
  $id: 'https://noblesse.studio/schemas/ipc/vault-trash-apply-request.v1.json',
  type: 'object',
  additionalProperties: false,
  required: ['operationId', 'planHash', 'confirmationPhrase'],
  properties: {
    operationId: requiredPublicString(100),
    planHash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    confirmationPhrase: { const: 'CORBEILLE' },
  },
}

export const vaultTrashItemSchemaV1 = {
  $id: 'https://noblesse.studio/schemas/ipc/vault-trash-item.v1.json',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'trashId', 'title', 'deletedAt', 'targetCount', 'targets', 'originalsPreserved'],
  properties: {
    schemaVersion: { const: PUBLIC_IPC_SCHEMA_VERSION },
    trashId: requiredPublicString(100),
    title: requiredPublicString(260),
    deletedAt: requiredPublicString(40),
    targetCount: { type: 'integer', minimum: 1, maximum: 200 },
    targets: { type: 'array', minItems: 1, maxItems: 200, items: vaultTrashTargetSchemaV1 },
    originalsPreserved: { const: true },
  },
}

export const vaultTrashListResponseSchemaV1 = {
  $id: 'https://noblesse.studio/schemas/ipc/vault-trash-list-response.v1.json',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'items'],
  properties: {
    schemaVersion: { const: PUBLIC_IPC_SCHEMA_VERSION },
    items: { type: 'array', maxItems: 10_000, items: vaultTrashItemSchemaV1 },
  },
}

export const vaultTrashRestoreRequestSchemaV1 = {
  $id: 'https://noblesse.studio/schemas/ipc/vault-trash-restore-request.v1.json',
  type: 'object',
  additionalProperties: false,
  required: ['trashId'],
  properties: { trashId: requiredPublicString(100) },
}

export const vaultTrashRestoreResponseSchemaV1 = {
  $id: 'https://noblesse.studio/schemas/ipc/vault-trash-restore-response.v1.json',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'restored', 'trashId', 'targetCount'],
  properties: {
    schemaVersion: { const: PUBLIC_IPC_SCHEMA_VERSION },
    restored: { const: true },
    trashId: requiredPublicString(100),
    targetCount: { type: 'integer', minimum: 1, maximum: 200 },
  },
}

const ajv = new Ajv2020({ allErrors: true, strict: true })
const validateAssetsResponse = ajv.compile(assetsResponseSchemaV1)
const validateProjectsResponse = ajv.compile(projectsResponseSchemaV1)
const validateProjectFavoriteRequest = ajv.compile(projectFavoriteRequestSchemaV1)
const validateInstallAssetRequest = ajv.compile(installAssetRequestSchemaV1)
const validateInstallAssetResponse = ajv.compile(installAssetResponseSchemaV1)
const validateSoundSelectionResponse = ajv.compile(soundSelectionResponseSchemaV1)
const validateSoundImportRequest = ajv.compile(soundImportRequestSchemaV1)
const validateSoundImportResponse = ajv.compile(soundImportResponseSchemaV1)
const validateVaultTrashPlanRequest = ajv.compile(vaultTrashPlanRequestSchemaV1)
const validateVaultTrashPlanResponse = ajv.compile(vaultTrashPlanResponseSchemaV1)
const validateVaultTrashApplyRequest = ajv.compile(vaultTrashApplyRequestSchemaV1)
const validateVaultTrashItem = ajv.compile(vaultTrashItemSchemaV1)
const validateVaultTrashListResponse = ajv.compile(vaultTrashListResponseSchemaV1)
const validateVaultTrashRestoreRequest = ajv.compile(vaultTrashRestoreRequestSchemaV1)
const validateVaultTrashRestoreResponse = ajv.compile(vaultTrashRestoreResponseSchemaV1)

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
    'label', 'description', 'category', 'asset_group', 'module_id', 'module_label',
    'catalog_visibility', 'dependencies', 'original_format', 'conversion_profile',
  ]) copyString(dto, asset, key)
  for (const key of [
    'order', 'technical_maps', 'module_order', 'mesh_object_count', 'vertex_count', 'triangle_count',
    'bounds_x_m', 'bounds_y_m', 'bounds_z_m', 'duration_seconds', 'size_bytes', 'sample_rate', 'channels', 'bit_depth',
  ]) copyNumber(dto, asset, key)
  if (typeof asset?.animated === 'boolean') dto.animated = asset.animated
  if (typeof asset?.converted === 'boolean') dto.converted = asset.converted
  if (Array.isArray(asset?.platforms)) {
    dto.platforms = asset.platforms.filter((value) => typeof value === 'string')
  }
  if (typeof asset?.preview_source === 'string' && asset.preview_source && dto.asset_id) {
    dto.preview_url = `noblesse-vault://preview/${encodeURIComponent(dto.asset_id)}`
  }
  if (asset?.asset_type === 'SoundWave' && typeof asset?.source === 'string' && asset.source && dto.asset_id) {
    dto.audio_url = `noblesse-vault://audio/${encodeURIComponent(dto.asset_id)}`
  }
  if (asset?.asset_type === 'StaticMesh' && typeof asset?.model_preview_source === 'string' && asset.model_preview_source && dto.asset_id) {
    dto.model_preview_url = `noblesse-vault://model/${encodeURIComponent(dto.asset_id)}`
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
    installCapabilities: {
      material: project?.capabilities?.materialRecipe === true
        || (project?.platform === 'Unreal' && project?.canInstall === true),
      sound: project?.capabilities?.soundHandoff === true,
      staticMesh: project?.capabilities?.staticMesh === true,
      vfx: project?.capabilities?.vfx === true,
    },
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

export const assertInstallAssetRequestV1 = (payload) => assertValid(
  validateInstallAssetRequest,
  payload,
  'Requête publique installation asset v1',
)

export const assertInstallAssetResponseV1 = (payload) => assertValid(
  validateInstallAssetResponse,
  payload,
  'Réponse publique installation asset v1',
)

export const assertSoundSelectionResponseV1 = (payload) => assertValid(
  validateSoundSelectionResponse,
  payload,
  'Réponse publique sélection son v1',
)

export const assertSoundImportRequestV1 = (payload) => assertValid(
  validateSoundImportRequest,
  payload,
  'Requête publique import son v1',
)

export const assertSoundImportResponseV1 = (payload) => assertValid(
  validateSoundImportResponse,
  payload,
  'Réponse publique import son v1',
)

export const assertVaultTrashPlanRequestV1 = (payload) => assertValid(validateVaultTrashPlanRequest, payload, 'Requête plan corbeille v1')
export const assertVaultTrashPlanResponseV1 = (payload) => assertValid(validateVaultTrashPlanResponse, payload, 'Réponse plan corbeille v1')
export const assertVaultTrashApplyRequestV1 = (payload) => assertValid(validateVaultTrashApplyRequest, payload, 'Requête confirmation corbeille v1')
export const assertVaultTrashItemV1 = (payload) => assertValid(validateVaultTrashItem, payload, 'Élément de corbeille v1')
export const assertVaultTrashListResponseV1 = (payload) => assertValid(validateVaultTrashListResponse, payload, 'Liste de corbeille v1')
export const assertVaultTrashRestoreRequestV1 = (payload) => assertValid(validateVaultTrashRestoreRequest, payload, 'Requête restauration corbeille v1')
export const assertVaultTrashRestoreResponseV1 = (payload) => assertValid(validateVaultTrashRestoreResponse, payload, 'Réponse restauration corbeille v1')

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

export const serializeInstallAssetResponseV1 = (response) => assertInstallAssetResponseV1({
  schemaVersion: PUBLIC_IPC_SCHEMA_VERSION,
  accepted: true,
  mode: response?.mode,
  project: response?.project,
})

export const serializeSoundSelectionResponseV1 = (response) => assertSoundSelectionResponseV1(response)

export const serializeSoundImportResponseV1 = (response) => assertSoundImportResponseV1({
  schemaVersion: PUBLIC_IPC_SCHEMA_VERSION,
  jobId: response?.id,
  status: response?.status,
  total: response?.progress?.total,
})

export const publicIpcContractInternals = { findPrivatePath }
