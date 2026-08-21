export const documentProjects = [
  {
    id: 'studio',
    label: 'Noblesse Studio',
    imagePath: 'assets/noblesse-vault-icon.png',
    tone: 'studio',
  },
  {
    id: 'primebot-rush',
    label: 'PRIMEBOT RUSH',
    imagePath: 'assets/previews/primebot-rush-project.png',
    tone: 'primebot',
  },
  {
    id: 'prime-industry',
    label: 'PRIME INDUSTRY',
    imagePath: 'assets/previews/prime-industry-project.png',
    tone: 'industry',
  },
  {
    id: 'how-many-boxes',
    label: 'HOW MANY BOX',
    imagePath: 'assets/previews/how-many-box-project.png',
    tone: 'boxes',
  },
]

// Read-only web preview. Every entry names an existing source of truth; the
// desktop service replaces this list with the real local document registry.
export const documentPreviewFallback = [
  {
    id: 'preview-studio-architecture-10-year',
    projectId: 'studio',
    title: 'Architecture durable 10 ans',
    originalName: 'ARCHITECTURE_NOBLESSE_STUDIO_10_YEAR.md',
    extension: 'md',
    kind: 'markdown',
    mimeType: 'text/markdown',
    canonicalStatus: 'ADOPTÉ',
    updatedAt: '2026-08-20T00:00:00+02:00',
    origin: 'linked',
    available: true,
    previewText: `# Noblesse Studio — architecture durable 10 ans

- Statut : **ADOPTED_WITH_VALIDATION_GATES**
- Date : 20 août 2026

## Décision

Noblesse Studio adopte une architecture **local-first**, indépendante de son interface. Noblesse Core porte les contrats durables ; React reste un client humain remplaçable.

> Le patrimoine du studio reste récupérable sans dépendre d’un framework, d’un protocole ou d’un index unique.

## Cycle obligatoire

1. Inspecter
2. Planifier
3. Approuver
4. Appliquer
5. Valider et conserver un reçu`,
  },
  {
    id: 'preview-primebot-runtime-manifest',
    projectId: 'primebot-rush',
    title: 'Manifeste du runtime publié',
    originalName: 'PUBLISHED_RUNTIME_AS_IS_MANIFEST_2026-08-03.md',
    extension: 'md',
    kind: 'markdown',
    mimeType: 'text/markdown',
    canonicalStatus: 'SOURCE DE VÉRITÉ',
    updatedAt: '2026-08-03T00:00:00+02:00',
    origin: 'linked',
    available: true,
    previewText: `# Manifeste canonique du runtime actuel publié

- Statut : **SOURCE DE VÉRITÉ EN CONSTRUCTION**
- Date : 3 août 2026

Ce document sépare strictement le jeu visible et mécanique actuel des idées futures.

## Règle produit

Le code livré représente uniquement le jeu actuel, son infrastructure indispensable et les rares champs de sauvegarde conservés pour compatibilité.

| Surface | Règle |
| --- | --- |
| Runtime | Fonctionnalités actives uniquement |
| Persistance | Compatibilité publiée préservée |
| Futur | Documentation autorisée, code retiré |`,
  },
  {
    id: 'preview-prime-industry-canon',
    projectId: 'prime-industry',
    title: 'Canon produit Prime Industry',
    originalName: 'CANON.md',
    extension: 'md',
    kind: 'markdown',
    mimeType: 'text/markdown',
    canonicalStatus: 'CANON',
    updatedAt: '2026-08-15T00:00:00+02:00',
    origin: 'linked',
    available: true,
    previewText: `# PRIME INDUSTRY — canon produit

Date : 15 août 2026

Chaque commerce majeur devient une carrière complète : **travailler, apprendre, obtenir la licence, acheter, embaucher, automatiser, franchiser**.

## Socle de lancement

- Boulangerie
- Garage
- Logistique
- Construction

Le noyau entreprise partagé porte la trésorerie, le stock, le personnel, la production, les commandes et les revenus à collecter.`,
  },
  {
    id: 'preview-how-many-boxes-handoff',
    projectId: 'how-many-boxes',
    title: 'Handoff du projet',
    originalName: 'HANDOFF.md',
    extension: 'md',
    kind: 'markdown',
    mimeType: 'text/markdown',
    canonicalStatus: 'DEBUG',
    updatedAt: '2026-08-20T00:00:00+02:00',
    origin: 'linked',
    available: true,
    previewText: `# How Many Boxes Can You Carry? — handoff

Le projet est répertorié dans le registre des jeux Noblesse Studio sous le statut **DEBUG**.

## Point d’entrée

Le fichier HANDOFF reste le document d’entrée pour reprendre le projet et vérifier son état réel avant toute nouvelle décision.`,
  },
]

export const documentProjectById = Object.fromEntries(
  documentProjects.map((project) => [project.id, project]),
)
