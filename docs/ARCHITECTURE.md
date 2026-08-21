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

## Modèle de bibliothèque

| Catégorie | Dossier lisible | Source physique |
|---|---|---|
| Assets génériques | `library/assets/` | `library/storage/` |
| Textures | `library/textures/` | `library/storage/` |
| Matériaux | `library/materials/` | `library/storage/` |
| Documents | `library/documents/` | `D:\NO_BLESSE Studio\Documents` ou source liée |

Chaque dossier lisible contient :

- `INDEX.md` pour Theo et les humains;
- `index.json` pour l’application et les IA.

Le stockage interne conserve les packs et dépendances dans leur structure native lorsqu’un moteur l’exige. Les index donnent une vue simple sans casser les bundles Unreal ou UEFN.

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
