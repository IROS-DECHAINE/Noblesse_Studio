# Migration prototype → produit — 21 août 2026

## But

Sortir définitivement l’application de :

`D:\DON'T_TOUCH_ONLY_HUMAIN\THEO\WORKER_RIFT\_AI_WORKSPACE\library\uefn_vault\catalog-app`

vers :

`D:\NO_BLESSE Studio\Noblesse Studio App`

## Méthode sûre

- L’ancien emplacement reste intact pendant toute la migration.
- La migration commence par une copie contrôlée, jamais par un déplacement destructif.
- `node_modules`, `dist`, `release-*` et les aperçus publics dupliqués ne sont pas copiés.
- Le Vault géré est copié dans `library/storage/`.
- L’état local existant est copié dans `data/state/` et `data/runtime/`.
- Les index et SQLite sont reconstruits dans la nouvelle racine.
- L’ancien emplacement ne pourra être retiré qu’après validation humaine.

## Sources recensées

| Élément | Ancien emplacement | Nouvelle destination |
|---|---|---|
| Code Electron/React | `...uefn_vault\catalog-app` | `Noblesse Studio App\app` |
| Vault géré | `...uefn_vault\app-library` | `library/storage` |
| Documents indexés | `D:\NO_BLESSE Studio\Documents` | restent au niveau entreprise; index dans `library/documents` |
| Finances | `%APPDATA%\Noblesse Studio\finance` | `data/state/finance` |
| Calendrier | `%APPDATA%\Noblesse Studio\calendar` | `data/state/calendar` |
| Favoris UEFN | `%APPDATA%\Noblesse Studio\uefn-project-favorites.v1.json` | `data/state/` |
| localStorage Electron | `%APPDATA%\Noblesse Studio` | `data/runtime/electron-user-data` |
| Ancien profil historique | `%APPDATA%\noblesse-vault-catalog` | sauvegarde de migration |

## Portes de validation

- [x] La nouvelle racine existe.
- [x] Le code possède son propre dépôt Git.
- [x] Le Vault possède un statut `PASS`.
- [x] Tous les IDs de catalogue sont uniques.
- [x] Les index assets, textures, matériaux et documents correspondent au catalogue.
- [x] SQLite contient les mêmes totaux.
- [x] Les tests passent.
- [x] Le build de production passe.
- [x] L’application démarre depuis la nouvelle racine.
- [x] Theo valide la structure avant toute suppression de l’ancien emplacement.

## Preuves actuelles

- Racine : `D:\NO_BLESSE Studio\Noblesse Studio App`
- Catalogue : 354 IDs uniques
- Textures : 119
- Matériaux : 235
- Assets génériques : 0, aucun n’existe encore dans le catalogue
- Documents : 17
- Intégrité : 962 fichiers contrôlés, 0 manquant, 0 hash invalide
- SQLite : 354 éléments de bibliothèque, 17 documents, 5 relations, 17 révisions de référence, migrations de schéma v1 et v2
- Tests : 172/172 en PASS après durcissement de production
- Build Vite de production : PASS
- Racine lisible : code et fichiers techniques regroupés sous `app/`; seuls `README.md`, `AGENTS.md` et `.gitignore` restent comme fichiers de premier niveau

## État

La migration de fichiers, données, index et raccourci est validée automatiquement et visuellement. L’ancien emplacement reste conservé comme preuve historique ; aucune suppression n’est autorisée implicitement.
