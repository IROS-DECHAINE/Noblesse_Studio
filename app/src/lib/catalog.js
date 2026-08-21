import { publicAsset, vaultPreview } from './desktopApi.js'

export const categoryFor = (asset) => {
  if (asset.asset_type === 'Material') return 'Matériaux'
  if (asset.asset_type === 'Texture2D') return 'Textures'
  if (/niagara|vfx/i.test(asset.asset_type)) return 'VFX'
  if (/mesh/i.test(asset.asset_type)) return 'Meshes'
  if (/audio|sound/i.test(asset.asset_type)) return 'Audio'
  return 'Autres'
}

export const familyFromNotes = (notes = '') => {
  const match = notes.match(/(?:^|;)\s*family=([^;]+)/i)
  return match?.[1]?.trim() || ''
}

export const formatAssetName = (value = '') => value
  .replace(/^T_PB_BaseClassic_/, '')
  .replace(/^T_WR_DM_/, '')
  .replace(/^M_PB_/, '')
  .replace(/_V0?1$/, '')
  .replace(/_/g, ' ')

export const textureRole = (name = '') => {
  if (/_BC(?:_|$)/.test(name)) return 'Base Color'
  if (/_N(?:_|$)/.test(name)) return 'Normal'
  if (/_ORM(?:_|$)/.test(name)) return 'ORM'
  if (/_EM(?:_|$)/.test(name)) return 'Emissive'
  if (/_RGBA(?:_|$)/.test(name)) return 'RGBA'
  return ''
}

export const thumbnailFor = (asset) => {
  if (asset.preview_source || asset.preview_asset) return vaultPreview(asset)
  const name = asset.display_name || ''
  if (name === 'M_PB_BaseClassic_Master_V01') return publicAsset('assets/previews/base-classic-master.png')
  if (name === 'M_PB_DarkMeteor_Master_V01') return publicAsset('assets/previews/dark-meteor-master.png')
  if (name.includes('DarkMeteor') || name.startsWith('T_WR_DM_')) {
    if (name.includes('Normal') || /_N_/.test(name)) return publicAsset('assets/textures/dark-meteor-normal.png')
    if (name.includes('ORM') || /_ORM_/.test(name)) return publicAsset('assets/textures/dark-meteor-orm.png')
    if (name.includes('DecalGraffiti')) return publicAsset('assets/textures/dark-meteor-decal.png')
    return publicAsset('assets/textures/dark-meteor-base.png')
  }

  const family = familyFromNotes(asset.notes) || name.match(/BaseClassic_([^_]+)/)?.[1]
  const lookup = {
    ArtDeco: 'art-deco',
    Brick: 'brick',
    Concrete: 'concrete',
    Marble: 'marble',
    Oak: 'oak',
    Slate: 'slate',
    SmokedChrome: 'smoked-chrome',
    Steel: 'steel',
    Terrazzo: 'terrazzo',
    Travertine: 'travertine',
  }
  return publicAsset(`assets/textures/${lookup[family] || 'brick'}.png`)
}

export const filterAssets = (assets, { query = '', category = 'Tous' }) => {
  const needle = query.trim().toLocaleLowerCase('fr')
  return assets.filter((asset) => {
    if (category !== 'Tous' && categoryFor(asset) !== category) return false
    if (!needle) return true
    const haystack = [
      asset.display_name,
      asset.asset_id,
      asset.asset_type,
      asset.pack_id,
      asset.provenance,
      asset.notes,
    ].join(' ').toLocaleLowerCase('fr')
    return haystack.includes(needle)
  })
}

const familyMeta = {
  ArtDeco: { name: 'Art déco', category: 'Maison', order: 7 },
  Brick: { name: 'Brique classique', category: 'Maison', order: 1 },
  Concrete: { name: 'Béton clair', category: 'Maison', order: 4 },
  DarkMeteor: { name: 'Matière noire', category: 'Pierre', order: 6 },
  Marble: { name: 'Marbre blanc', category: 'Maison', order: 3 },
  Oak: { name: 'Bois naturel', category: 'Bois', order: 2 },
  Slate: { name: 'Ardoise', category: 'Pierre', order: 8 },
  SmokedChrome: { name: 'Métal fumé', category: 'Métal', order: 5 },
  Steel: { name: 'Acier', category: 'Métal', order: 9 },
  Terrazzo: { name: 'Terrazzo', category: 'Maison', order: 10 },
  Travertine: { name: 'Travertin', category: 'Pierre', order: 11 },
}

const variantFromName = (name = '') => name.match(/_(C|F|W)_(?:BC|N|ORM)$/)?.[1] || ''

const architecturalVariantLabels = {
  C: 'Plafond',
  F: 'Sol',
  W: 'Mur',
}

const displayVariantLabel = (variantId = '', fallback = '') => architecturalVariantLabels[variantId] || fallback || variantId

export const surfaceCategories = ['Tout', 'Matières', 'VFX', 'Assets', 'Sons', 'Matières animées']
export const platformFilters = ['Toutes', 'UEFN', 'Unreal', 'Roblox']

export const buildSurfaceCatalog = (assets = []) => {
  const uniqueAssets = [...new Map(assets.map((asset) => [asset.asset_id, asset])).values()]
  const textures = uniqueAssets.filter((asset) => asset.asset_type === 'Texture2D')
  const masters = uniqueAssets.filter((asset) => asset.asset_type === 'Material')
  const recipes = uniqueAssets.filter((asset) => asset.asset_type === 'MaterialRecipe')
  const nativeUnrealMaterials = uniqueAssets.filter((asset) => asset.asset_type === 'UnrealMaterialInstance')
  // MaterialReference entries are audit/provenance records. They deliberately
  // stay in the vault index, but are not user-facing assets: they have no
  // portable recipe and no trustworthy preview. Showing them in the Coffre
  // produced the broken "Parent Base" cards that could not be installed.
  const surfaceAssets = [...recipes, ...nativeUnrealMaterials]
  const baseMaster = masters.find((asset) => asset.display_name === 'M_PB_BaseClassic_Master_V01')
  const darkMaster = masters.find((asset) => asset.display_name === 'M_PB_DarkMeteor_Master_V01')
  const grouped = new Map()

  textures.forEach((texture) => {
    const family = familyFromNotes(texture.notes) || texture.display_name.match(/BaseClassic_([^_]+)/)?.[1] || (texture.display_name.includes('DarkMeteor') ? 'DarkMeteor' : '')
    if (!family) return
    if (!grouped.has(family)) grouped.set(family, [])
    grouped.get(family).push(texture)
  })

  const legacySurfaces = [...grouped.entries()].map(([family, familyTextures]) => {
    const meta = familyMeta[family] || { name: family, category: 'Maison', order: 99 }
    const master = family === 'DarkMeteor' ? darkMaster : baseMaster
    const variants = [...new Set(familyTextures.map((asset) => variantFromName(asset.display_name)).filter(Boolean))]
    const roles = [...new Set(familyTextures.map((asset) => textureRole(asset.display_name)).filter(Boolean))]
    const baseColor = familyTextures.find((asset) => textureRole(asset.display_name) === 'Base Color') || familyTextures[0]
    const animated = [master?.notes, ...familyTextures.map((asset) => asset.notes)].some((value) => /\banimat(?:ed|ion)|panner|time[-_ ]?node|motion\b/i.test(value || ''))
    const variantOptions = (variants.length ? variants : ['Standard']).map((variant) => {
      const texture = familyTextures.find((asset) => variant === 'Standard' || (variantFromName(asset.display_name) === variant && textureRole(asset.display_name) === 'Base Color'))
      return {
        id: variant,
        label: displayVariantLabel(variant, variant),
        preview: texture ? thumbnailFor(texture) : thumbnailFor(baseColor),
      }
    })

    return {
      id: `surface-${family.toLocaleLowerCase('fr')}`,
      family,
      name: meta.name,
      category: meta.category,
      order: meta.order,
      animated,
      variants: variants.length ? variants : ['Standard'],
      variantOptions,
      textureRoles: roles,
      technicalMaps: familyTextures.length,
      preview: thumbnailFor(baseColor),
      sourcePack: familyTextures[0]?.pack_id || master?.pack_id || '',
      sourceProject: familyTextures[0]?.source_project || master?.source_project || '',
      provenance: familyTextures[0]?.provenance || master?.provenance || '',
      status: familyTextures.every((asset) => asset.status === 'TRANSFERRED') ? 'TRANSFERRED' : 'DISCOVERED',
      platforms: ['UEFN'],
      uefnVersion: familyTextures[0]?.uefn_version || master?.uefn_version || '',
      targetPath: master?.target_path || familyTextures[0]?.target_path || '',
      installAssetId: master?.asset_id || familyTextures[0]?.asset_id || '',
      packVersion: master?.pack_version || familyTextures[0]?.pack_version || '',
      installable: false,
      assets: familyTextures,
    }
  })

  const coveredFamilies = new Set(recipes.map((asset) => asset.source_family).filter(Boolean))
  const groupedRecipes = new Map()
  surfaceAssets.forEach((asset) => {
    const groupId = asset.surface_group || asset.asset_id
    if (!groupedRecipes.has(groupId)) groupedRecipes.set(groupId, [])
    groupedRecipes.get(groupId).push(asset)
  })

  const recipeSurfaces = [...groupedRecipes.entries()].map(([groupId, groupAssets]) => {
    const ordered = [...groupAssets].sort((left, right) => Number(left.order || 999) - Number(right.order || 999))
    const asset = ordered[0]
    const sourceMeta = groupId.startsWith('BaseClassic:') ? familyMeta[asset.source_family] : null
    const variantOptions = ordered.map((variant) => ({
      assetId: variant.asset_id,
      id: variant.variant_id || 'Standard',
      label: displayVariantLabel(variant.variant_id, variant.variant_label || 'Standard'),
      preview: vaultPreview(variant),
      previewKind: variant.preview_kind || '',
      previewColor: variant.preview_color || asset.preview_color || '#25364b',
      animated: Boolean(variant.animated),
      technicalMaps: Number(variant.technical_maps) || 0,
      installAssetId: ['MaterialRecipe', 'UnrealMaterialInstance'].includes(variant.asset_type) ? variant.asset_id : '',
      installMode: variant.install_mode || (variant.asset_type === 'MaterialRecipe' ? 'UEFN_RECIPE' : ''),
      displayName: variant.display_name,
    }))
    return {
      id: `surface-${groupId.toLocaleLowerCase('fr').replace(/[^a-z0-9]+/g, '-')}`,
      family: groupId,
      name: sourceMeta?.name || asset.group_label || asset.label || formatAssetName(asset.display_name),
      category: sourceMeta?.category || asset.category || 'VFX',
      order: Number(asset.order) || 999,
      animated: ordered.some((item) => Boolean(item.animated)),
      variants: variantOptions.map((variant) => variant.label),
      variantOptions,
      // The inspector derives channels from PreviewDescriptorV1. Inventing a
      // fixed list here made the UI claim maps that some materials do not own.
      textureRoles: [],
      technicalMaps: Math.max(...ordered.map((item) => Number(item.technical_maps) || 0)),
      preview: variantOptions[0]?.preview || '',
      previewKind: variantOptions[0]?.previewKind || 'texture_map',
      previewColor: variantOptions[0]?.previewColor || '#25364b',
      sourcePack: asset.pack_id,
      sourceProject: asset.source_project,
      provenance: asset.provenance,
      status: ordered.every((item) => item.status === 'READY_IN_APP') ? 'READY_IN_APP' : asset.status,
      platforms: asset.platforms || ['UEFN'],
      uefnVersion: asset.uefn_version || '',
      targetPath: '',
      installAssetId: ['MaterialRecipe', 'UnrealMaterialInstance'].includes(asset.asset_type) ? asset.asset_id : '',
      installMode: asset.install_mode || (asset.asset_type === 'MaterialRecipe' ? 'UEFN_RECIPE' : ''),
      packVersion: asset.pack_version,
      installable: ordered.every((item) => (
        item.status === 'READY_IN_APP'
        && (item.asset_type === 'MaterialRecipe'
          || (item.asset_type === 'UnrealMaterialInstance' && item.install_mode === 'UNREAL_NATIVE_BUNDLE'))
      )),
      assets: ordered,
    }
  })

  return [...legacySurfaces.filter((surface) => !coveredFamilies.has(surface.family)), ...recipeSurfaces]
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name, 'fr'))
}

export const filterSurfaces = (surfaces, { query = '', category = 'Tout', platform = 'Toutes' } = {}) => {
  const needle = query.trim().toLocaleLowerCase('fr')
  return surfaces.filter((surface) => {
    if (['Matières animées', 'Animées'].includes(category) && !surface.animated) return false
    if (category === 'Matières' && (surface.animated || ['VFX', 'Audio', 'Asset', 'Assets', 'Meshes'].includes(surface.category))) return false
    if (category === 'VFX' && surface.category !== 'VFX') return false
    if (category === 'Assets' && !['Asset', 'Assets', 'Meshes'].includes(surface.category)) return false
    if (category === 'Sons' && !['Audio', 'Son', 'Sons'].includes(surface.category)) return false
    if (!['Tout', 'Matières', 'VFX', 'Assets', 'Sons', 'Matières animées', 'Animées'].includes(category) && surface.category !== category) return false
    if (platform !== 'Toutes' && !surface.platforms.includes(platform)) return false
    if (!needle) return true
    return [surface.name, surface.family, surface.category, surface.sourcePack]
      .join(' ')
      .toLocaleLowerCase('fr')
      .includes(needle)
  })
}
