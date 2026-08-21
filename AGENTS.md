# Instructions IA — Noblesse Studio App

## Lecture obligatoire

1. Lire `README.md`.
2. Lire `library/INDEX.md`.
3. Lire `docs/ARCHITECTURE.md`.
4. Pour une migration, lire `docs/MIGRATION_2026-08-21.md`.

## Règles de structure

- La seule racine de l’application est `D:\NO_BLESSE Studio\Noblesse Studio App`.
- `WORKER_RIFT` est un projet Fortnite externe; il ne doit jamais redevenir la racine du produit ou de ses données.
- Ne pas créer un nouveau dossier de premier niveau sans nécessité architecturale documentée.
- Ne pas déposer de rapports ou de notes au hasard. Les documents durables vont dans `docs/`; l’entrée principale reste `README.md`.
- Tout le code et tout l’outillage Node/Electron vivent dans `app/`. La racine reste lisible et réservée aux grands domaines.
- Aucun chemin machine ne doit être dispersé dans le code. Utiliser `app/electron/lib/studioPaths.mjs` et `config/studio-paths.v1.json`.

## Règles de données

- Tout élément de bibliothèque possède un ID permanent unique.
- Les originaux gérés sous `library/storage/` sont immuables après publication; une modification crée une nouvelle version.
- Les aperçus, caches et index sont reconstructibles.
- La base `data/database/noblesse-studio.db` est une projection rapide, pas l’unique source de vérité.
- Aucun asset, texture, matériau ou document ne peut être ajouté sans apparaître dans son index de catégorie.
- Ne jamais modifier manuellement `library/index.json`, `library/*/index.json` ou leurs `INDEX.md`. Utiliser `pnpm.cmd rebuild-indexes` depuis `app/`.

## Validation minimale

Après une modification de fondation :

```powershell
Set-Location app
pnpm.cmd rebuild-indexes
pnpm.cmd verify-foundation
pnpm.cmd test
pnpm.cmd build
```

Ne jamais supprimer l’ancien emplacement d’une migration avant un PASS de ces quatre contrôles et une validation humaine.
