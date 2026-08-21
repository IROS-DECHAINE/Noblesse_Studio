export const PROJECT_ROADMAP_SCHEMA_VERSION = 2
export const PROJECT_ROADMAP_STORAGE_KEY = 'noblesse-studio.project-roadmaps.v2'
export const PROJECT_ROADMAP_LEGACY_STORAGE_KEY = 'noblesse-studio.project-roadmaps.v1'

export const portfolioProjects = [
  {
    id: 'primebot-rush',
    name: 'PRIMEBOT RUSH',
    roadmapName: 'PrimeBot Rush',
    platform: 'Fortnite / UEFN',
    icon: 'gamepad',
    imagePath: 'assets/previews/primebot-rush-project.png',
    phase: 'Publié',
    status: 'Source Epic indisponible',
    detail: '4971-3856-2517',
    reviewedAt: 'Canon relu le 15 août 2026',
    summary: 'Le jeu est publié. La prochaine borne utile est la preuve terrain post-nettoyage avant de rouvrir l’expansion gameplay.',
    roadmap: [
      {
        id: 'foundations',
        title: 'Fondations du jeu',
        description: 'Boucle, économie, persistance et services autoritaires en place.',
        defaultDone: true,
      },
      {
        id: 'public-release',
        title: 'Publication publique',
        description: 'Île publique active sous le code 4971-3856-2517.',
        defaultDone: true,
      },
      {
        id: 'runtime-cleanup',
        title: 'Stabilité runtime',
        description: 'Finir la passe structurelle et garder une compile verrouillée propre.',
        defaultDone: false,
      },
      {
        id: 'field-playtest',
        title: 'Playtest terrain',
        description: 'Prouver achats, portage, respawn, Base pleine et deux joueurs.',
        defaultDone: false,
      },
      {
        id: 'release-confidence',
        title: 'Confiance release',
        description: 'Fermer les preuves ouvertes avant la prochaine vague produit.',
        defaultDone: false,
      },
    ],
  },
  {
    id: 'prime-industry',
    name: 'PRIME INDUSTRY',
    roadmapName: 'Prime Industry',
    platform: 'Roblox',
    icon: 'blocks',
    imagePath: 'assets/previews/prime-industry-project.png',
    phase: 'Canon en cours',
    status: 'En cours',
    detail: 'Données publiques non branchées',
    reviewedAt: 'Canon relu le 15 août 2026',
    summary: 'Le canon produit est en cours. La prochaine action est le graphe mesuré de la carrière Boulangerie et du noyau entreprise partagé, puis le blueprint des cinq districts et le brief mapper, avant toute décision d’implémentation ou de recrutement.',
    roadmap: [
      {
        id: 'product-canon',
        title: 'Direction produit cadrée',
        description: 'Marketplace urbaine, carrières et quatre entreprises héroïques cadrées ; le canon détaillé reste en cours.',
        defaultDone: true,
      },
      {
        id: 'bakery-career',
        title: 'Carrière Boulangerie',
        description: 'Mesurer chaque étape du shift employé jusqu’à la tour.',
        defaultDone: false,
      },
      {
        id: 'company-kernel',
        title: 'Noyau entreprise',
        description: 'Fixer trésorerie, stock, personnel, commandes et anti-duplication.',
        defaultDone: false,
      },
      {
        id: 'city-blueprint',
        title: 'Blueprint 5 districts',
        description: 'Mesurer flux, distances, charges joueurs et emplacements.',
        defaultDone: false,
      },
      {
        id: 'vertical-slice',
        title: 'Tranche verticale',
        description: 'Prouver métier, licence, vente, risque et progression de tour.',
        defaultDone: false,
      },
      {
        id: 'mapper-production',
        title: 'Mapper & production',
        description: 'Fixer le brief, le scope et seulement ensuite lancer la production.',
        defaultDone: false,
      },
    ],
  },
  {
    id: 'how-many-boxes',
    name: 'HOW MANY BOX',
    roadmapName: 'How Many Boxes Can You Carry?',
    platform: 'Roblox',
    icon: 'blocks',
    imagePath: 'assets/previews/how-many-box-project.png',
    phase: 'DEBUG',
    status: 'En cours',
    detail: 'Données publiques non branchées',
    reviewedAt: 'État relu le 20 août 2026',
    summary: 'Le banc V4 est prouvé en DEBUG. La suite ferme Inventaire/Gadgets, les sources de Parts, la persistance, le multijoueur et les tests sur appareil physique ; la map finale reste la dernière étape avant toute publication.',
    roadmap: [
      {
        id: 'v4-kernel',
        title: 'Noyau V4',
        description: 'Run, économie et progression serveur prouvés en DEBUG.',
        defaultDone: true,
      },
      {
        id: 'workshop-chest',
        title: 'Workshop & Win Chest',
        description: 'Modules, construction et récompenses atomiques prouvés.',
        defaultDone: true,
      },
      {
        id: 'inventory-gadgets',
        title: 'Inventaire & gadgets',
        description: 'Fermer les équipements, sources de Parts et contrats restants.',
        defaultDone: false,
      },
      {
        id: 'persistence-multiplayer',
        title: 'Persistance & multi',
        description: 'Prouver rejoin, sauvegardes sûres et collecte contestée à deux clients.',
        defaultDone: false,
      },
      {
        id: 'final-world',
        title: 'World 1 final',
        description: 'Valider puis importer la map finale depuis son pipeline propriétaire.',
        defaultDone: false,
      },
      {
        id: 'roblox-release',
        title: 'Release Roblox',
        description: 'Fermer mobile, assets, commerce et autorisation de publication.',
        defaultDone: false,
      },
    ],
  },
]

export function buildDefaultRoadmapProgress(projects = portfolioProjects) {
  return Object.fromEntries(projects.map((project) => [
    project.id,
    Object.fromEntries(project.roadmap.map((step) => [step.id, Boolean(step.defaultDone)])),
  ]))
}

export function mergeRoadmapProgress(savedProgress, projects = portfolioProjects) {
  const merged = buildDefaultRoadmapProgress(projects)
  const overrides = savedProgress?.schemaVersion === PROJECT_ROADMAP_SCHEMA_VERSION
    ? savedProgress.overrides
    : savedProgress
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return merged

  for (const project of projects) {
    const savedProject = overrides[project.id]
    if (!savedProject || typeof savedProject !== 'object' || Array.isArray(savedProject)) continue
    for (const step of project.roadmap) {
      if (typeof savedProject[step.id] === 'boolean') {
        merged[project.id][step.id] = savedProject[step.id]
      }
    }
  }

  return merged
}

export function buildRoadmapOverrides(progress, projects = portfolioProjects) {
  const overrides = {}

  for (const project of projects) {
    const projectOverrides = {}
    for (const step of project.roadmap) {
      const currentValue = progress?.[project.id]?.[step.id]
      if (typeof currentValue === 'boolean' && currentValue !== Boolean(step.defaultDone)) {
        projectOverrides[step.id] = currentValue
      }
    }
    if (Object.keys(projectOverrides).length) overrides[project.id] = projectOverrides
  }

  return overrides
}

export function resolveSelectedProjectId(projectId, projects = portfolioProjects) {
  return projects.some((project) => project.id === projectId) ? projectId : projects[0]?.id || ''
}

export function getRoadmapSnapshot(project, progress = {}) {
  const roadmap = Array.isArray(project?.roadmap) ? project.roadmap : []
  const completedSteps = roadmap.filter((step) => Boolean(progress[step.id])).length
  const nextStepIndex = roadmap.findIndex((step) => !progress[step.id])

  return {
    completedSteps,
    totalSteps: roadmap.length,
    progressPercent: roadmap.length ? Math.round((completedSteps / roadmap.length) * 100) : 0,
    nextStepIndex,
    nextStep: nextStepIndex >= 0 ? roadmap[nextStepIndex] : null,
    isComplete: roadmap.length > 0 && completedSteps === roadmap.length,
  }
}

export function createRoadmapWorkspaceEnvelope(workspace, projects = portfolioProjects, updatedAt = new Date()) {
  const timestamp = updatedAt instanceof Date ? updatedAt.toISOString() : String(updatedAt)
  return {
    schemaVersion: PROJECT_ROADMAP_SCHEMA_VERSION,
    selectedProjectId: resolveSelectedProjectId(workspace?.selectedProjectId, projects),
    overrides: buildRoadmapOverrides(workspace?.progress, projects),
    updatedAt: timestamp,
  }
}

export function loadRoadmapWorkspace(storage, projects = portfolioProjects) {
  const fallback = {
    progress: buildDefaultRoadmapProgress(projects),
    selectedProjectId: resolveSelectedProjectId(null, projects),
    updatedAt: null,
    source: 'default',
  }

  let currentRaw = null
  let legacyRaw = null
  try {
    currentRaw = storage.getItem(PROJECT_ROADMAP_STORAGE_KEY)
    legacyRaw = storage.getItem(PROJECT_ROADMAP_LEGACY_STORAGE_KEY)
  } catch {
    return fallback
  }

  if (currentRaw) {
    try {
      const saved = JSON.parse(currentRaw)
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        return {
          progress: mergeRoadmapProgress(saved, projects),
          selectedProjectId: resolveSelectedProjectId(saved.selectedProjectId, projects),
          updatedAt: typeof saved.updatedAt === 'string' ? saved.updatedAt : null,
          source: 'v2',
        }
      }
    } catch {
      // Try the legacy snapshot before falling back to current canon defaults.
    }
  }

  if (legacyRaw) {
    try {
      const saved = JSON.parse(legacyRaw)
      return {
        ...fallback,
        progress: mergeRoadmapProgress(saved, projects),
        source: 'v1',
      }
    } catch {
      return fallback
    }
  }

  return fallback
}

export function toggleRoadmapStep(progress, projectId, stepId) {
  if (typeof progress?.[projectId]?.[stepId] !== 'boolean') return progress
  return {
    ...progress,
    [projectId]: {
      ...progress[projectId],
      [stepId]: !progress[projectId][stepId],
    },
  }
}

export function saveRoadmapWorkspace(storage, workspace, projects = portfolioProjects, updatedAt = new Date()) {
  try {
    const envelope = createRoadmapWorkspaceEnvelope(workspace, projects, updatedAt)
    storage.setItem(PROJECT_ROADMAP_STORAGE_KEY, JSON.stringify(envelope))
    try {
      storage.removeItem?.(PROJECT_ROADMAP_LEGACY_STORAGE_KEY)
    } catch {
      // The v2 write already succeeded; legacy cleanup is best-effort only.
    }
    return true
  } catch {
    return false
  }
}

export function validatePortfolioProjects(projects = portfolioProjects) {
  const errors = []
  const projectIds = new Set()

  for (const [projectIndex, project] of projects.entries()) {
    const label = project?.id || `index ${projectIndex}`
    if (!project?.id || projectIds.has(project.id)) errors.push(`Identifiant projet invalide ou dupliqué : ${label}`)
    projectIds.add(project?.id)
    if (!project?.name || !project?.roadmapName) errors.push(`Nom projet incomplet : ${label}`)
    if (!Array.isArray(project?.roadmap) || project.roadmap.length === 0) {
      errors.push(`Roadmap vide : ${label}`)
      continue
    }

    const stepIds = new Set()
    for (const step of project.roadmap) {
      if (!step?.id || stepIds.has(step.id)) errors.push(`Identifiant d’étape invalide ou dupliqué : ${label}/${step?.id || 'sans-id'}`)
      stepIds.add(step?.id)
      if (!step?.title || !step?.description) errors.push(`Étape incomplète : ${label}/${step?.id || 'sans-id'}`)
    }
  }

  return errors
}
