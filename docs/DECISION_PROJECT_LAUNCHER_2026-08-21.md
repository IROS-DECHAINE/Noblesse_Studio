# Decision

- Statut : `IMPLEMENTED_V2_LIVE_RETEST_REQUIRED`
- Date : 2026-08-21
- Propriétaire : Codex / Noblesse Studio
- Décision : Noblesse Studio lance chaque projet UEFN depuis un profil approuvé et versionné. Le profil fixe le descripteur, l’identité de projet et le port MCP. L’interface ne transmet qu’un ID de profil. Avant chaque lancement, le processus principal prépare de façon atomique les préférences UEFN qui déterminent le dernier projet et le port MCP.

## Context

Theo doit pouvoir ouvrir un projet depuis sa carte sans mémoriser un port ou une commande. Trois éditeurs UEFN ouverts avec le réglage global d’auto-démarrage ont démontré le défaut actuel : PrimeBot répondait sur 8002 alors que son profil exige 8000, Prime Industry et Bibliothèque étaient ouverts sans endpoint MCP utilisable.

La décision doit rester valable pour une application locale appelée à piloter plusieurs projets pendant dix ans. La première version est livrée le 21 août 2026 et reste limitée à UEFN ; Unreal et Roblox utiliseront plus tard des adaptateurs séparés.

## Non-negotiables

- Aucun chemin, exécutable ou argument arbitraire ne vient du renderer.
- Un profil ouvert ne peut pas être relancé en double.
- Un port occupé bloque le lancement avant la création d’un processus.
- Le statut vert exige l’identité MCP attendue, le port attribué et les outils de transfert requis.
- L’application ne ferme, ne focalise et ne redémarre jamais un éditeur à la place de Theo.
- Les gros projets ne sont pas tous lancés automatiquement.
- Chaque erreur reste visible et actionnable ; un mauvais port n’est jamais présenté comme prêt.

## Evidence

- Epic documente `-ModelContextProtocolStartServer` et `-ModelContextProtocolPort=N` pour démarrer le serveur MCP de l’éditeur : [Unreal MCP in Unreal Editor](https://dev.epicgames.com/documentation/unreal-engine/unreal-mcp-in-unreal-editor).
- Epic documente que le démarrage normal de UEFN ouvre le Project Browser et que l’option `Open last project on start up` ouvre automatiquement le projet courant : [Starting and Organizing a Project](https://dev.epicgames.com/documentation/fortnite/starting-and-organizing-a-project-in-fortnite).
- Epic documente les surcharges temporaires `-ini:<CATEGORY>:[SECTION]:<KEY>=<VALUE>` : [Configuration Files](https://dev.epicgames.com/documentation/en-us/unreal-engine/configuration-files-in-unreal-engine). Elles sont conservées en renfort, mais ne sont pas l’unique source de vérité du lanceur.
- Epic documente le lancement d’un éditeur Unreal avec un `.uproject`, mais ne documente pas le chemin `.uefnproject` positionnel comme ouverture automatique de UEFN : [Command-Line Arguments](https://dev.epicgames.com/documentation/unreal-engine/command-line-arguments-in-unreal-engine).
- UnrealGameSync, utilisé en interne par Epic notamment pour Fortnite, expose « Launch Editor » et une ligne de commande éditeur par workspace : [UGS tutorial](https://dev.epicgames.com/documentation/unreal-engine/horde-unrealgamesync-tutorial-for-unreal-engine) et [UGS menu reference](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-game-sync-menu-reference-for-unreal-engine).
- Observation locale du 21 août 2026 : trois processus UEFN ouverts, un seul endpoint MCP sur 8002 et une identité réelle `/STEAL_THE_RIFT_BOTS`. Confiance : observée.
- Le registre local attribue déjà 8000 à PrimeBot, 8001 à Prime Industry et 8002 à Bibliothèque. Confiance : observée dans le code et couverte par test.
- Test réel du 21 août 2026 à `18:39:33Z` : le reçu de Noblesse Studio prouve un clic PrimeBot attendu sur `8000` et le PID `11712`; UEFN a pourtant sélectionné Prime Industry, n’a ouvert aucun projet et a démarré MCP sur la préférence globale `8002`. Cette preuve invalide la stratégie V1 fondée uniquement sur les arguments de processus.

## Options

1. Raccourcis Windows indépendants par projet. Rapide, mais sans identité vérifiée, état partagé ni garde anti-doublon.
2. Lanceur central à profils approuvés dans Electron. Une API étroite orchestre le lancement, puis le service MCP existant valide l’état réel.
3. Démarrage automatique de tous les projets au lancement de Noblesse Studio. Simple à comprendre, mais coûteux en mémoire et fragile lorsqu’un éditeur ou un port échoue.

### Weighted comparison

Les scores sont ordinaux de 1 à 5 ; ils aident à comparer, ils ne prétendent pas mesurer une précision scientifique.

| Critère | Poids | Raccourcis | Profils centraux | Tout auto-démarrer |
|---|---:|---:|---:|---:|
| Correction technique et sécurité | 25 | 2 | 5 | 2 |
| Fiabilité opérationnelle et identité | 20 | 2 | 5 | 2 |
| Réutilisation pour les futurs projets | 15 | 2 | 5 | 3 |
| Coût de maintenance | 15 | 3 | 4 | 2 |
| Vitesse de livraison | 10 | 5 | 4 | 3 |
| Performance et passage à l’échelle | 5 | 4 | 4 | 1 |
| Réversibilité | 5 | 4 | 4 | 2 |
| Confiance des preuves | 5 | 3 | 4 | 2 |
| **Total pondéré / 5** | **100** | **2,70** | **4,60** | **2,20** |

## Chosen option

L’option 2 est retenue. `project-connections.v1.json` reste la source approuvée des profils. Le processus principal Electron découvre l’exécutable UEFN depuis le manifeste Epic Games Launcher, refuse tout binaire différent, vérifie le descripteur et le port, puis lance avec `shell: false`.

Le lancement V2 produit d’abord un handoff persistant et borné dans `EditorPerProjectUserSettings.ini` : `bStartupWithLastProject=True`, `LastProjectFileName`, `ServerPortNumber`, `bAutoStartServer=True` et `bEnableToolSearch=True`. Seules ces clés sont remplacées, le fichier est écrit atomiquement et son contenu précédent est sauvegardé par SHA-256. Les lancements concurrents sont sérialisés. Les mêmes valeurs sont aussi envoyées en surcharge `-ini` et via les flags MCP afin de rester compatibles avec les versions d’UEFN qui honorent les arguments.

Le lancement produit ensuite un reçu local versionné avec la stratégie et l’empreinte des préférences. L’interface sonde les sessions existantes : une carte passe au vert uniquement quand le mount MCP, le port et la capacité d’installation correspondent tous au profil.

Les options 1 et 3 sont rejetées : elles ne donnent pas une vérité opérationnelle suffisante et rendent les pannes de port difficiles à diagnostiquer.

## Downstream impact

- Les cartes PrimeBot Rush et Prime Industry reçoivent une action de lancement et un état MCP lisible.
- Bibliothèque possède déjà le même profil backend et pourra recevoir une carte dédiée sans changer le service.
- Unreal et Roblox doivent implémenter leur propre adaptateur ; ils ne réutilisent pas aveuglément les arguments UEFN.
- Les chemins privés restent confinés à Electron ; le renderer reçoit uniquement des états publics.
- L’état de lancement mutable vit dans `data/state/project-launches.v1.json` et peut être sauvegardé avec le reste de l’état.

## Risks

- **Epic change les arguments ou le manifeste.** Mitigation : découverte isolée, tests dédiés, override explicite vers le seul nom d’exécutable autorisé.
- **Plusieurs instances UEFN partagent le même fichier de préférences.** Mitigation : handoff sérialisé, réécriture exacte juste avant chaque processus, sauvegarde adressée par contenu et validation finale par identité MCP. Un éditeur déjà ouvert peut sauvegarder ses préférences plus tard, mais le prochain clic réapplique toujours son profil avant de lancer.
- **Un projet est déjà ouvert avec le mauvais port.** Mitigation : état rouge explicite, aucun doublon ; Theo le ferme manuellement puis utilise Lancer.
- **Le processus démarre mais MCP tarde ou échoue.** Mitigation : états `LAUNCHING`, `CONNECTING`, délai de trois minutes et relance contrôlée.
- **Le port devient occupé entre la vérification et le bind UEFN.** Mitigation : UEFN reste la source finale ; l’app affiche le conflit et ne déclare jamais la session prête.
- **Un clic renderer tente une injection de commande.** Mitigation : seul `profileId` traverse IPC ; executable, chemin et arguments viennent du registre approuvé.

Pré-mortem : l’échec le plus probable serait un changement silencieux d’Epic qui ouvre le projet sans démarrer MCP. Il sera visible comme `OPEN_MCP_UNAVAILABLE` ou expiration, jamais comme un faux vert.

## Validation

- Tests unitaires : patch INI minimal, ajout des sections absentes, sauvegarde SHA-256, écriture idempotente, valeurs interdites, arguments de renfort exacts, sérialisation des doubles clics, profil inconnu, port occupé, anti-doublon, mauvais port, identité exacte et découverte du manifeste Epic.
- Vérification locale en lecture seule : l’exécutable UEFN actuellement installé est retrouvé automatiquement.
- Vérification de l’état réel : les trois éditeurs actuellement mal routés sont décrits sans faux positif.
- Validation UI : états fermé, lancement, prêt et erreur inspectés dans le rendu ; bouton désactivé pendant une opération.
- Validation produit V1 : **échec observé**; PrimeBot a ouvert le navigateur sur Prime Industry et le port global 8002.
- Validation produit V2 : **à refaire après redémarrage manuel de Noblesse Studio**; Theo clique Lancer PrimeBot et confirme l’ouverture directe ainsi que la carte verte sur 8000. Le code ne revendique pas encore cette preuve live.

## Rollback

Retirer ou désactiver `launch.enabled` dans le profil masque l’action sans affecter la détection de sessions ni le transfert d’assets. Les sauvegardes des préférences UEFN vivent sous `data/backups/repository-v1/uefn-editor-settings/` et permettent une restauration manuelle. Les handlers IPC peuvent être retirés indépendamment ; aucun projet ni asset n’est modifié par ce rollback.

## Review trigger

Revoir cette décision si Epic modifie le transport MCP ou les arguments documentés, si un profil doit lancer plusieurs processus, si le studio dépasse vingt profils actifs, si un mode multi-utilisateur est ajouté, ou si Unreal/Roblox exigent un orchestrateur partagé plus général.
