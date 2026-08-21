export const SHADER_RECIPE_PLAN_VERSION = 1

export const SHADER_RECIPE_LIMITS = Object.freeze({
  maxNodes: 64,
  maxConnections: 192,
  maxOutputs: 7,
  maxTextures: 16,
  maxGraphDepth: 32,
  maxErrors: 32,
  maxIdLength: 64,
  maxRoleLength: 96,
  maxSourceLength: 1024,
})

export const SHADER_RECIPE_ERROR_CODES = Object.freeze({
  INVALID_RECIPE: 'SR_INVALID_RECIPE',
  UNKNOWN_FIELD: 'SR_UNKNOWN_FIELD',
  LIMIT_EXCEEDED: 'SR_LIMIT_EXCEEDED',
  INVALID_ID: 'SR_INVALID_ID',
  DUPLICATE_NODE_ID: 'SR_DUPLICATE_NODE_ID',
  UNSUPPORTED_NODE_KIND: 'SR_UNSUPPORTED_NODE_KIND',
  UNSUPPORTED_PROPERTY: 'SR_UNSUPPORTED_PROPERTY',
  INVALID_PROPERTY: 'SR_INVALID_PROPERTY',
  CLASS_PATH_MISMATCH: 'SR_CLASS_PATH_MISMATCH',
  INVALID_TEXTURE_MANIFEST: 'SR_INVALID_TEXTURE_MANIFEST',
  DUPLICATE_TEXTURE_ROLE: 'SR_DUPLICATE_TEXTURE_ROLE',
  UNSAFE_TEXTURE_SOURCE: 'SR_UNSAFE_TEXTURE_SOURCE',
  UNMANIFESTED_TEXTURE_ROLE: 'SR_UNMANIFESTED_TEXTURE_ROLE',
  UNSUPPORTED_SAMPLER: 'SR_UNSUPPORTED_SAMPLER',
  TEXTURE_SAMPLER_MISMATCH: 'SR_TEXTURE_SAMPLER_MISMATCH',
  INVALID_CONNECTION: 'SR_INVALID_CONNECTION',
  UNKNOWN_NODE_REFERENCE: 'SR_UNKNOWN_NODE_REFERENCE',
  UNSUPPORTED_PIN: 'SR_UNSUPPORTED_PIN',
  DUPLICATE_INPUT: 'SR_DUPLICATE_INPUT',
  MISSING_INPUT: 'SR_MISSING_INPUT',
  GRAPH_CYCLE: 'SR_GRAPH_CYCLE',
  GRAPH_DEPTH_LIMIT: 'SR_GRAPH_DEPTH_LIMIT',
  INVALID_OUTPUT: 'SR_INVALID_OUTPUT',
  UNSUPPORTED_OUTPUT: 'SR_UNSUPPORTED_OUTPUT',
  DUPLICATE_OUTPUT: 'SR_DUPLICATE_OUTPUT',
  TYPE_MISMATCH: 'SR_TYPE_MISMATCH',
  INTERNAL_COMPILER_ERROR: 'SR_INTERNAL_COMPILER_ERROR',
})

const CODES = SHADER_RECIPE_ERROR_CODES
const OWN = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/
const ROLE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/
const HEX_COLOR_PATTERN = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i
const SHA256_PATTERN = /^[0-9a-f]{64}$/i
const MAX_ABSOLUTE_NUMBER = 65_536

const RECIPE_FIELDS = new Set(['assetName', 'schemaVersion', 'textures', 'nodes', 'connections', 'outputs'])
const NODE_FIELDS = new Set(['id', 'kind', 'properties', 'classPath', 'x', 'y'])
const CONNECTION_FIELDS = new Set(['fromNode', 'fromPin', 'toNode', 'toPin'])
const OUTPUT_FIELDS = new Set(['node', 'pin', 'property'])
const TEXTURE_FIELDS = new Set([
  'role',
  'assetName',
  'source',
  'width',
  'height',
  'sha256',
  'samplerType',
  'colorSpace',
])

const CLASS_PATHS = Object.freeze({
  Add: '/Script/Engine.MaterialExpressionAdd',
  Fresnel: '/Script/Engine.MaterialExpressionFresnel',
  Lerp: '/Script/Engine.MaterialExpressionLinearInterpolate',
  Multiply: '/Script/Engine.MaterialExpressionMultiply',
  Panner: '/Script/Engine.MaterialExpressionPanner',
  Rotator: '/Script/Engine.MaterialExpressionRotator',
  Scalar: '/Script/Engine.MaterialExpressionScalarParameter',
  Sine: '/Script/Engine.MaterialExpressionSine',
  TexCoord: '/Script/Engine.MaterialExpressionTextureCoordinate',
  Texture: '/Script/Engine.MaterialExpressionTextureSampleParameter2D',
  Time: '/Script/Engine.MaterialExpressionTime',
  Vector: '/Script/Engine.MaterialExpressionVectorParameter',
})

const NODE_SCHEMAS = Object.freeze({
  Add: schema(['Desc'], ['Output'], ['A', 'B'], ['A', 'B']),
  Fresnel: schema(['BaseReflectFraction', 'Desc', 'Exponent'], ['Output'], [], []),
  Lerp: schema(['Desc'], ['Output'], ['A', 'Alpha', 'B'], ['A', 'B', 'Alpha']),
  Multiply: schema(['Desc'], ['Output'], ['A', 'B'], ['A', 'B']),
  Panner: schema(['Desc', 'SpeedX', 'SpeedY'], ['Output'], ['Coordinate'], []),
  Rotator: schema(['CenterX', 'CenterY', 'Desc', 'Speed'], ['Output'], ['Coordinate'], []),
  Scalar: schema(
    ['DefaultValue', 'Desc', 'Group', 'ParameterName', 'SortPriority'],
    ['Output'],
    [],
    [],
  ),
  Sine: schema(['Desc', 'Period'], ['Output'], ['Input'], ['Input']),
  TexCoord: schema(['Desc', 'UTiling', 'VTiling'], ['Output'], [], []),
  Texture: schema(
    ['Desc', 'Group', 'ParameterName', 'Role', 'SamplerType', 'Texture'],
    ['A', 'B', 'G', 'Output', 'R', 'RGB', 'RGBA'],
    ['UVs'],
    [],
  ),
  Time: schema(['Desc'], ['Output'], [], []),
  Vector: schema(
    ['DefaultValue', 'DefaultValueHex', 'Desc', 'Group', 'ParameterName', 'SortPriority'],
    ['A', 'B', 'G', 'Output', 'R', 'RGB', 'RGBA'],
    [],
    [],
  ),
})

const OUTPUT_SCHEMAS = Object.freeze({
  MP_AmbientOcclusion: outputSchema('ambientOcclusion', ['scalar']),
  MP_BaseColor: outputSchema('baseColor', ['scalar', 'vec3', 'vec4']),
  MP_EmissiveColor: outputSchema('emissiveColor', ['scalar', 'vec3', 'vec4']),
  MP_Metallic: outputSchema('metalness', ['scalar']),
  MP_Normal: outputSchema('normal', ['vec3', 'vec4']),
  MP_Roughness: outputSchema('roughness', ['scalar']),
  MP_Specular: outputSchema('specular', ['scalar']),
})

const OUTPUT_ORDER = Object.freeze([
  'MP_BaseColor',
  'MP_Normal',
  'MP_AmbientOcclusion',
  'MP_Roughness',
  'MP_Metallic',
  'MP_Specular',
  'MP_EmissiveColor',
])

const SAMPLER_TYPES = Object.freeze({
  SAMPLERTYPE_Color: 'color',
  SAMPLERTYPE_LinearColor: 'linear',
  SAMPLERTYPE_Masks: 'data',
  SAMPLERTYPE_Normal: 'normal',
})

const COLOR_SPACE_SAMPLERS = Object.freeze({
  data: 'data',
  linear: 'linear',
  normal: 'normal',
  srgb: 'color',
})

function schema(properties, sourcePins, targetPins, requiredPins) {
  return Object.freeze({
    properties: new Set(properties),
    sourcePins: new Set(sourcePins),
    targetPins: new Set(targetPins),
    requiredPins: Object.freeze(requiredPins),
  })
}

function outputSchema(slot, types) {
  return Object.freeze({ slot, types: new Set(types) })
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  return Object.values(Object.getOwnPropertyDescriptors(value)).every((descriptor) => OWN(descriptor, 'value'))
}

function makeReporter() {
  const errors = []
  let truncated = false

  const add = (code, path, message) => {
    if (errors.length < SHADER_RECIPE_LIMITS.maxErrors - 1) {
      errors.push({ code, path, message })
      return
    }
    if (!truncated) {
      truncated = true
      errors.push({
        code: CODES.LIMIT_EXCEEDED,
        path: '$',
        message: `Validation stopped after ${SHADER_RECIPE_LIMITS.maxErrors} errors.`,
      })
    }
  }

  return { add, errors }
}

function failure(errors) {
  return {
    ok: false,
    plan: null,
    errors: [...errors].sort((left, right) => (
      compareText(left.path, right.path)
      || compareText(left.code, right.code)
      || compareText(left.message, right.message)
    )),
  }
}

function unknownFields(record, allowed, path, add) {
  for (const key of Object.keys(record).sort(compareText)) {
    if (!allowed.has(key)) add(CODES.UNKNOWN_FIELD, `${path}.${key}`, 'Field is not part of the shader recipe contract.')
  }
}

function validToken(value, maxLength, pattern) {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= maxLength
    && pattern.test(value)
}

function validFiniteNumber(value, minimum = -MAX_ABSOLUTE_NUMBER, maximum = MAX_ABSOLUTE_NUMBER) {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum
}

function validateOptionalText(properties, key, path, add, maxLength) {
  if (!OWN(properties, key)) return
  const value = properties[key]
  if (typeof value !== 'string' || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
    add(CODES.INVALID_PROPERTY, `${path}.${key}`, `${key} must be bounded plain text.`)
  }
}

function numberProperty(properties, key, path, add, {
  fallback,
  minimum = -MAX_ABSOLUTE_NUMBER,
  maximum = MAX_ABSOLUTE_NUMBER,
  required = false,
} = {}) {
  if (!OWN(properties, key)) {
    if (required) add(CODES.INVALID_PROPERTY, `${path}.${key}`, `${key} is required.`)
    return fallback
  }
  const value = properties[key]
  if (!validFiniteNumber(value, minimum, maximum)) {
    add(CODES.INVALID_PROPERTY, `${path}.${key}`, `${key} must be a finite number in the supported range.`)
    return fallback
  }
  return value
}

function normalizeSampler(value, path, add) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !OWN(SAMPLER_TYPES, value)) {
    add(CODES.UNSUPPORTED_SAMPLER, path, 'Texture sampler is not allowlisted.')
    return null
  }
  return SAMPLER_TYPES[value]
}

function safeRelativeTextureSource(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > SHADER_RECIPE_LIMITS.maxSourceLength) return false
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) || value.startsWith('/') || value.startsWith('\\')) return false
  if (value.includes('\\') || value.includes('//') || /[\u0000-\u001f\u007f%]/.test(value)) return false
  const segments = value.split('/')
  return segments.every((segment) => segment && segment !== '.' && segment !== '..' && /^[A-Za-z0-9][A-Za-z0-9._ ()-]*$/.test(segment))
}

function validateTextureManifest(textures, add) {
  const entries = []
  const aliases = new Map()
  const canonicalRoles = new Set()

  for (let index = 0; index < textures.length; index += 1) {
    const path = `textures[${index}]`
    const texture = textures[index]
    if (!isRecord(texture)) {
      add(CODES.INVALID_TEXTURE_MANIFEST, path, 'Texture manifest entry must be an object.')
      continue
    }
    unknownFields(texture, TEXTURE_FIELDS, path, add)

    const role = OWN(texture, 'role') ? texture.role : texture.assetName
    if (!validToken(role, SHADER_RECIPE_LIMITS.maxRoleLength, ROLE_PATTERN)) {
      add(CODES.INVALID_TEXTURE_MANIFEST, `${path}.role`, 'Texture role or assetName is invalid.')
      continue
    }
    if (OWN(texture, 'assetName') && !validToken(texture.assetName, SHADER_RECIPE_LIMITS.maxRoleLength, ROLE_PATTERN)) {
      add(CODES.INVALID_TEXTURE_MANIFEST, `${path}.assetName`, 'Texture assetName is invalid.')
    }
    if (canonicalRoles.has(role)) {
      add(CODES.DUPLICATE_TEXTURE_ROLE, `${path}.role`, 'Texture role is declared more than once.')
      continue
    }
    canonicalRoles.add(role)

    if (OWN(texture, 'source') && !safeRelativeTextureSource(texture.source)) {
      add(CODES.UNSAFE_TEXTURE_SOURCE, `${path}.source`, 'Only bounded vault-relative texture sources are accepted.')
    }
    for (const dimension of ['width', 'height']) {
      if (OWN(texture, dimension) && (!Number.isInteger(texture[dimension]) || texture[dimension] < 1 || texture[dimension] > 16_384)) {
        add(CODES.INVALID_TEXTURE_MANIFEST, `${path}.${dimension}`, `${dimension} must be an integer from 1 to 16384.`)
      }
    }
    if (OWN(texture, 'sha256') && (typeof texture.sha256 !== 'string' || !SHA256_PATTERN.test(texture.sha256))) {
      add(CODES.INVALID_TEXTURE_MANIFEST, `${path}.sha256`, 'sha256 must contain exactly 64 hexadecimal characters.')
    }

    const sampler = normalizeSampler(texture.samplerType, `${path}.samplerType`, add)
    let colorSpaceSampler = null
    if (OWN(texture, 'colorSpace')) {
      if (typeof texture.colorSpace !== 'string' || !OWN(COLOR_SPACE_SAMPLERS, texture.colorSpace)) {
        add(CODES.UNSUPPORTED_SAMPLER, `${path}.colorSpace`, 'Texture color space is not allowlisted.')
      } else {
        colorSpaceSampler = COLOR_SPACE_SAMPLERS[texture.colorSpace]
      }
    }
    if (sampler && colorSpaceSampler && sampler !== colorSpaceSampler) {
      add(CODES.TEXTURE_SAMPLER_MISMATCH, path, 'Texture sampler and colorSpace disagree.')
    }

    const entry = { role, sampler: sampler || colorSpaceSampler }
    entries.push(entry)
    for (const alias of new Set([role, texture.assetName].filter(Boolean))) {
      if (aliases.has(alias)) {
        add(CODES.DUPLICATE_TEXTURE_ROLE, `${path}.assetName`, 'Texture role or alias collides with another manifest entry.')
      } else {
        aliases.set(alias, entry)
      }
    }
  }

  return { entries, aliases }
}

function validateNodeMetadata(properties, path, add) {
  validateOptionalText(properties, 'Desc', path, add, 512)
  validateOptionalText(properties, 'Group', path, add, 128)
  validateOptionalText(properties, 'ParameterName', path, add, 128)
  if (OWN(properties, 'SortPriority') && (!Number.isInteger(properties.SortPriority) || Math.abs(properties.SortPriority) > 10_000)) {
    add(CODES.INVALID_PROPERTY, `${path}.SortPriority`, 'SortPriority must be a bounded integer.')
  }
}

function normalizeColor(properties, path, add) {
  const hasArray = OWN(properties, 'DefaultValue')
  const hasHex = OWN(properties, 'DefaultValueHex')
  if (hasArray === hasHex) {
    add(CODES.INVALID_PROPERTY, path, 'Vector requires exactly one of DefaultValue or DefaultValueHex.')
    return [0, 0, 0, 1]
  }

  if (hasHex) {
    if (typeof properties.DefaultValueHex !== 'string') {
      add(CODES.INVALID_PROPERTY, `${path}.DefaultValueHex`, 'DefaultValueHex must be a six- or eight-digit color.')
      return [0, 0, 0, 1]
    }
    const match = properties.DefaultValueHex.match(HEX_COLOR_PATTERN)
    if (!match) {
      add(CODES.INVALID_PROPERTY, `${path}.DefaultValueHex`, 'DefaultValueHex must be a six- or eight-digit color.')
      return [0, 0, 0, 1]
    }
    const rgb = match[1]
    return [
      Number.parseInt(rgb.slice(0, 2), 16) / 255,
      Number.parseInt(rgb.slice(2, 4), 16) / 255,
      Number.parseInt(rgb.slice(4, 6), 16) / 255,
      match[2] ? Number.parseInt(match[2], 16) / 255 : 1,
    ]
  }

  if (!Array.isArray(properties.DefaultValue) || ![3, 4].includes(properties.DefaultValue.length)) {
    add(CODES.INVALID_PROPERTY, `${path}.DefaultValue`, 'DefaultValue must be an RGB or RGBA number array.')
    return [0, 0, 0, 1]
  }
  if (properties.DefaultValue.some((value) => !validFiniteNumber(value))) {
    add(CODES.INVALID_PROPERTY, `${path}.DefaultValue`, 'Every color component must be a finite number in the supported range.')
    return [0, 0, 0, 1]
  }
  return properties.DefaultValue.length === 3
    ? [...properties.DefaultValue, 1]
    : [...properties.DefaultValue]
}

function normalizeNodeProperties(kind, properties, path, add, textureAliases) {
  validateNodeMetadata(properties, path, add)

  switch (kind) {
    case 'Vector':
      return { value: normalizeColor(properties, path, add) }
    case 'Scalar':
      return {
        value: numberProperty(properties, 'DefaultValue', path, add, { fallback: 0, required: true }),
      }
    case 'TexCoord':
      return {
        scale: [
          numberProperty(properties, 'UTiling', path, add, { fallback: 1, minimum: -64, maximum: 64 }),
          numberProperty(properties, 'VTiling', path, add, { fallback: 1, minimum: -64, maximum: 64 }),
        ],
      }
    case 'Panner':
      return {
        speed: [
          numberProperty(properties, 'SpeedX', path, add, { fallback: 0, minimum: -16, maximum: 16 }),
          numberProperty(properties, 'SpeedY', path, add, { fallback: 0, minimum: -16, maximum: 16 }),
        ],
      }
    case 'Rotator':
      return {
        center: [
          numberProperty(properties, 'CenterX', path, add, { fallback: 0.5, minimum: -16, maximum: 16 }),
          numberProperty(properties, 'CenterY', path, add, { fallback: 0.5, minimum: -16, maximum: 16 }),
        ],
        speed: numberProperty(properties, 'Speed', path, add, { fallback: 0, minimum: -16, maximum: 16 }),
      }
    case 'Sine':
      return {
        period: numberProperty(properties, 'Period', path, add, { fallback: 1, minimum: 0.001, maximum: 3_600 }),
      }
    case 'Fresnel':
      return {
        exponent: numberProperty(properties, 'Exponent', path, add, { fallback: 5, minimum: 0, maximum: 64 }),
        baseReflectFraction: numberProperty(properties, 'BaseReflectFraction', path, add, { fallback: 0.04, minimum: 0, maximum: 1 }),
      }
    case 'Texture': {
      const hasRole = OWN(properties, 'Role')
      const hasTexture = OWN(properties, 'Texture')
      if (!hasRole && !hasTexture) {
        add(CODES.INVALID_PROPERTY, `${path}.Texture`, 'Texture node must reference one manifested role.')
        return { textureRole: '', sampler: null }
      }
      if (hasRole && hasTexture && properties.Role !== properties.Texture) {
        add(CODES.INVALID_PROPERTY, path, 'Role and Texture cannot reference different manifest entries.')
      }
      const reference = hasRole ? properties.Role : properties.Texture
      if (!validToken(reference, SHADER_RECIPE_LIMITS.maxRoleLength, ROLE_PATTERN)) {
        add(CODES.INVALID_PROPERTY, `${path}.${hasRole ? 'Role' : 'Texture'}`, 'Texture role reference is invalid.')
        return { textureRole: '', sampler: null }
      }
      const manifestEntry = textureAliases.get(reference)
      if (!manifestEntry) {
        add(CODES.UNMANIFESTED_TEXTURE_ROLE, `${path}.${hasRole ? 'Role' : 'Texture'}`, 'Texture role is not present in the recipe manifest.')
        return { textureRole: reference, sampler: null }
      }
      const nodeSampler = normalizeSampler(properties.SamplerType, `${path}.SamplerType`, add)
      if (nodeSampler && manifestEntry.sampler && nodeSampler !== manifestEntry.sampler) {
        add(CODES.TEXTURE_SAMPLER_MISMATCH, path, 'Texture node sampler disagrees with its manifest entry.')
      }
      const sampler = nodeSampler || manifestEntry.sampler
      if (!sampler) {
        add(CODES.UNSUPPORTED_SAMPLER, `${path}.SamplerType`, 'Texture sampler must be declared by the node or manifest.')
      }
      return { textureRole: manifestEntry.role, sampler }
    }
    default:
      return {}
  }
}

function validateNodes(nodes, textureAliases, add) {
  const byId = new Map()
  const normalized = []

  for (let index = 0; index < nodes.length; index += 1) {
    const path = `nodes[${index}]`
    const node = nodes[index]
    if (!isRecord(node)) {
      add(CODES.INVALID_RECIPE, path, 'Node must be an object.')
      continue
    }
    unknownFields(node, NODE_FIELDS, path, add)

    if (!validToken(node.id, SHADER_RECIPE_LIMITS.maxIdLength, ID_PATTERN)) {
      add(CODES.INVALID_ID, `${path}.id`, 'Node id is invalid.')
      continue
    }
    if (byId.has(node.id)) {
      add(CODES.DUPLICATE_NODE_ID, `${path}.id`, 'Node id is declared more than once.')
      continue
    }
    if (typeof node.kind !== 'string' || !OWN(NODE_SCHEMAS, node.kind)) {
      add(CODES.UNSUPPORTED_NODE_KIND, `${path}.kind`, 'Node kind is not allowlisted.')
      continue
    }

    const schemaForNode = NODE_SCHEMAS[node.kind]
    const properties = OWN(node, 'properties') ? node.properties : {}
    if (!isRecord(properties)) {
      add(CODES.INVALID_PROPERTY, `${path}.properties`, 'Node properties must be an object.')
      continue
    }
    for (const key of Object.keys(properties).sort(compareText)) {
      if (!schemaForNode.properties.has(key)) {
        add(CODES.UNSUPPORTED_PROPERTY, `${path}.properties.${key}`, 'Node property is not allowlisted for this kind.')
      }
    }
    if (OWN(node, 'classPath') && node.classPath !== CLASS_PATHS[node.kind]) {
      add(CODES.CLASS_PATH_MISMATCH, `${path}.classPath`, 'classPath does not match the allowlisted node kind.')
    }
    for (const coordinate of ['x', 'y']) {
      if (OWN(node, coordinate) && !validFiniteNumber(node[coordinate], -10_000_000, 10_000_000)) {
        add(CODES.INVALID_PROPERTY, `${path}.${coordinate}`, `${coordinate} must be a bounded finite number.`)
      }
    }

    const normalizedNode = {
      id: node.id,
      kind: node.kind,
      properties: normalizeNodeProperties(node.kind, properties, `${path}.properties`, add, textureAliases),
    }
    normalized.push(normalizedNode)
    byId.set(node.id, normalizedNode)
  }

  return { normalized, byId }
}

function validateConnections(connections, nodesById, add) {
  const normalized = []
  const incomingKeys = new Set()

  for (let index = 0; index < connections.length; index += 1) {
    const path = `connections[${index}]`
    const connection = connections[index]
    if (!isRecord(connection)) {
      add(CODES.INVALID_CONNECTION, path, 'Connection must be an object.')
      continue
    }
    unknownFields(connection, CONNECTION_FIELDS, path, add)
    const fieldsValid = ['fromNode', 'fromPin', 'toNode', 'toPin'].every((key) => typeof connection[key] === 'string')
    if (!fieldsValid) {
      add(CODES.INVALID_CONNECTION, path, 'Connection fields must be strings.')
      continue
    }

    const source = nodesById.get(connection.fromNode)
    const target = nodesById.get(connection.toNode)
    if (!source) add(CODES.UNKNOWN_NODE_REFERENCE, `${path}.fromNode`, 'Connection source node does not exist.')
    if (!target) add(CODES.UNKNOWN_NODE_REFERENCE, `${path}.toNode`, 'Connection target node does not exist.')
    if (!source || !target) continue
    if (!NODE_SCHEMAS[source.kind].sourcePins.has(connection.fromPin)) {
      add(CODES.UNSUPPORTED_PIN, `${path}.fromPin`, 'Source pin is not allowlisted for this node kind.')
    }
    if (!NODE_SCHEMAS[target.kind].targetPins.has(connection.toPin)) {
      add(CODES.UNSUPPORTED_PIN, `${path}.toPin`, 'Target pin is not allowlisted for this node kind.')
    }
    const incomingKey = `${connection.toNode}\u0000${connection.toPin}`
    if (incomingKeys.has(incomingKey)) {
      add(CODES.DUPLICATE_INPUT, path, 'A target input pin may have only one connection.')
    } else {
      incomingKeys.add(incomingKey)
    }
    normalized.push({
      fromNode: connection.fromNode,
      fromPin: connection.fromPin,
      toNode: connection.toNode,
      toPin: connection.toPin,
    })
  }

  const connectedInputs = new Set(normalized.map((edge) => `${edge.toNode}\u0000${edge.toPin}`))
  for (const node of [...nodesById.values()].sort((left, right) => compareText(left.id, right.id))) {
    for (const pin of NODE_SCHEMAS[node.kind].requiredPins) {
      if (!connectedInputs.has(`${node.id}\u0000${pin}`)) {
        add(CODES.MISSING_INPUT, `nodes.${node.id}.${pin}`, 'Required node input is not connected.')
      }
    }
  }

  return normalized
}

function validateOutputs(outputs, nodesById, add) {
  const normalized = []
  const properties = new Set()

  for (let index = 0; index < outputs.length; index += 1) {
    const path = `outputs[${index}]`
    const output = outputs[index]
    if (!isRecord(output)) {
      add(CODES.INVALID_OUTPUT, path, 'Output must be an object.')
      continue
    }
    unknownFields(output, OUTPUT_FIELDS, path, add)
    if (typeof output.node !== 'string' || typeof output.pin !== 'string' || typeof output.property !== 'string') {
      add(CODES.INVALID_OUTPUT, path, 'Output fields must be strings.')
      continue
    }
    if (!OWN(OUTPUT_SCHEMAS, output.property)) {
      add(CODES.UNSUPPORTED_OUTPUT, `${path}.property`, 'Material output is not allowlisted.')
      continue
    }
    if (properties.has(output.property)) {
      add(CODES.DUPLICATE_OUTPUT, `${path}.property`, 'Material output is declared more than once.')
      continue
    }
    properties.add(output.property)
    const node = nodesById.get(output.node)
    if (!node) {
      add(CODES.UNKNOWN_NODE_REFERENCE, `${path}.node`, 'Output node does not exist.')
      continue
    }
    if (!NODE_SCHEMAS[node.kind].sourcePins.has(output.pin)) {
      add(CODES.UNSUPPORTED_PIN, `${path}.pin`, 'Output pin is not allowlisted for this node kind.')
      continue
    }
    normalized.push({ node: output.node, pin: output.pin, property: output.property })
  }

  return normalized.sort((left, right) => OUTPUT_ORDER.indexOf(left.property) - OUTPUT_ORDER.indexOf(right.property))
}

function topologicalOrder(nodes, connections, add) {
  const ids = nodes.map((node) => node.id)
  const indegree = new Map(ids.map((id) => [id, 0]))
  const outgoing = new Map(ids.map((id) => [id, []]))

  for (const connection of connections) {
    indegree.set(connection.toNode, indegree.get(connection.toNode) + 1)
    outgoing.get(connection.fromNode).push(connection.toNode)
  }
  for (const targets of outgoing.values()) targets.sort(compareText)

  const ready = ids.filter((id) => indegree.get(id) === 0).sort(compareText)
  const order = []
  while (ready.length) {
    const id = ready.shift()
    order.push(id)
    for (const target of outgoing.get(id)) {
      indegree.set(target, indegree.get(target) - 1)
      if (indegree.get(target) === 0) {
        ready.push(target)
        ready.sort(compareText)
      }
    }
  }

  if (order.length !== ids.length) {
    add(CODES.GRAPH_CYCLE, 'connections', 'Shader recipe graph must be acyclic.')
    return []
  }

  const incoming = new Map(ids.map((id) => [id, []]))
  for (const connection of connections) incoming.get(connection.toNode).push(connection.fromNode)
  const depth = new Map()
  for (const id of order) {
    const parents = incoming.get(id)
    const nodeDepth = parents.length ? Math.max(...parents.map((parent) => depth.get(parent))) + 1 : 1
    depth.set(id, nodeDepth)
    if (nodeDepth > SHADER_RECIPE_LIMITS.maxGraphDepth) {
      add(CODES.GRAPH_DEPTH_LIMIT, `nodes.${id}`, `Graph depth exceeds ${SHADER_RECIPE_LIMITS.maxGraphDepth}.`)
    }
  }
  return order
}

function reachableNodeIds(outputs, incomingByNode) {
  const reachable = new Set()
  const pending = outputs.map((output) => output.node).sort(compareText).reverse()
  while (pending.length) {
    const id = pending.pop()
    if (reachable.has(id)) continue
    reachable.add(id)
    const parents = (incomingByNode.get(id) || []).map((edge) => edge.fromNode).sort(compareText).reverse()
    pending.push(...parents)
  }
  return reachable
}

function staticResultType(kind) {
  if (['Fresnel', 'Scalar', 'Sine', 'Time'].includes(kind)) return 'scalar'
  if (['Panner', 'Rotator', 'TexCoord'].includes(kind)) return 'vec2'
  if (['Texture', 'Vector'].includes(kind)) return 'vec4'
  return null
}

function sourcePinDescriptor(node, pin, resultTypes) {
  const resultType = resultTypes.get(node.id) || staticResultType(node.kind)
  if (['Scalar', 'Time', 'Sine', 'Fresnel', 'Panner', 'Rotator', 'TexCoord', 'Add', 'Multiply', 'Lerp'].includes(node.kind)) {
    return { output: 'value', type: resultType }
  }
  const pins = {
    A: { output: 'a', type: 'scalar' },
    B: { output: 'b', type: 'scalar' },
    G: { output: 'g', type: 'scalar' },
    Output: { output: 'rgba', type: 'vec4' },
    R: { output: 'r', type: 'scalar' },
    RGB: { output: 'rgb', type: 'vec3' },
    RGBA: { output: 'rgba', type: 'vec4' },
  }
  return pins[pin]
}

function broadcastType(left, right) {
  if (left === right) return left
  if (left === 'scalar') return right
  if (right === 'scalar') return left
  return null
}

function compilePlan(nodesById, connections, outputs, order, add) {
  const incomingByNode = new Map([...nodesById.keys()].map((id) => [id, []]))
  const incomingByPin = new Map()
  for (const edge of connections) {
    incomingByNode.get(edge.toNode).push(edge)
    incomingByPin.set(`${edge.toNode}\u0000${edge.toPin}`, edge)
  }
  const reachable = reachableNodeIds(outputs, incomingByNode)
  const resultTypes = new Map()
  const flags = new Map()
  const operations = []
  const usedTextures = new Map()

  const referenceFor = (edge) => {
    const source = nodesById.get(edge.fromNode)
    const descriptor = sourcePinDescriptor(source, edge.fromPin, resultTypes)
    return { node: edge.fromNode, output: descriptor.output, type: descriptor.type }
  }
  const input = (nodeId, pin) => {
    const edge = incomingByPin.get(`${nodeId}\u0000${pin}`)
    return edge ? referenceFor(edge) : null
  }
  const inputFlags = (nodeId) => (incomingByNode.get(nodeId) || []).reduce((combined, edge) => {
    const sourceFlags = flags.get(edge.fromNode) || { usesTime: false, usesViewDirection: false }
    return {
      usesTime: combined.usesTime || sourceFlags.usesTime,
      usesViewDirection: combined.usesViewDirection || sourceFlags.usesViewDirection,
    }
  }, { usesTime: false, usesViewDirection: false })

  for (const id of order) {
    const node = nodesById.get(id)
    const inheritedFlags = inputFlags(id)
    let operation
    let resultType = staticResultType(node.kind)
    let nodeFlags = inheritedFlags

    switch (node.kind) {
      case 'Vector':
        operation = { id, op: 'constantColor', resultType, value: node.properties.value }
        break
      case 'Scalar':
        operation = { id, op: 'constantScalar', resultType, value: node.properties.value }
        break
      case 'TexCoord':
        operation = { id, op: 'uv0', resultType, scale: node.properties.scale }
        break
      case 'Time':
        operation = { id, op: 'time', resultType }
        nodeFlags = { ...inheritedFlags, usesTime: true }
        break
      case 'Panner': {
        const coordinate = input(id, 'Coordinate') || { builtin: 'uv0', type: 'vec2' }
        if (coordinate.type !== 'vec2') {
          add(CODES.TYPE_MISMATCH, `nodes.${id}.Coordinate`, 'Panner Coordinate must be vec2.')
        }
        operation = { id, op: 'panner', resultType, coordinate, speed: node.properties.speed }
        nodeFlags = {
          ...inheritedFlags,
          usesTime: inheritedFlags.usesTime || node.properties.speed.some((value) => value !== 0),
        }
        break
      }
      case 'Rotator': {
        const coordinate = input(id, 'Coordinate') || { builtin: 'uv0', type: 'vec2' }
        if (coordinate.type !== 'vec2') {
          add(CODES.TYPE_MISMATCH, `nodes.${id}.Coordinate`, 'Rotator Coordinate must be vec2.')
        }
        operation = {
          id,
          op: 'rotator',
          resultType,
          coordinate,
          center: node.properties.center,
          speed: node.properties.speed,
        }
        nodeFlags = {
          ...inheritedFlags,
          usesTime: inheritedFlags.usesTime || node.properties.speed !== 0,
        }
        break
      }
      case 'Texture': {
        const uv = input(id, 'UVs') || { builtin: 'uv0', type: 'vec2' }
        if (uv.type !== 'vec2') add(CODES.TYPE_MISMATCH, `nodes.${id}.UVs`, 'Texture UVs must be vec2.')
        operation = {
          id,
          op: 'textureSample',
          resultType,
          textureRole: node.properties.textureRole,
          sampler: node.properties.sampler,
          uv,
        }
        if (reachable.has(id)) {
          const previousSampler = usedTextures.get(node.properties.textureRole)
          if (previousSampler && previousSampler !== node.properties.sampler) {
            add(CODES.TEXTURE_SAMPLER_MISMATCH, `nodes.${id}`, 'One texture role cannot use multiple sampler types.')
          }
          usedTextures.set(node.properties.textureRole, node.properties.sampler)
        }
        break
      }
      case 'Sine': {
        const value = input(id, 'Input')
        if (value?.type !== 'scalar') add(CODES.TYPE_MISMATCH, `nodes.${id}.Input`, 'Sine Input must be scalar.')
        operation = { id, op: 'sine', resultType, input: value, period: node.properties.period }
        break
      }
      case 'Fresnel':
        operation = {
          id,
          op: 'fresnel',
          resultType,
          exponent: node.properties.exponent,
          baseReflectFraction: node.properties.baseReflectFraction,
        }
        nodeFlags = { ...inheritedFlags, usesViewDirection: true }
        break
      case 'Add':
      case 'Multiply': {
        const a = input(id, 'A')
        const b = input(id, 'B')
        resultType = a && b ? broadcastType(a.type, b.type) : null
        if (!resultType) add(CODES.TYPE_MISMATCH, `nodes.${id}`, `${node.kind} inputs are not broadcast-compatible.`)
        operation = {
          id,
          op: node.kind === 'Add' ? 'add' : 'multiply',
          resultType: resultType || 'invalid',
          a,
          b,
        }
        break
      }
      case 'Lerp': {
        const a = input(id, 'A')
        const b = input(id, 'B')
        const alpha = input(id, 'Alpha')
        resultType = a && b ? broadcastType(a.type, b.type) : null
        if (!resultType || !alpha || (alpha.type !== 'scalar' && alpha.type !== resultType)) {
          add(CODES.TYPE_MISMATCH, `nodes.${id}`, 'Lerp A/B and Alpha types are not compatible.')
        }
        operation = {
          id,
          op: 'lerp',
          resultType: resultType || 'invalid',
          a,
          b,
          alpha,
        }
        break
      }
      default:
        throw new Error('Validated node kind has no compiler implementation.')
    }

    resultTypes.set(id, resultType)
    flags.set(id, nodeFlags)
    if (reachable.has(id)) operations.push(operation)
  }

  const compiledOutputs = {}
  let usesTime = false
  let usesViewDirection = false
  for (const output of outputs) {
    const node = nodesById.get(output.node)
    const descriptor = sourcePinDescriptor(node, output.pin, resultTypes)
    const outputContract = OUTPUT_SCHEMAS[output.property]
    if (!outputContract.types.has(descriptor.type)) {
      add(CODES.TYPE_MISMATCH, `outputs.${output.property}`, `${output.property} cannot consume ${descriptor.type}.`)
    }
    compiledOutputs[outputContract.slot] = {
      node: output.node,
      output: descriptor.output,
      type: descriptor.type,
    }
    const outputFlags = flags.get(output.node)
    usesTime = usesTime || outputFlags.usesTime
    usesViewDirection = usesViewDirection || outputFlags.usesViewDirection
  }

  return {
    schemaVersion: SHADER_RECIPE_PLAN_VERSION,
    kind: 'shader_recipe_plan',
    operations,
    outputs: compiledOutputs,
    textures: [...usedTextures.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([role, sampler]) => ({ role, sampler })),
    features: { usesTime, usesViewDirection },
  }
}

function compile(recipe) {
  const { add, errors } = makeReporter()
  if (!isRecord(recipe)) {
    add(CODES.INVALID_RECIPE, '$', 'Shader recipe must be a plain object.')
    return failure(errors)
  }
  unknownFields(recipe, RECIPE_FIELDS, '$', add)

  if (OWN(recipe, 'assetName') && (typeof recipe.assetName !== 'string' || recipe.assetName.length > 128)) {
    add(CODES.INVALID_RECIPE, '$.assetName', 'assetName must be bounded text.')
  }
  if (OWN(recipe, 'schemaVersion') && (!Number.isInteger(recipe.schemaVersion) || recipe.schemaVersion < 1 || recipe.schemaVersion > 1)) {
    add(CODES.INVALID_RECIPE, '$.schemaVersion', 'Only shader recipe schemaVersion 1 is supported.')
  }

  const nodes = recipe.nodes
  const textures = OWN(recipe, 'textures') ? recipe.textures : []
  const connections = OWN(recipe, 'connections') ? recipe.connections : []
  const outputs = recipe.outputs
  if (!Array.isArray(nodes) || nodes.length < 1) add(CODES.INVALID_RECIPE, '$.nodes', 'nodes must be a non-empty array.')
  if (!Array.isArray(textures)) add(CODES.INVALID_RECIPE, '$.textures', 'textures must be an array.')
  if (!Array.isArray(connections)) add(CODES.INVALID_RECIPE, '$.connections', 'connections must be an array.')
  if (!Array.isArray(outputs) || outputs.length < 1) add(CODES.INVALID_RECIPE, '$.outputs', 'outputs must be a non-empty array.')
  if (errors.length) return failure(errors)

  if (nodes.length > SHADER_RECIPE_LIMITS.maxNodes) {
    add(CODES.LIMIT_EXCEEDED, '$.nodes', `At most ${SHADER_RECIPE_LIMITS.maxNodes} nodes are accepted.`)
  }
  if (textures.length > SHADER_RECIPE_LIMITS.maxTextures) {
    add(CODES.LIMIT_EXCEEDED, '$.textures', `At most ${SHADER_RECIPE_LIMITS.maxTextures} textures are accepted.`)
  }
  if (connections.length > SHADER_RECIPE_LIMITS.maxConnections) {
    add(CODES.LIMIT_EXCEEDED, '$.connections', `At most ${SHADER_RECIPE_LIMITS.maxConnections} connections are accepted.`)
  }
  if (outputs.length > SHADER_RECIPE_LIMITS.maxOutputs) {
    add(CODES.LIMIT_EXCEEDED, '$.outputs', `At most ${SHADER_RECIPE_LIMITS.maxOutputs} outputs are accepted.`)
  }
  if (errors.length) return failure(errors)

  const manifest = validateTextureManifest(textures, add)
  const validatedNodes = validateNodes(nodes, manifest.aliases, add)
  if (errors.length) return failure(errors)

  const validatedConnections = validateConnections(connections, validatedNodes.byId, add)
  const validatedOutputs = validateOutputs(outputs, validatedNodes.byId, add)
  if (errors.length) return failure(errors)

  const order = topologicalOrder(validatedNodes.normalized, validatedConnections, add)
  if (errors.length) return failure(errors)

  const plan = compilePlan(
    validatedNodes.byId,
    validatedConnections,
    validatedOutputs,
    order,
    add,
  )
  if (errors.length) return failure(errors)
  return { ok: true, plan, errors: [] }
}

/**
 * Compile an untrusted shader_recipe graph into a bounded, serializable runtime plan.
 * Invalid or unsupported input never throws and never produces a partial plan.
 */
export function compileShaderRecipe(recipe) {
  try {
    return compile(recipe)
  } catch {
    return failure([{
      code: CODES.INTERNAL_COMPILER_ERROR,
      path: '$',
      message: 'Shader recipe compilation failed closed.',
    }])
  }
}
