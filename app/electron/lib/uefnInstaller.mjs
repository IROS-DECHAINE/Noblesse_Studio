import path from 'node:path'
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

const colorFromHex = (value) => {
  const raw = value.replace(/^#/, '')
  if (!/^[0-9a-f]{8}$/i.test(raw)) throw new Error(`Couleur invalide dans la recette : ${value}`)
  const values = raw.match(/../g).map((part) => Number.parseInt(part, 16) / 255)
  return { r: values[0], g: values[1], b: values[2], a: values[3] }
}

const outputPin = (pin) => pin === 'Output' ? '' : pin

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
  if (typeof result.Texture === 'string') result.Texture = { refPath: textureRefs.get(result.Texture) }
  return result
}

const setSupportedProperties = async (mcp, expressionRef, desired) => {
  const schemaText = await mcp.call(OBJECT_TOOLS, 'list_properties', { instance: { refPath: expressionRef } })
  const schema = JSON.parse(schemaText)
  const available = new Map(Object.keys(schema).map((key) => [key.toLowerCase(), key]))
  const values = Object.fromEntries(
    Object.entries(desired)
      .filter(([key]) => available.has(key.toLowerCase()))
      .map(([key, value]) => [available.get(key.toLowerCase()), value]),
  )
  if (!Object.keys(values).length) return
  const success = await mcp.call(OBJECT_TOOLS, 'set_properties', {
    instance: { refPath: expressionRef },
    values: JSON.stringify(values),
  })
  if (success !== true) throw new Error(`UEFN n’a pas appliqué les propriétés de ${expressionRef}`)
}

const openMountName = (contentBrowserPath) => contentBrowserPath.split('/').filter(Boolean)[0] || ''

export const installVaultAsset = async ({ assetId, projectId }, { sessionService } = {}) => {
  const startedAt = Date.now()
  await validateVaultIntegrity(assetId)
  if (!sessionService) throw new Error('Le gestionnaire de sessions UEFN est indisponible')
  const project = await sessionService.resolveActiveSession(projectId)

  const { asset, recipe } = await loadRecipe(assetId)
  const mcp = new UefnMcpClient(project.endpoint)
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

  try {
    const existing = await mcp.call(MATERIAL_TOOLS, 'get_expressions', {
      material_or_function: { refPath: materialRef },
    })
    if (Array.isArray(existing) && existing.length === recipe.nodes.length) {
      return {
        accepted: true,
        mode: 'ALREADY_INSTALLED',
        assetId,
        project: project.name,
        targetPath: materialRef,
        expressionCount: existing.length,
        durationMs: Date.now() - startedAt,
      }
    }
    throw new Error('Un asset partiel existe déjà à la destination ; installation bloquée pour éviter de l’écraser')
  } catch (error) {
    if (!/not a valid|not valid Object|valid object path|Parameter error/i.test(error.message)) throw error
  }

  const textureRefs = new Map()
  for (const texture of recipe.textures || []) {
    const sourceFile = resolveVaultSource(texture.source)
    const imported = await mcp.call(TEXTURE_TOOLS, 'import_file', {
      folder_path: textureFolder,
      asset_name: texture.assetName,
      source_file: sourceFile,
    })
    const refPath = imported[0].refPath
    const size = await mcp.call(TEXTURE_TOOLS, 'get_size', { texture: { refPath } })
    if (size.x !== texture.width || size.y !== texture.height) {
      throw new Error(`Texture ${texture.assetName} importée avec une taille incorrecte`)
    }
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
    await setSupportedProperties(mcp, expression.refPath, normalizeProperties(node.properties || {}, textureRefs))
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
  await mcp.call(MATERIAL_TOOLS, 'recompile', { material_or_function: { refPath: materialRef } })

  const expressions = await mcp.call(MATERIAL_TOOLS, 'get_expressions', {
    material_or_function: { refPath: materialRef },
  })
  if (expressions.length !== recipe.nodes.length) throw new Error('Le graphe importé est incomplet')
  for (const output of recipe.outputs) {
    const source = await mcp.call(MATERIAL_TOOLS, 'get_property_input', {
      material: { refPath: materialRef },
      material_property: output.property,
    })
    if (!source?.expression?.refPath) throw new Error(`Sortie ${output.property} non connectée`)
  }

  const stats = supportsMaterialStatistics
    ? await mcp.call(MATERIAL_TOOLS, 'get_statistics', { material: { refPath: materialRef } })
    : null
  const assetsToSave = [...textureRefs.values(), materialRef]
  const saved = await mcp.call(ASSET_TOOLS, 'save_assets', { asset_paths: assetsToSave })
  if (saved !== true) throw new Error('UEFN n’a pas sauvegardé tous les assets installés')
  const dirty = await mcp.call(ASSET_TOOLS, 'is_dirty', { asset_path: materialRef })
  if (dirty) throw new Error('Le matériau reste non sauvegardé après installation')

  const receipt = {
    assetId,
    assetName: recipe.assetName,
    packId: asset.pack_id,
    project: project.name,
    projectPath: project.path,
    targetPath: materialRef,
    textureCount: textureRefs.size,
    expressionCount: expressions.length,
    stats,
    saved: true,
    installedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  }
  const receiptPath = await writeInstallReceipt(receipt)
  return { accepted: true, mode: 'INSTALLED_AND_VALIDATED', ...receipt, receiptPath }
}
