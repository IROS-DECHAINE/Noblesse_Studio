import { UefnMcpClient } from './uefnMcpClient.mjs'
import {
  ASSET_TOOLSET,
  EDITOR_APP_TOOLSET,
  MATERIAL_RECIPE_REQUIREMENTS,
  MATERIAL_TOOLSET,
  OBJECT_TOOLSET,
  TEXTURE_TOOLSET,
} from './uefnTransferContract.mjs'
import { loadRecipe, resolveVaultSource, validateVaultIntegrity, writeInstallReceipt } from './vaultService.mjs'

const MATERIAL_TOOLS = MATERIAL_TOOLSET
const OBJECT_TOOLS = OBJECT_TOOLSET
const TEXTURE_TOOLS = TEXTURE_TOOLSET
const ASSET_TOOLS = ASSET_TOOLSET
const EDITOR_APP = EDITOR_APP_TOOLSET
const SAFE_UNREAL_NAME = /^[A-Za-z0-9_]+$/

const colorFromHex = (value) => {
  const raw = value.replace(/^#/, '')
  if (!/^[0-9a-f]{8}$/i.test(raw)) throw new Error(`Couleur invalide dans la recette : ${value}`)
  const values = raw.match(/../g).map((part) => Number.parseInt(part, 16) / 255)
  return { r: values[0], g: values[1], b: values[2], a: values[3] }
}

const outputPin = (pin) => pin === 'Output' ? '' : pin
const isPowerOfTwo = (value) => Number.isSafeInteger(value) && value > 0 && (value & (value - 1)) === 0
const hasPowerOfTwoDimensions = (size) => isPowerOfTwo(size.x) && isPowerOfTwo(size.y)
const normalizedToken = (value) => String(value ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase()

const parseJsonObject = (value, label) => {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
    return parsed
  } catch {
    throw new Error(`UEFN a renvoyé des propriétés invalides pour ${label}`)
  }
}

const propertyMap = (schema) => new Map(Object.keys(schema).map((key) => [normalizedToken(key), key]))

const schemaEnumValues = (schema) => {
  const values = []
  const visit = (value) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value.enum)) values.push(...value.enum)
    if (Object.hasOwn(value, 'const')) values.push(value.const)
    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') visit(child)
    }
  }
  visit(schema)
  return values
}

const enumValue = (schema, candidates) => {
  const advertised = schemaEnumValues(schema)
  for (const candidate of candidates) {
    const found = advertised.find((value) => normalizedToken(value) === normalizedToken(candidate))
    if (found !== undefined) return found
  }
  return candidates[0]
}

const refPathOf = (value) => {
  if (typeof value === 'string' && value.startsWith('/')) return value
  if (value && typeof value === 'object' && typeof value.refPath === 'string') return value.refPath
  return ''
}

const propertyMatches = (actual, expected) => {
  const expectedRef = refPathOf(expected)
  if (expectedRef) return refPathOf(actual) === expectedRef
  if (typeof expected === 'string') return normalizedToken(actual) === normalizedToken(expected)
  return Object.is(actual, expected)
}

const readPropertySchema = async (mcp, instanceRef) => {
  const schemaText = await mcp.call(OBJECT_TOOLS, 'list_properties', { instance: { refPath: instanceRef } })
  return parseJsonObject(schemaText, instanceRef)
}

const readProperties = async (mcp, instanceRef, properties) => {
  const payload = await mcp.call(OBJECT_TOOLS, 'get_properties', {
    instance: { refPath: instanceRef },
    properties,
  })
  return parseJsonObject(payload, instanceRef)
}

const setSupportedProperties = async (
  mcp,
  expressionRef,
  desired,
  { requiredKeys = [], verifyKeys = [], schema: providedSchema = null } = {},
) => {
  const schema = providedSchema || await readPropertySchema(mcp, expressionRef)
  const available = propertyMap(schema)
  const requiredMissing = requiredKeys.filter((key) => !available.has(normalizedToken(key)))
  if (requiredMissing.length) {
    throw new Error(`UEFN ne permet pas de régler ${requiredMissing.join(', ')} sur ${expressionRef}`)
  }
  const values = Object.fromEntries(
    Object.entries(desired)
      .filter(([key]) => available.has(normalizedToken(key)))
      .map(([key, value]) => [available.get(normalizedToken(key)), value]),
  )
  if (!Object.keys(values).length) return
  const success = await mcp.call(OBJECT_TOOLS, 'set_properties', {
    instance: { refPath: expressionRef },
    values: JSON.stringify(values),
  })
  if (success !== true) throw new Error(`UEFN n’a pas appliqué les propriétés de ${expressionRef}`)

  const verifiedNames = verifyKeys
    .filter((key) => available.has(normalizedToken(key)))
    .map((key) => available.get(normalizedToken(key)))
  if (!verifiedNames.length) return
  const actual = await readProperties(mcp, expressionRef, verifiedNames)
  const actualKeys = propertyMap(actual)
  for (const propertyName of verifiedNames) {
    const actualName = actualKeys.get(normalizedToken(propertyName))
    if (!actualName || !propertyMatches(actual[actualName], values[propertyName])) {
      throw new Error(`UEFN n’a pas conservé la propriété ${propertyName} sur ${expressionRef}`)
    }
  }
}

const normalizeProperties = (properties, textureRefs) => {
  const result = { ...properties }
  if (result.DefaultValueHex) {
    result.DefaultValue = colorFromHex(result.DefaultValueHex)
    delete result.DefaultValueHex
  }
  if (Array.isArray(result.DefaultValue) && result.DefaultValue.length === 4) {
    const [r, g, b, a] = result.DefaultValue
    result.DefaultValue = { r, g, b, a }
  }
  if (typeof result.Texture === 'string') {
    const refPath = textureRefs.get(result.Texture)
    if (!refPath) throw new Error(`La recette référence une texture inconnue : ${result.Texture}`)
    result.Texture = { refPath }
  }
  return result
}

const assertRecipe = (recipe) => {
  if (!recipe || typeof recipe !== 'object') throw new Error('Recette UEFN invalide')
  if (!SAFE_UNREAL_NAME.test(recipe.assetName || '')) throw new Error('Nom de matériau UEFN invalide dans la recette')
  if (!Array.isArray(recipe.nodes) || !recipe.nodes.length) throw new Error('La recette UEFN ne contient aucun nœud')
  if (!Array.isArray(recipe.outputs) || !recipe.outputs.length) throw new Error('La recette UEFN ne contient aucune sortie')

  const textureNames = new Set()
  for (const texture of recipe.textures || []) {
    if (!SAFE_UNREAL_NAME.test(texture.assetName || '')) throw new Error('Nom de texture UEFN invalide dans la recette')
    if (textureNames.has(texture.assetName)) throw new Error(`Texture dupliquée dans la recette : ${texture.assetName}`)
    if (!Number.isSafeInteger(texture.width) || texture.width <= 0 || !Number.isSafeInteger(texture.height) || texture.height <= 0) {
      throw new Error(`Dimensions invalides pour ${texture.assetName}`)
    }
    textureNames.add(texture.assetName)
  }

  const nodeIds = new Set()
  for (const node of recipe.nodes) {
    if (!node.id || nodeIds.has(node.id)) throw new Error(`Identifiant de nœud invalide ou dupliqué : ${node.id || 'absent'}`)
    nodeIds.add(node.id)
    const textureName = node.properties?.Texture
    if (typeof textureName === 'string' && !textureNames.has(textureName)) {
      throw new Error(`Le nœud ${node.id} référence une texture absente : ${textureName}`)
    }
  }
  for (const connection of recipe.connections || []) {
    if (!nodeIds.has(connection.fromNode) || !nodeIds.has(connection.toNode)) {
      throw new Error('La recette UEFN contient une connexion vers un nœud absent')
    }
  }
  for (const output of recipe.outputs) {
    if (!nodeIds.has(output.node)) throw new Error(`La sortie ${output.property} référence un nœud absent`)
  }
}

const textureConformanceSettings = (schema) => {
  const available = propertyMap(schema)
  const powerKey = available.get('poweroftwomode')
  const mipKey = available.get('mipgensettings')
  const neverStreamKey = available.get('neverstream')
  if (!powerKey || !mipKey || !neverStreamKey) {
    throw new Error('Cette version d’UEFN ne permet pas de rendre automatiquement cette texture conforme')
  }
  return {
    [powerKey]: enumValue(schema[powerKey], ['StretchToPowerOfTwo', 'STRETCH_TO_POWER_OF_TWO', 3]),
    [mipKey]: enumValue(schema[mipKey], ['TMGS_FromTextureGroup', 'FromTextureGroup']),
    [neverStreamKey]: false,
  }
}

const conformTextureForUefn = async (mcp, textureRef, size) => {
  if (hasPowerOfTwoDimensions(size)) return null
  const schema = await readPropertySchema(mcp, textureRef)
  const settings = textureConformanceSettings(schema)
  const keys = Object.keys(settings)
  await setSupportedProperties(mcp, textureRef, settings, {
    requiredKeys: keys,
    verifyKeys: keys,
    schema,
  })
  return {
    sourceWidth: size.x,
    sourceHeight: size.y,
    policy: 'STRETCH_TO_POWER_OF_TWO',
  }
}

const openMountName = (contentBrowserPath) => contentBrowserPath.split('/').filter(Boolean)[0] || ''

const assertOutputConnections = async (mcp, materialRef, outputs) => {
  for (const output of outputs) {
    const source = await mcp.call(MATERIAL_TOOLS, 'get_property_input', {
      material: { refPath: materialRef },
      material_property: output.property,
    })
    if (!source?.expression?.refPath) throw new Error(`Sortie ${output.property} non connectée`)
  }
}

const assertTextureBindings = async (mcp, expressions, recipe, textureRefs) => {
  const expected = recipe.nodes
    .map((node) => node.properties?.Texture)
    .filter((value) => typeof value === 'string')
    .map((name) => textureRefs.get(name))
    .toSorted()
  const actual = []
  for (const expression of expressions) {
    const expressionRef = expression?.refPath
    if (!expressionRef) continue
    const schema = await readPropertySchema(mcp, expressionRef)
    const textureKey = propertyMap(schema).get('texture')
    if (!textureKey) continue
    const properties = await readProperties(mcp, expressionRef, [textureKey])
    const actualKey = propertyMap(properties).get(normalizedToken(textureKey))
    const refPath = actualKey ? refPathOf(properties[actualKey]) : ''
    if (!refPath) throw new Error(`Le nœud ${expressionRef} a perdu sa texture`)
    actual.push(refPath)
  }
  if (actual.toSorted().join('\n') !== expected.join('\n')) {
    throw new Error('Les textures reliées au matériau ne correspondent pas à la recette')
  }
}

const validateMaterial = async (mcp, materialRef, recipe, textureRefs) => {
  await mcp.call(MATERIAL_TOOLS, 'recompile', { material_or_function: { refPath: materialRef } })
  const expressions = await mcp.call(MATERIAL_TOOLS, 'get_expressions', {
    material_or_function: { refPath: materialRef },
  })
  if (!Array.isArray(expressions) || expressions.length !== recipe.nodes.length) {
    throw new Error('Le graphe importé est incomplet')
  }
  await assertTextureBindings(mcp, expressions, recipe, textureRefs)
  await assertOutputConnections(mcp, materialRef, recipe.outputs)
  return expressions
}

const targetRefsFor = (materialRef, textureFolder, recipe) => {
  const textures = new Map((recipe.textures || []).map((texture) => [
    texture.assetName,
    `${textureFolder}/${texture.assetName}.${texture.assetName}`,
  ]))
  return { material: materialRef, textures }
}

const detectExistingInstallation = async (mcp, targets) => {
  const entries = [['material', targets.material], ...targets.textures.entries()]
  const states = await Promise.all(entries.map(async ([name, refPath]) => ({
    name,
    refPath,
    exists: await mcp.call(ASSET_TOOLS, 'exists', { path: refPath }),
  })))
  const existing = states.filter((state) => state.exists)
  if (!existing.length) return 'NONE'
  if (existing.length === states.length) return 'COMPLETE'
  const names = existing.map((state) => state.name).join(', ')
  throw new Error(`Installation UEFN partielle détectée (${names}). Aucun fichier n’a été écrasé.`)
}

export const createUefnInstaller = ({
  clientFactory = (endpoint) => new UefnMcpClient(endpoint),
  integrityValidator = validateVaultIntegrity,
  recipeLoader = loadRecipe,
  sourceResolver = resolveVaultSource,
  receiptWriter = writeInstallReceipt,
  clock = () => new Date(),
} = {}) => async ({ assetId, projectId }, { sessionService } = {}) => {
  const startedAt = Date.now()
  await integrityValidator(assetId)
  const { asset, recipe } = await recipeLoader(assetId)
  assertRecipe(recipe)
  if (!sessionService) throw new Error('Le gestionnaire de sessions UEFN est indisponible')
  const project = await sessionService.resolveActiveSession(projectId)

  const mcp = clientFactory(project.endpoint)
  await mcp.initialize()
  const missingTools = await mcp.missingTools(MATERIAL_RECIPE_REQUIREMENTS)
  if (missingTools.length) {
    throw new Error(`Cette session UEFN ne peut pas installer ce matériau : ${missingTools.join(', ')}`)
  }
  const materialToolDescription = await mcp.describeToolset(MATERIAL_TOOLS)
  const supportsMaterialStatistics = (materialToolDescription.tools || [])
    .some((tool) => String(tool.name).endsWith('.get_statistics'))
  const browserPath = await mcp.call(EDITOR_APP, 'GetContentBrowserPath', {})
  const mount = openMountName(browserPath)
  if (!mount) throw new Error('Impossible d’identifier le projet UEFN ouvert')
  if (mount.toLowerCase() !== project.mount.toLowerCase()) {
    throw new Error(`Le projet choisi est ${project.name}, mais UEFN a actuellement ${mount} ouvert`)
  }

  const packRoot = `/${mount}/NoblesseStudio/${asset.pack_id}`
  const textureFolder = `${packRoot}/Textures`
  const materialFolder = `${packRoot}/Materials`
  const materialRef = `${materialFolder}/${recipe.assetName}.${recipe.assetName}`
  const targets = targetRefsFor(materialRef, textureFolder, recipe)
  const existingState = await detectExistingInstallation(mcp, targets)

  if (existingState === 'COMPLETE') {
    for (const texture of recipe.textures || []) {
      const refPath = targets.textures.get(texture.assetName)
      const size = await mcp.call(TEXTURE_TOOLS, 'get_size', { texture: { refPath } })
      if (size.x !== texture.width || size.y !== texture.height) {
        throw new Error(`La texture existante ${texture.assetName} n’a pas les dimensions attendues`)
      }
      if (!hasPowerOfTwoDimensions(size)) {
        const schema = await readPropertySchema(mcp, refPath)
        const expected = textureConformanceSettings(schema)
        const keys = Object.keys(expected)
        const actual = await readProperties(mcp, refPath, keys)
        const actualKeys = propertyMap(actual)
        for (const key of keys) {
          const actualKey = actualKeys.get(normalizedToken(key))
          if (!actualKey || !propertyMatches(actual[actualKey], expected[key])) {
            throw new Error(`La texture existante ${texture.assetName} n’est pas conforme à UEFN`)
          }
        }
      }
    }
    const expressions = await validateMaterial(mcp, materialRef, recipe, targets.textures)
    return {
      accepted: true,
      mode: 'ALREADY_INSTALLED',
      assetId,
      project: project.name,
      targetPath: materialRef,
      expressionCount: expressions.length,
      durationMs: Date.now() - startedAt,
    }
  }

  const textureRefs = new Map()
  const textureAdjustments = []
  for (const texture of recipe.textures || []) {
    const sourceFile = sourceResolver(texture.source)
    const imported = await mcp.call(TEXTURE_TOOLS, 'import_file', {
      folder_path: textureFolder,
      asset_name: texture.assetName,
      source_file: sourceFile,
    })
    if (!Array.isArray(imported) || imported.length !== 1 || !imported[0]?.refPath) {
      throw new Error(`UEFN n’a pas importé correctement ${texture.assetName}`)
    }
    const refPath = imported[0].refPath
    if (refPath !== targets.textures.get(texture.assetName)) {
      throw new Error(`UEFN a importé ${texture.assetName} dans une destination inattendue`)
    }
    const size = await mcp.call(TEXTURE_TOOLS, 'get_size', { texture: { refPath } })
    if (size.x !== texture.width || size.y !== texture.height) {
      throw new Error(`Texture ${texture.assetName} importée avec une taille incorrecte`)
    }
    const adjustment = await conformTextureForUefn(mcp, refPath, size)
    if (adjustment) textureAdjustments.push({ assetName: texture.assetName, ...adjustment })
    textureRefs.set(texture.assetName, refPath)
  }

  const material = await mcp.call(MATERIAL_TOOLS, 'create_material', {
    folder_path: materialFolder,
    asset_name: recipe.assetName,
  })
  if (material.refPath !== materialRef) throw new Error('UEFN a créé le matériau dans une destination inattendue')

  const expressionRefs = new Map()
  for (const node of recipe.nodes) {
    const expression = await mcp.call(MATERIAL_TOOLS, 'add_expression', {
      material_or_function: { refPath: materialRef },
      expression_class: { refPath: node.classPath },
      x: node.x,
      y: node.y,
    })
    expressionRefs.set(node.id, expression.refPath)
    const properties = normalizeProperties(node.properties || {}, textureRefs)
    const requiresTexture = Object.hasOwn(properties, 'Texture')
    await setSupportedProperties(mcp, expression.refPath, properties, {
      requiredKeys: requiresTexture ? ['Texture'] : [],
      verifyKeys: requiresTexture ? ['Texture'] : [],
    })
  }

  for (const connection of recipe.connections || []) {
    const toPin = connection.toPin === 'Input' && expressionRefs.get(connection.toNode).includes(':MaterialExpressionSine_')
      ? 'None'
      : connection.toPin
    await mcp.call(MATERIAL_TOOLS, 'connect_expressions', {
      from_expression: { refPath: expressionRefs.get(connection.fromNode) },
      from_output_name: outputPin(connection.fromPin),
      to_expression: { refPath: expressionRefs.get(connection.toNode) },
      to_input_name: toPin,
    })
  }

  for (const output of recipe.outputs) {
    await mcp.call(MATERIAL_TOOLS, 'connect_to_output', {
      expression: { refPath: expressionRefs.get(output.node) },
      output_name: outputPin(output.pin),
      material_property: output.property,
    })
  }

  await mcp.call(MATERIAL_TOOLS, 'layout_expressions', { material_or_function: { refPath: materialRef } })
  const expressions = await validateMaterial(mcp, materialRef, recipe, textureRefs)
  const stats = supportsMaterialStatistics
    ? await mcp.call(MATERIAL_TOOLS, 'get_statistics', { material: { refPath: materialRef } })
    : null
  const assetsToSave = [...textureRefs.values(), materialRef]
  const saved = await mcp.call(ASSET_TOOLS, 'save_assets', { asset_paths: assetsToSave })
  if (saved !== true) throw new Error('UEFN n’a pas sauvegardé tous les assets installés')
  for (const assetPath of assetsToSave) {
    const dirty = await mcp.call(ASSET_TOOLS, 'is_dirty', { asset_path: assetPath })
    if (dirty) throw new Error(`L’asset ${assetPath} reste non sauvegardé après installation`)
  }

  const receipt = {
    schemaVersion: 2,
    status: 'PASS',
    mode: 'INSTALLED_AND_VERIFIED',
    installer: 'NOBLESSE_STUDIO_UEFN_RECIPE_V2',
    assetId,
    assetName: recipe.assetName,
    packId: asset.pack_id,
    project: project.name,
    projectPath: project.path,
    targetPath: materialRef,
    textureCount: textureRefs.size,
    textureAdjustments,
    expressionCount: expressions.length,
    stats,
    validation: {
      recipePreflight: true,
      texturePropertiesReadBack: true,
      materialTextureBindingsReadBack: true,
      materialCompile: true,
      materialOutputsConnected: true,
      savedStateReadBack: true,
    },
    saved: true,
    installedAt: clock().toISOString(),
    durationMs: Date.now() - startedAt,
  }
  const receiptPath = await receiptWriter(receipt)
  return { accepted: true, ...receipt, receiptPath }
}

export const installVaultAsset = createUefnInstaller()

export const uefnInstallerInternals = {
  assertRecipe,
  hasPowerOfTwoDimensions,
  normalizeProperties,
  textureConformanceSettings,
}
