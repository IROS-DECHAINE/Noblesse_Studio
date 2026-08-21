const PREVIEW_SCHEMA_VERSION = 1

const SUPPORTED_SHADER_NODES = new Set([
  'Add',
  'Fresnel',
  'Lerp',
  'Multiply',
  'Panner',
  'Rotator',
  'Scalar',
  'Sine',
  'TexCoord',
  'Texture',
  'Time',
  'Vector',
])

const OUTPUT_LABELS = {
  MP_AmbientOcclusion: 'Occlusion ambiante',
  MP_BaseColor: 'Base Color',
  MP_EmissiveColor: 'Emissive',
  MP_Metallic: 'Metallic',
  MP_Normal: 'Normal',
  MP_Roughness: 'Roughness',
  MP_Specular: 'Specular',
}

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback

const rgba = (value, fallback = [1, 1, 1, 1]) => {
  if (Array.isArray(value) && value.length >= 3) {
    return [
      finite(value[0], fallback[0]),
      finite(value[1], fallback[1]),
      finite(value[2], fallback[2]),
      finite(value[3], fallback[3]),
    ]
  }
  return fallback
}

const hexToRgba = (value, fallback) => {
  const match = String(value || '').trim().match(/^#?([0-9a-f]{6})([0-9a-f]{2})?$/i)
  if (!match) return fallback
  const rgb = match[1]
  return [
    Number.parseInt(rgb.slice(0, 2), 16) / 255,
    Number.parseInt(rgb.slice(2, 4), 16) / 255,
    Number.parseInt(rgb.slice(4, 6), 16) / 255,
    match[2] ? Number.parseInt(match[2], 16) / 255 : 1,
  ]
}

const nodeColor = (node, fallback) => rgba(
  node?.properties?.DefaultValue,
  hexToRgba(node?.properties?.DefaultValueHex, fallback),
)

const nodeScalar = (node, fallback) => finite(node?.properties?.DefaultValue, fallback)

const indexGraph = (recipe = {}) => {
  const nodes = new Map((recipe.nodes || []).map((node) => [node.id, node]))
  const incoming = new Map()
  for (const connection of recipe.connections || []) {
    incoming.set(`${connection.toNode}:${connection.toPin}`, connection)
  }
  return { nodes, incoming }
}

const upstreamTextureIds = (recipe, outputProperty) => {
  const { nodes, incoming } = indexGraph(recipe)
  const output = (recipe.outputs || []).find((item) => item.property === outputProperty)
  if (!output || !nodes.has(output.node)) return []
  const found = []
  const visited = new Set()
  const walk = (nodeId) => {
    if (!nodeId || visited.has(nodeId)) return
    visited.add(nodeId)
    const node = nodes.get(nodeId)
    if (!node) return
    if (node.kind === 'Texture') {
      found.push(node.id)
      return
    }
    for (const connection of incoming.values()) {
      if (connection.toNode === nodeId) walk(connection.fromNode)
    }
  }
  walk(output.node)
  return found
}

const directOutputNode = (recipe, property, kind) => {
  const output = (recipe.outputs || []).find((item) => item.property === property)
  if (!output) return null
  const node = (recipe.nodes || []).find((item) => item.id === output.node)
  return node?.kind === kind ? node : null
}

const findParameterNode = (recipe, kind, patterns) => (recipe.nodes || []).find((node) => {
  if (node.kind !== kind) return false
  const parameterName = String(node.properties?.ParameterName || '')
  return patterns.some((pattern) => pattern.test(parameterName))
})

const materialParameters = (recipe = {}) => {
  const hasEmissiveOutput = (recipe.outputs || []).some((output) => output.property === 'MP_EmissiveColor')
  const baseNode = directOutputNode(recipe, 'MP_BaseColor', 'Vector')
    || findParameterNode(recipe, 'Vector', [/^base[_ ]?(?:color|tint)$/i, /base/i])
  const emissiveNode = directOutputNode(recipe, 'MP_EmissiveColor', 'Vector')
    || findParameterNode(recipe, 'Vector', [/glow[_ ]?primary/i, /emissive/i, /glow/i, /tint/i])
  const roughnessNode = directOutputNode(recipe, 'MP_Roughness', 'Scalar')
    || findParameterNode(recipe, 'Scalar', [/roughness/i])
  const metallicNode = directOutputNode(recipe, 'MP_Metallic', 'Scalar')
    || findParameterNode(recipe, 'Scalar', [/metallic/i])
  const specularNode = directOutputNode(recipe, 'MP_Specular', 'Scalar')
    || findParameterNode(recipe, 'Scalar', [/specular/i])
  const emissiveStrengthNode = findParameterNode(recipe, 'Scalar', [/emissive.*(?:strength|intensity)/i, /glow.*(?:strength|intensity)/i])

  return {
    baseColor: nodeColor(baseNode, [1, 1, 1, 1]),
    emissiveColor: nodeColor(emissiveNode, hasEmissiveOutput ? [1, 1, 1, 1] : [0, 0, 0, 1]),
    emissiveIntensity: hasEmissiveOutput ? nodeScalar(emissiveStrengthNode, 1) : 0,
    metalness: nodeScalar(metallicNode, 0.12),
    roughness: nodeScalar(roughnessNode, 0.34),
    specularIntensity: nodeScalar(specularNode, 0.5),
  }
}

const textureSourceLookup = (recipe = {}) => new Map(
  (recipe.textures || []).map((texture) => [texture.assetName, texture]),
)

const sourceForTextureNode = (node, lookup) => lookup.get(node?.properties?.Texture)?.source || ''

const mapDescriptor = (source, colorSpace, channels = '') => source ? { source, colorSpace, channels } : null

const nativePreviewMaps = (nativePreview) => {
  if (!nativePreview || typeof nativePreview !== 'object') return null
  const maps = nativePreview.maps
  if (!maps?.baseColor?.source || !maps?.normal?.source || !maps?.orm?.source) return null
  if (maps.baseColor.colorSpace !== 'srgb'
    || maps.normal.colorSpace !== 'linear'
    || maps.orm.colorSpace !== 'linear') return null
  if (!String(maps.orm.channels || '').match(/R\s*=\s*AO/i)
    || !String(maps.orm.channels || '').match(/G\s*=\s*Roughness/i)
    || !String(maps.orm.channels || '').match(/B\s*=\s*Metallic/i)) return null
  return {
    baseColor: { ...maps.baseColor },
    normal: { ...maps.normal },
    orm: {
      ...maps.orm,
      ...(nativePreview.ormTransfer === 'SRGB' ? { decode: 'srgb' } : {}),
    },
  }
}

const buildPbrMaps = (recipe = {}) => {
  const lookup = textureSourceLookup(recipe)
  const nodes = new Map((recipe.nodes || []).map((node) => [node.id, node]))
  const firstSource = (property) => {
    const nodeId = upstreamTextureIds(recipe, property)[0]
    return sourceForTextureNode(nodes.get(nodeId), lookup)
  }

  const roughnessSource = firstSource('MP_Roughness')
  const metallicSource = firstSource('MP_Metallic')
  const aoSource = firstSource('MP_AmbientOcclusion')
  const packedOrm = roughnessSource && roughnessSource === metallicSource && (!aoSource || aoSource === roughnessSource)
    ? roughnessSource
    : ''

  return {
    baseColor: mapDescriptor(firstSource('MP_BaseColor'), 'srgb'),
    emissive: mapDescriptor(firstSource('MP_EmissiveColor'), 'srgb'),
    normal: mapDescriptor(firstSource('MP_Normal'), 'linear'),
    orm: mapDescriptor(packedOrm, 'linear', 'R=AO · G=Roughness · B=Metallic'),
  }
}

const visibleChannels = (recipe = {}, maps = {}) => {
  const labels = []
  const add = (key, detail) => {
    if (!labels.some((item) => item.key === key)) labels.push({ key, label: OUTPUT_LABELS[key] || key, detail })
  }
  if (maps.baseColor) add('MP_BaseColor', 'sRGB')
  if (maps.normal) add('MP_Normal', 'Linéaire')
  if (maps.orm) {
    add('MP_AmbientOcclusion', 'ORM · canal R')
    add('MP_Roughness', 'ORM · canal G')
    add('MP_Metallic', 'ORM · canal B')
  }
  if (maps.emissive) add('MP_EmissiveColor', 'sRGB')
  for (const output of recipe.outputs || []) add(output.property, 'Paramètre ou graphe')
  return labels
}

const validateShaderGraph = (recipe = {}) => {
  if (!Array.isArray(recipe.nodes) || !recipe.nodes.length || recipe.nodes.length > 128) return false
  if (!Array.isArray(recipe.outputs) || !recipe.outputs.length) return false
  if ((recipe.textures || []).length > 8) return false
  const ids = new Set(recipe.nodes.map((node) => node.id))
  if (ids.size !== recipe.nodes.length) return false
  if (recipe.nodes.some((node) => !SUPPORTED_SHADER_NODES.has(node.kind))) return false
  if ((recipe.connections || []).some((edge) => !ids.has(edge.fromNode) || !ids.has(edge.toNode))) return false
  return recipe.outputs.every((output) => ids.has(output.node))
}

const shaderGraph = (recipe = {}) => ({
  nodes: (recipe.nodes || []).map((node) => ({
    id: node.id,
    kind: node.kind,
    properties: node.properties || {},
  })),
  connections: recipe.connections || [],
  outputs: recipe.outputs || [],
  textures: recipe.textures || [],
})

export const createMaterialPreviewDescriptor = ({ asset, nativePreview = null, recipe = null } = {}) => {
  if (!asset?.asset_id) throw new Error('Asset de prévisualisation invalide')

  const base = {
    schemaVersion: PREVIEW_SCHEMA_VERSION,
    assetId: asset.asset_id,
    // Animation is a renderer capability, not a marketing flag. It becomes
    // true only when a supported temporal node exists in the exact recipe.
    animated: false,
    fidelity: asset.graph_fidelity || '',
    previewSource: asset.preview_source || '',
    recommendedShape: 'sphere',
  }

  const verifiedNativeMaps = asset.asset_type === 'UnrealMaterialInstance'
    ? nativePreviewMaps(nativePreview)
    : null
  if (verifiedNativeMaps) {
    return {
      ...base,
      mode: 'pbr_maps',
      fidelityLabel: `Unreal natif · cartes vérifiées ${nativePreview.maxResolution || 1024}px`,
      channels: [
        { key: 'MP_BaseColor', label: OUTPUT_LABELS.MP_BaseColor, detail: 'sRGB' },
        { key: 'MP_Normal', label: OUTPUT_LABELS.MP_Normal, detail: 'Linéaire' },
        { key: 'MP_AmbientOcclusion', label: OUTPUT_LABELS.MP_AmbientOcclusion, detail: 'ORM · canal R' },
        { key: 'MP_Roughness', label: OUTPUT_LABELS.MP_Roughness, detail: 'ORM · canal G' },
        { key: 'MP_Metallic', label: OUTPUT_LABELS.MP_Metallic, detail: 'ORM · canal B' },
      ],
      maps: verifiedNativeMaps,
      material: nativePreview.material,
      normalScale: nativePreview.normalConvention === 'UNREAL_DIRECTX' ? [1, -1] : 1,
      previewProvenance: 'unreal_native_verified_maps',
      revision: nativePreview.revision || '',
      uvScale: 1,
    }
  }

  // A rendered sphere may be the best catalogue thumbnail without being the
  // runtime preview. Valid MaterialRecipe graphs must keep the same live
  // renderer as every other recipe; the capture remains their safe fallback.
  if (asset.asset_type === 'UnrealMaterialInstance'
    || (!recipe && asset.preview_kind === 'rendered_sphere')) {
    return {
      ...base,
      mode: 'rendered_capture',
      fidelityLabel: 'Rendu source Unreal',
      channels: [],
    }
  }

  if (!recipe) {
    return {
      ...base,
      mode: asset.preview_source ? 'texture_reference' : 'solid_parameters',
      fidelityLabel: asset.preview_source ? 'Texture de référence' : 'Paramètres de référence',
      channels: [],
      material: {
        baseColor: hexToRgba(asset.preview_color, [0.18, 0.25, 0.33, 1]),
        emissiveColor: [0, 0, 0, 1],
        emissiveIntensity: 0,
        metalness: 0.15,
        roughness: 0.35,
        specularIntensity: 0.5,
      },
    }
  }

  const maps = buildPbrMaps(recipe)
  const material = materialParameters(recipe)
  const hasMotion = (recipe.nodes || []).some((node) => ['Panner', 'Rotator', 'Time', 'Sine'].includes(node.kind))

  if (hasMotion) {
    if (!validateShaderGraph(recipe)) {
      return {
        ...base,
        mode: asset.preview_source ? 'rendered_capture' : 'unsupported',
        fidelityLabel: 'Capture de référence',
        channels: visibleChannels(recipe, maps),
        material,
        unsupportedReason: 'Le graphe contient un nœud non pris en charge par le renderer contrôlé.',
      }
    }
    return {
      ...base,
      animated: true,
      mode: 'shader_recipe',
      fidelityLabel: 'Recette animée · temps réel',
      channels: visibleChannels(recipe, maps),
      material,
      graph: shaderGraph(recipe),
    }
  }

  if (maps.baseColor && maps.normal && maps.orm) {
    return {
      ...base,
      mode: 'pbr_maps',
      fidelityLabel: maps.emissive ? 'PBR + émission · cartes exactes' : 'PBR · cartes exactes',
      channels: visibleChannels(recipe, maps),
      maps,
      material,
      uvScale: 1,
      normalScale: 1,
    }
  }

  if (!(recipe.textures || []).length) {
    return {
      ...base,
      mode: 'solid_parameters',
      fidelityLabel: 'Paramètres matériau exacts',
      channels: visibleChannels(recipe, maps),
      material,
    }
  }

  return {
    ...base,
    mode: 'texture_reference',
    fidelityLabel: 'Texture de référence',
    channels: visibleChannels(recipe, maps),
    maps,
    material,
  }
}

export const MATERIAL_PREVIEW_SCHEMA_VERSION = PREVIEW_SCHEMA_VERSION
