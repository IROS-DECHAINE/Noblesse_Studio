export const EDITOR_APP_TOOLSET = 'EditorToolset.EditorAppToolset'
export const MATERIAL_TOOLSET = 'editor_toolset.toolsets.material.MaterialTools'
export const OBJECT_TOOLSET = 'editor_toolset.toolsets.object.ObjectTools'
export const TEXTURE_TOOLSET = 'editor_toolset.toolsets.texture.TextureTools'
export const ASSET_TOOLSET = 'editor_toolset.toolsets.asset.AssetTools'
export const STATIC_MESH_TOOLSET = 'editor_toolset.toolsets.static_mesh.StaticMeshTools'

export const MATERIAL_RECIPE_REQUIREMENTS = Object.freeze({
  [EDITOR_APP_TOOLSET]: ['GetContentBrowserPath'],
  [TEXTURE_TOOLSET]: ['import_file', 'get_size'],
  [MATERIAL_TOOLSET]: [
    'get_expressions',
    'create_material',
    'add_expression',
    'connect_expressions',
    'connect_to_output',
    'layout_expressions',
    'recompile',
    'get_property_input',
  ],
  [OBJECT_TOOLSET]: ['list_properties', 'get_properties', 'set_properties'],
  [ASSET_TOOLSET]: ['exists', 'save_assets', 'is_dirty'],
})

export const SOUND_HANDOFF_REQUIREMENTS = Object.freeze({
  [EDITOR_APP_TOOLSET]: ['GetContentBrowserPath', 'SetContentBrowserPath'],
  [ASSET_TOOLSET]: ['create_folder'],
})

export const STATIC_MESH_REQUIREMENTS = Object.freeze({
  ...MATERIAL_RECIPE_REQUIREMENTS,
  [STATIC_MESH_TOOLSET]: [
    'import_file',
    'get_bounds',
    'get_triangle_count',
    'get_material_slots',
    'get_material',
    'set_material',
  ],
})

export const summarizeTransferCapabilities = (toolsets = []) => {
  const available = new Set(toolsets)
  return {
    materialRecipe: Object.keys(MATERIAL_RECIPE_REQUIREMENTS).every((name) => available.has(name)),
    soundHandoff: Object.keys(SOUND_HANDOFF_REQUIREMENTS).every((name) => available.has(name)),
    staticMesh: Object.keys(STATIC_MESH_REQUIREMENTS).every((name) => available.has(name)),
    nativeUassetMigration: false,
  }
}
