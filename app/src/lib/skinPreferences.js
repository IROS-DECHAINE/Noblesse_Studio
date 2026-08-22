export const DEFAULT_SKIN_ID = 'atelier-nocturne'
export const DEFAULT_SKIN_MOTION = 'immersive'

export const SKINS = Object.freeze([
  {
    id: 'atelier-nocturne',
    name: 'Atelier Nocturne',
    eyebrow: 'Signature Noblesse',
    description: 'Graphite brossé, liserés or et accents bleus précis.',
    asset: 'assets/skins/atelier-nocturne-4k.png',
    accent: '#d5ab68',
    fluid: { primary: '#d6aa63', secondary: '#437ee8', accent: '#f2d49a', speed: 0.72, intensity: 0.72 },
  },
  {
    id: 'jade-imperiale',
    name: 'Jade Impériale',
    eyebrow: 'Minéral précieux',
    description: 'Marbre vert profond, veines dorées et lumière émeraude.',
    asset: 'assets/skins/jade-imperiale-4k.png',
    accent: '#5fd5a6',
    fluid: { primary: '#39bd84', secondary: '#c99d49', accent: '#8af0c1', speed: 0.66, intensity: 0.78 },
  },
  {
    id: 'obsidienne-royale',
    name: 'Obsidienne Royale',
    eyebrow: 'Pierre de nuit',
    description: 'Obsidienne noire, éclats bleus et détails or retenus.',
    asset: 'assets/skins/obsidienne-royale-4k.png',
    accent: '#5b91ff',
    fluid: { primary: '#376fd6', secondary: '#c99c50', accent: '#86b4ff', speed: 0.58, intensity: 0.7 },
  },
  {
    id: 'aurore-liquide',
    name: 'Aurore Liquide',
    eyebrow: 'Énergie fluide',
    description: 'Rubans cobalt et cyan sur une profondeur bleu nuit.',
    asset: 'assets/skins/aurore-liquide-4k.png',
    accent: '#53bfff',
    fluid: { primary: '#1e6cf1', secondary: '#35d5ff', accent: '#a3e7ff', speed: 0.88, intensity: 0.92 },
  },
  {
    id: 'titane-fume',
    name: 'Titane Fumé',
    eyebrow: 'Métal contemporain',
    description: 'Titane sombre, reflets acier et signalétique bleu froid.',
    asset: 'assets/skins/titane-fume-4k.png',
    accent: '#9eb6d7',
    fluid: { primary: '#7d9ec7', secondary: '#3f72b5', accent: '#d7e7f7', speed: 0.48, intensity: 0.58 },
  },
  {
    id: 'velours-grenat',
    name: 'Velours Grenat',
    eyebrow: 'Salon impérial',
    description: 'Velours lie-de-vin, profondeur obsidienne et coutures d’or antique.',
    asset: 'assets/skins/velours-grenat-4k.png',
    accent: '#c85470',
    fluid: { primary: '#9e2744', secondary: '#d3a45d', accent: '#f0c6a0', speed: 0.55, intensity: 0.68 },
  },
  {
    id: 'amethyste-astrale',
    name: 'Améthyste Astrale',
    eyebrow: 'Cristal nocturne',
    description: 'Obsidienne violette, éclats cobalt et lumière cristalline contenue.',
    asset: 'assets/skins/amethyste-astrale-4k.png',
    accent: '#9471ff',
    fluid: { primary: '#673ad8', secondary: '#337ee8', accent: '#c9b5ff', speed: 0.7, intensity: 0.78 },
  },
])

export const SKIN_MOTION_OPTIONS = Object.freeze([
  { id: 'immersive', label: 'Immersif', description: 'Profondeur, lumière et parallaxe.' },
  { id: 'calm', label: 'Calme', description: 'Mouvements très lents et discrets.' },
  { id: 'off', label: 'Fixe', description: 'Texture statique, sans animation.' },
])

export const SKIN_STORAGE_KEY = 'noblesse-studio:skin-preferences:v1'

const skinIds = new Set(SKINS.map((skin) => skin.id))
const motionIds = new Set(SKIN_MOTION_OPTIONS.map((option) => option.id))

export const getSkinDefinition = (skinId) => (
  SKINS.find((skin) => skin.id === skinId) || SKINS.find((skin) => skin.id === DEFAULT_SKIN_ID)
)

export const normalizeSkinPreferences = (value) => ({
  skinId: skinIds.has(value?.skinId) ? value.skinId : DEFAULT_SKIN_ID,
  motion: motionIds.has(value?.motion) ? value.motion : DEFAULT_SKIN_MOTION,
})

const resolveStorage = (storage) => {
  if (storage) return storage
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

export const loadSkinPreferences = (storage) => {
  try {
    const rawValue = resolveStorage(storage)?.getItem(SKIN_STORAGE_KEY)
    return normalizeSkinPreferences(rawValue ? JSON.parse(rawValue) : null)
  } catch {
    return normalizeSkinPreferences(null)
  }
}

export const saveSkinPreferences = (value, storage) => {
  const normalized = normalizeSkinPreferences(value)
  try {
    resolveStorage(storage)?.setItem(SKIN_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // A blocked storage backend must never prevent the studio from opening.
  }
  return normalized
}
