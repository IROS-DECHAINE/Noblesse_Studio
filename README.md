# Noblesse Studio App

Application desktop officielle de Noblesse Studio.

**Racine canonique :** `D:\NO_BLESSE Studio\Noblesse Studio App`

Si vous ne savez pas où chercher, commencez toujours par ce fichier, puis ouvrez [library/INDEX.md](library/INDEX.md).

## Carte simple

| Besoin | Emplacement |
|---|---|
| Code complet de l’application | `app/` |
| Interface visible | `app/src/` |
| Electron, fichiers et IPC | `app/electron/` |
| Contrats partagés | `app/shared/` |
| Scripts de maintenance | `app/scripts/` |
| Configuration des chemins | `config/studio-paths.v1.json` |
| Index général de la bibliothèque | `library/INDEX.md` |
| Assets | `library/assets/` |
| Textures | `library/textures/` |
| Matériaux | `library/materials/` |
| Documents | `library/documents/` |
| Originaux gérés du Vault | `library/storage/` |
| Base SQLite locale | `data/database/noblesse-studio.db` |
| Calendrier, finances et favoris | `data/state/` |
| Sauvegardes | `data/backups/` |
| Architecture | `docs/ARCHITECTURE.md` |
| État de la migration | `docs/MIGRATION_2026-08-21.md` |

## Ce qui fait autorité

1. Les originaux et packs gérés vivent dans `library/storage/`.
2. `library/storage/catalog.json` donne l’identité permanente des éléments.
3. `library/storage/integrity.json` prouve les hashes et les fichiers publiés.
4. Les index `library/*/index.json` et `INDEX.md` sont générés pour l’application, les humains et les IA.
5. SQLite est un index rapide et reconstructible; elle n’est jamais l’unique copie d’un original.

Chaque asset, texture, matériau et document doit avoir un ID permanent. Un déplacement de fichier ne change jamais cet ID.

## Commandes fondatrices

```powershell
Set-Location app
pnpm.cmd install --frozen-lockfile
pnpm.cmd rebuild-indexes
pnpm.cmd verify-foundation
pnpm.cmd test
pnpm.cmd build
```

Ces commandes se lancent depuis `app/`. Ne modifiez pas les index générés à la main. Modifiez la source autoritaire, puis relancez `pnpm.cmd rebuild-indexes`.

## Périmètre actuel

L’application est locale et mono-utilisateur. Les comptes, la synchronisation cloud et les rôles d’équipe ne font pas partie de cette fondation.
