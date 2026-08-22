# Noblesse Studio App

Application desktop officielle de Noblesse Studio.

**Racine canonique :** `D:\NO_BLESSE Studio\Noblesse Studio App`

Si vous ne savez pas où chercher, commencez toujours par ce fichier, puis ouvrez [library/INDEX.md](library/INDEX.md).

## Carte simple

| Besoin | Emplacement |
|---|---|
| Initialiser l’IA maîtresse | `MASTER_AI_PROMPT.md` |
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
| Sons | `library/sounds/` |
| Documents | `library/documents/` |
| Originaux gérés du Vault | `library/storage/` |
| Base SQLite locale | `data/database/noblesse-studio.db` |
| Calendrier, finances et favoris | `data/state/` |
| Sauvegardes | `data/backups/` |
| Dépendances entre assets | `library/DEPENDENCIES.md` |
| Architecture | `docs/ARCHITECTURE.md` |
| Décision du lanceur de projets | `docs/DECISION_PROJECT_LAUNCHER_2026-08-21.md` |
| Décision des contrats IPC publics | `docs/DECISION_PUBLIC_IPC_CONTRACTS_2026-08-21.md` |
| Sauvegarde et restauration | `docs/RECOVERY_RUNBOOK.md` |
| Maintenance et livraisons | `docs/MAINTENANCE.md` |
| Notes de version | `docs/RELEASE_NOTES.md` |
| Décision des imports audio | `docs/DECISION_MANAGED_AUDIO_IMPORT_2026-08-22.md` |
| Décision de la corbeille récupérable | `docs/DECISION_RECOVERABLE_LIBRARY_TRASH_2026-08-22.md` |
| Décision des packs 3D modulaires | `docs/DECISION_MANAGED_STATIC_MESH_PACKS_2026-08-22.md` |
| Guide du calendrier et des rappels | `docs/CALENDAR_OPERATIONS.md` |
| Décision Google Calendar | `docs/DECISION_GOOGLE_CALENDAR_SYNC_2026-08-22.md` |
| État de la migration | `docs/MIGRATION_2026-08-21.md` |

## Ce qui fait autorité

1. Les originaux et packs gérés vivent dans `library/storage/`.
2. `library/storage/catalog.json` donne l’identité permanente des éléments.
3. `library/storage/integrity.json` prouve les hashes et les fichiers publiés.
4. Les index `library/*/index.json` et `INDEX.md` sont générés pour l’application, les humains et les IA.
5. SQLite est un index rapide et reconstructible; elle n’est jamais l’unique copie d’un original.

Chaque asset, texture, matériau et document doit avoir un ID permanent. Un déplacement de fichier ne change jamais cet ID.

Dans **Coffre > Assets**, une carte représente un groupe stable et chaque pièce installable possède son propre ID de module. Le premier pack, **NYC Water Tank VFX**, contient un module **Complet** ; une future base en plusieurs morceaux conservera une seule carte avec plusieurs modules sélectionnables. Le Vault préserve le pack natif et ses hashes. Le FBX est la source UEFN canonique de ce premier pack, l’OBJ reste une solution d’échange et le GLB reconstructible sert au prévisualisateur local.

Dans **Coffre > Sons**, le bouton **Ajouter des sons** accepte jusqu’à 200 WAV ou MP3 à la fois. Les titres sont proposés depuis les noms de fichiers et restent modifiables. Un WAV valide est conservé sans réencodage ; un MP3 est converti par le processus principal en WAV PCM 24 bits / 48 kHz. Le lot est persistant, annulable entre deux fichiers et reprenable sans rejouer les succès. Le lecteur permet précédent, suivant et boucle. Aucun chemin privé n’est transmis à l’interface.

Chaque carte du Coffre peut être placée dans une corbeille après vérification du plan et deux confirmations. Les dépendances connues bloquent une suppression dangereuse, les originaux restent préservés et la restauration se fait depuis **Sécurité et récupération**. Les documents utilisent le même parcours utilisateur avec leur corbeille dédiée.

## Commandes fondatrices

```powershell
Set-Location app
pnpm.cmd install --frozen-lockfile
pnpm.cmd rebuild-indexes
pnpm.cmd verify-foundation
pnpm.cmd verify-source
pnpm.cmd test
pnpm.cmd audit --prod --audit-level high
pnpm.cmd build
```

Ces commandes se lancent depuis `app/`. Ne modifiez pas les index générés à la main. Modifiez la source autoritaire, puis relancez `pnpm.cmd rebuild-indexes`.

Pour livrer sur ce PC la version desktop locale réellement utilisée par le raccourci, lancez ensuite :

```powershell
pnpm.cmd desktop:deploy-local
```

Cette commande refuse une validation rouge, produit le paquet Windows, ferme proprement l’ancienne application, conserve le build précédent, remplace `app/build/`, vérifie l’exécutable et relance Noblesse Studio. Ce canal local ne remplace pas la publication signée.

La section **Réglages** de l’application permet de créer et vérifier les sauvegardes, puis de reprendre ou annuler les imports interrompus. Une restauration complète se fait application fermée avec la procédure de [récupération](docs/RECOVERY_RUNBOOK.md).

## Périmètre actuel

L’application est locale et mono-utilisateur. Les comptes, la synchronisation cloud et les rôles d’équipe ne font pas partie de cette fondation.
