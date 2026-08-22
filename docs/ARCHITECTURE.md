# Architecture fondatrice de Noblesse Studio App

## Décision

Noblesse Studio reste une application Electron locale. Le produit, son Vault et ses index ne vivent plus dans un projet de jeu.

Racine :

```text
D:\NO_BLESSE Studio\
├── Documents\
├── Fortnite\
├── Roblox\
├── Tools\
├── Unreal\
└── Noblesse Studio App\
```

Le dossier entreprise contient les productions. L’application est un projet frère qui les indexe et les pilote.

## Structure courte

```text
Noblesse Studio App/
├── README.md            point d’entrée humain et IA
├── AGENTS.md            règles pour les assistants
├── .gitignore           règles Git du dépôt entier
├── app/                 code, dépendances et outils de construction
│   ├── package.json
│   ├── src/             interface React
│   ├── electron/        main, preload et services privilégiés
│   ├── shared/          contrats partagés
│   ├── scripts/         migrations, index et validation
│   └── assets/          icônes de l’application
├── config/              chemins canoniques
├── docs/                architecture et décisions durables
├── data/                état mutable, SQLite, sauvegardes et logs
└── library/             index métier et stockage géré
```

Aucun dossier `dist`, `release-*` ou `node_modules` ne fait partie de l’architecture source. Ils sont générés et ignorés par Git.

## Couches Electron

```text
Interface React
      ↓ API étroite
Preload / contextBridge
      ↓ IPC validé
Processus principal Electron
      ├── services métier
      ├── SQLite reconstructible
      ├── bibliothèque et documents
      └── adaptateurs UEFN / Unreal
```

La position d’un fichier ne doit jamais devenir son identité. Les appels métier utilisent des IDs permanents.

## Lanceur de projets

Les projets UEFN sont ouverts depuis des profils approuvés dans le registre Electron. Le renderer transmet uniquement un ID permanent ; il ne choisit jamais un chemin, un exécutable ou des arguments. Le processus principal vérifie le descripteur, l’installation Epic, l’absence de doublon et la disponibilité du port. Il prépare ensuite atomiquement les clés UEFN `LastProjectFileName`, `bStartupWithLastProject` et Model Context Protocol, avec sauvegarde adressée par contenu, avant de lancer l’éditeur. Les demandes concurrentes sont sérialisées.

Le Coffre expose une zone d’installation commune, mais chaque type déclare une capacité précise (`material`, `sound`, `staticMesh`, `vfx`). Un projet n’est sélectionnable que si son adaptateur réel annonce cette capacité. Les matières utilisent l’installateur de recette vérifié. Les sons UEFN utilisent un handoff borné : validation du Vault, copie WAV reconstructible au nom unique, création du dossier Audio et navigation du Content Browser, puis import final humain tant que le connecteur Epic ne fournit pas d’importeur `SoundWave`. Aucun adaptateur ne peut réutiliser aveuglément les règles d’un autre type. La réponse IPC d’installation est un DTO fermé : elle confirme uniquement le mode et le projet public, sans reçu, chemin local ou preuve interne.

Les assets 3D suivent le contrat groupe + modules. Chaque module `StaticMesh` pointe vers une source canonique manifestée et partage un `asset_group` avec ses éventuelles autres pièces. L’adaptateur UEFN installe d’abord les recettes PBR dépendantes, importe le mesh sans matériaux implicites, remappe chaque slot par règle déclarée, puis relit triangles, bounds, matériaux et état sauvegardé. Les normales OpenGL déclarées sont converties par la propriété Unreal vérifiée. Un aperçu GLB hashé est servi à la demande par `noblesse-vault://model/<assetId>` ; il est reconstructible et ne remplace jamais le FBX ou le pack natif. Voir [la décision des packs 3D modulaires](DECISION_MANAGED_STATIC_MESH_PACKS_2026-08-22.md).

Une session n’est « prête » que lorsque son identité MCP, son port attribué et les outils de transfert requis sont tous vérifiés. Unreal et Roblox auront des adaptateurs distincts. Voir [la décision du lanceur](DECISION_PROJECT_LAUNCHER_2026-08-21.md).

## Contrats IPC publics

Les modèles internes du Vault et des intégrations ne sont jamais renvoyés directement au renderer. Les canaux assets et projets passent par une passerelle commune qui contrôle l’émetteur, valide l’entrée, exécute le service puis sérialise une réponse publique `v1` fermée par liste blanche.

La réponse assets contient uniquement les métadonnées nécessaires à l’interface. Les chemins `source_path`, `source_origin` et `preview_source` restent privilégiés. Une image du Vault est demandée par `assetId`; le processus principal retrouve ensuite sa source interne. La réponse projets omet les chemins, descripteurs, endpoints, PID et journaux. Les projets installables utilisent l’ID permanent de leur profil approuvé; une découverte non enregistrée ne reçoit aucun ID dérivé de son chemin et est comptée dans les diagnostics.

Les schémas publics refusent les propriétés supplémentaires et toute valeur ressemblant à un chemin Windows absolu, UNC, de périphérique ou à une URL `file:`. Les identifiants de contenu moteur comme `/Game/...` restent autorisés. Voir [la décision des contrats IPC publics](DECISION_PUBLIC_IPC_CONTRACTS_2026-08-21.md).

## Modèle de bibliothèque

| Catégorie | Dossier lisible | Source physique |
|---|---|---|
| Assets génériques | `library/assets/` | `library/storage/` |
| Textures | `library/textures/` | `library/storage/` |
| Matériaux | `library/materials/` | `library/storage/` |
| Sons | `library/sounds/` | `library/storage/user-audio/` |
| Documents | `library/documents/` | `D:\NO_BLESSE Studio\Documents` ou source liée |

Chaque dossier lisible contient :

- `INDEX.md` pour Theo et les humains;
- `index.json` pour l’application et les IA.

Le stockage interne conserve les packs et dépendances dans leur structure native lorsqu’un moteur l’exige. Les index donnent une vue simple sans casser les bundles Unreal ou UEFN.

L’import audio utilise des jetons de sélection opaques. Un lot borné à 200 fichiers et 2 Go est persisté avant traitement ; chaque fichier possède son état et ses tentatives. Le renderer transmet seulement jeton, titre, catégorie et confirmation des droits. Le processus principal convertit les MP3 avec une commande fixe, puis un worker contrôle les WAV et calcule les hashes. La reprise ne rejoue que les échecs et les index sont reconstruits une fois par passe. Voir [la décision audio](DECISION_MANAGED_AUDIO_IMPORT_2026-08-22.md).

La suppression d’un élément du Coffre est une mutation logique planifiée. Le renderer envoie uniquement des IDs ; le processus principal persiste un plan hashé, bloque les dépendances entrantes, exige deux validations et conserve les originaux. Les reçus privés vivent sous `library/storage/.trash/`, tandis que l’interface **Sécurité et récupération** permet la restauration. Les mutations audio et corbeille partagent une file afin d’éviter les courses sur le catalogue. Voir [la décision de corbeille](DECISION_RECOVERABLE_LIBRARY_TRASH_2026-08-22.md).

Les anciens chemins Worker Rift présents dans certains champs `sourceOrigin` sont une provenance historique, pas un emplacement de fonctionnement. Une entrée `MANAGED` pointe toujours vers `library/storage/`. Les rares entrées `REFERENCE` décrivent un objet natif externe et sont affichées explicitement comme telles ; elles ne rendent jamais le démarrage du produit dépendant de Worker Rift.

## Base de données

`data/database/noblesse-studio.db` contient les projections de recherche :

- éléments de bibliothèque;
- documents;
- révisions immuables des documents;
- relations et dépendances résolues ou à résoudre;
- métadonnées et version de schéma;
- index FTS pour la recherche.

La base ne contient pas les gros binaires. Elle peut être supprimée et reconstruite depuis les catalogues et manifestes avec `pnpm.cmd rebuild-indexes`, lancé depuis `app/`.

## Autorité et récupération

1. Originaux gérés.
2. Manifestes et hashes.
3. Index JSON/Markdown.
4. SQLite reconstructible.
5. Aperçus et caches reconstructibles.

Une panne d’index ou de cache ne doit donc jamais détruire un original.

## Importations durables

Une importation de documents est enregistrée dans `data/state/operations/` avant de commencer. Chaque fichier possède son propre état, son nombre de tentatives et son résultat. Une fermeture inattendue transforme une tâche en `INTERRUPTED`; elle peut être reprise depuis **Réglages** sans dupliquer les fichiers déjà importés.

Les chemins locaux privés restent dans le processus principal. Le renderer ne reçoit que des IDs, des libellés et des états publics.

## Calendrier, Google et Radar gaming

Le calendrier canonique reste local sous `data/state/calendar/`. Son ordonnanceur affiche les rappels Windows et maintient une icône système lorsque le fonctionnement en arrière-plan est actif. Les décisions de démarrage et d’arrêt du scheduler et de l’icône sont regroupées dans un runtime testable ; l’interface ne prétend « actif » qu’après une notification test réussie.

Google Calendar est un adaptateur sortant optionnel. Le processus principal chiffre client OAuth et jeton durable avec `safeStorage`, réalise OAuth 2 + PKCE sur une boucle locale temporaire, puis projette les événements dans l’agenda principal. Le renderer ne voit que l’état public de connexion. Noblesse Studio demeure l’autorité et une panne Google laisse la mutation locale valide avec une synchronisation en attente. Voir [la décision Google Calendar](DECISION_GOOGLE_CALENDAR_SYNC_2026-08-22.md).

Le Radar gaming ne monte aucun fil permanent sur l’accueil. Il ouvre un panneau à la demande, agrège au plus un petit nombre d’entrées depuis les flux officiels Unreal Engine, Roblox DevForum et Epic Games Status, puis conserve un cache reconstructible dans `data/state/integrations/`. Les liens externes sont filtrés par HTTPS et liste de domaines. Le connecteur X reste désactivé tant qu’un compte développeur et un budget d’API n’ont pas été explicitement approuvés. Voir [la décision Radar gaming](DECISION_NEWS_RADAR_2026-08-22.md).

## Versions documentaires

Un document géré conserve ses objets précédents par hash. Remplacer ou restaurer une version ajoute une nouvelle entrée à l’historique ; aucune ancienne version n’est écrasée. Les suppressions passent par un plan confirmé et une corbeille récupérable.

## Performance du Coffre

La grille du Coffre est virtualisée. Elle monte uniquement les lignes visibles avec trois lignes d’avance. Les images utilisent en plus le chargement paresseux du navigateur. Les modules lourds — rendu 3D, graphiques financiers et documents — sont séparés en chunks chargés à l’ouverture de leur section.

## Sauvegardes

Le dépôt de sauvegarde `data/backups/repository-v1/` est adressé par contenu : deux instantanés réutilisent le même objet si son hash est identique. Les manifestes sont eux-mêmes contrôlés, les liens symboliques sont refusés et une restauration exige un plan temporaire confirmé. Voir [RECOVERY_RUNBOOK.md](RECOVERY_RUNBOOK.md).

## Frontière de sécurité Electron

- `nodeIntegration: false` ;
- `contextIsolation: true` ;
- `sandbox: true` ;
- API métier étroite via `contextBridge` ;
- contrôle de l’émetteur et de la frame principale pour chaque handler IPC ;
- navigation et permissions Chromium bloquées par défaut ;
- liens externes limités à HTTPS ;
- politique CSP sans `unsafe-eval`.

Le workflow GitHub vérifie automatiquement ces contrats, les tests, l’audit des dépendances et le build. La livraison Windows est séparée et exige un certificat de signature.

## Périmètre

Cette architecture est mono-utilisateur et locale. L’authentification, les rôles, le cloud et la collaboration ne sont pas ajoutés tant qu’un besoin réel ne les justifie pas.
