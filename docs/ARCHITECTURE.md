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

## Base de données

`data/database/noblesse-studio.db` contient les projections de recherche :

- éléments de bibliothèque;
- documents;
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

## Périmètre

Cette architecture est mono-utilisateur et locale. L’authentification, les rôles, le cloud et la collaboration ne sont pas ajoutés tant qu’un besoin réel ne les justifie pas.
