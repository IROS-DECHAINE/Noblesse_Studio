# Décision — Packs d’assets 3D gérés et modulaires

Propriétaire : Codex
Statut : ACCEPTED
Date : 2026-08-22
Échéance : première livraison locale Assets

## Decision

Une carte de la catégorie Assets représente un groupe métier stable. Chaque pièce réellement installable de ce groupe possède son propre ID permanent et devient un module sélectionnable. Le Vault conserve le pack source natif complet, un manifeste de fichiers hashés et un aperçu GLB reconstructible.

## Context

Le premier exemple est le pack « NYC Water Tank VFX » : il contient un asset complet, des sources Blender, des exports FBX et OBJ, dix textures 4K, cinq rendus de preuve, des scripts de production et des rapports QA. Les futures bases PrimeBot pourront contenir plusieurs pièces installables partageant une même identité visuelle. Une carte par fichier fragmenterait la bibliothèque ; un seul fichier opaque empêcherait l’installation sélective des futurs modules.

## Non-negotiables

- le dossier remis par Theo reste en lecture seule et n’est jamais la source runtime de l’application ;
- tous les fichiers du pack sont copiés dans le Vault en préservant leur arborescence et leurs hashes ;
- un groupe et un module ont des identités distinctes et permanentes ;
- un asset complet reste un module « Complet » : aucun découpage artificiel n’est inventé ;
- les dépendances PBR sont explicites et vérifiées, jamais déduites silencieusement par le renderer ;
- un aperçu GLB est une dérivée reconstructible, pas l’original métier ;
- le renderer ne reçoit ni chemin absolu, ni source Blender, ni commande système ;
- le statut `READY` exige encore une validation réelle dans UEFN.

## Evidence

- l’inventaire du pack NYC contient 31 fichiers, sans lien symbolique, avec un hash d’ensemble `679bd16e37613e243c79db9bf099e75a7e6baaaab359e59252aff976268b64bc` ;
- les rapports fournis valident 137 480 triangles, des dimensions de 4,5977 × 4,57 × 5,98 mètres et 15 slots de matériaux ;
- [Epic documente les imports FBX, OBJ, glTF et GLB dans UEFN](https://dev.epicgames.com/documentation/fortnite/importing-assets-in-unreal-editor-for-fortnite?lang=en-US), ainsi que l’import de plusieurs meshes et matériaux ;
- [la documentation FBX d’Unreal](https://dev.epicgames.com/documentation/en-us/unreal-engine/fbx-static-mesh-pipeline-in-unreal-engine) précise que les textures diffuse et normale sont les connexions importées automatiquement de façon courante : la rugosité et le métal du pack doivent donc être reconstruits explicitement ;
- [le connecteur MCP Unreal](https://dev.epicgames.com/documentation/unreal-engine/unreal-mcp-in-unreal-editor) reste expérimental ; le runtime doit donc redécouvrir l’import StaticMesh, l’inspection des slots, l’affectation des matériaux et la sauvegarde à chaque session.

## Options

Critères pondérés : fidélité 30, sécurité des données 25, maintenance sur dix ans 20, expérience 15, réversibilité 10. Total : 100.

| Option | Fidélité 30 | Données 25 | Maintenance 20 | Expérience 15 | Réversibilité 10 | Score / 500 |
|---|---:|---:|---:|---:|---:|---:|
| Une entrée par fichier, import automatique | 2 | 3 | 2 | 2 | 3 | 250 |
| Un groupe opaque contenant un unique gros fichier | 3 | 3 | 2 | 3 | 2 | 275 |
| Groupe + modules + manifeste natif + dépendances explicites | 5 | 5 | 5 | 5 | 5 | 500 |

## Chosen option

La troisième option est retenue. Le château d’eau publie une carte et un module `Complet`. Une future base en six morceaux publiera six entrées `StaticMesh` portant le même `asset_group`, sans changer le contrat d’interface. Le FBX reste la source d’installation canonique ; le GLB sert uniquement à l’aperçu interactif local. Les matériaux du mesh dépendent de recettes PBR cachées de la galerie afin d’empêcher les pertes silencieuses de roughness, metallic et orientation de normale.

## Downstream impact

- le catalogue accepte `StaticMesh`, `asset_group`, `module_id`, `module_label` et `model_preview_source` ;
- les recettes techniques de dépendance restent installables mais ne créent pas de cartes Matières ;
- l’interface groupe les modules, affiche leur sélecteur et réutilise le contrôle de destination commun ;
- le protocole local du Vault sert uniquement les GLB manifestés et contrôlés ;
- l’adaptateur UEFN importe les dépendances, le mesh, remappe les slots, vérifie dimensions et triangles, puis sauvegarde ;
- Roblox et Unreal recevront des adaptateurs distincts avant activation.

## Risks

- GLB volumineux : chargement à la demande, dérivée remplaçable et affiche source de secours ;
- changement des outils MCP expérimentaux : découverte et vérification des commandes à chaque session, refus par défaut ;
- import à mauvaise échelle : contrôle des bounds en centimètres avant succès ;
- état partiel après interruption : dépendances idempotentes, détection de mesh partiel et absence de reçu de succès ;
- slots renommés : manifeste de règles bornées et erreur explicite si un slot ne correspond à aucun matériau ;
- suppression d’un groupe : plan de corbeille incluant les dépendances, avec blocage si elles sont encore utilisées.

## Validation

- test du hash d’ensemble, du refus des liens symboliques et de l’idempotence de publication ;
- test du groupement d’un module puis de plusieurs modules sous une carte ;
- test IPC prouvant qu’aucun chemin privé ne traverse vers le renderer ;
- tests MCP du mauvais mount, des outils manquants, des triangles, des bounds, des slots et de la sauvegarde ;
- inspection visuelle de l’aperçu GLB dans l’application packagée ;
- validation UEFN humaine encore requise avant promotion de `VALIDATED` à `READY`.

## Rollback

Retirer les entrées du catalogue par le plan de corbeille, reconstruire les index et supprimer uniquement la dérivée GLB ou le pack géré après confirmation. Le dossier source remis par Theo reste inchangé. L’adaptateur StaticMesh peut être désactivé sans modifier les autres catégories du Coffre.

## Review trigger

Réviser cette décision avant le premier pack réellement composé de plusieurs modules, avant l’activation Roblox ou Unreal, si Epic stabilise ou modifie le protocole MCP StaticMesh, ou si un aperçu dépasse les budgets de mémoire mesurés sur le PC cible.
