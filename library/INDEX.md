# Bibliothèque Noblesse Studio

Point d’entrée humain et IA de la bibliothèque locale. Généré le 2026-08-21T18:50:11.765Z.

| Domaine | Nombre | Index lisible | Index machine |
|---|---:|---|---|
| Assets | 0 | [assets/INDEX.md](assets/INDEX.md) | [assets/index.json](assets/index.json) |
| Textures | 119 | [textures/INDEX.md](textures/INDEX.md) | [textures/index.json](textures/index.json) |
| Matériaux | 235 | [materials/INDEX.md](materials/INDEX.md) | [materials/index.json](materials/index.json) |
| Documents | 17 | [documents/INDEX.md](documents/INDEX.md) | [documents/index.json](documents/index.json) |

Les relations entre éléments sont consultables dans [DEPENDENCIES.md](DEPENDENCIES.md) et [dependencies.json](dependencies.json).

## Règles d’autorité

- Les originaux gérés restent sous `library/storage/`.
- Chaque entrée possède un ID permanent; un déplacement ne doit jamais changer cet ID.
- `library/storage/catalog.json` et `integrity.json` prouvent l’état publié du Vault.
- La base SQLite est un index reconstructible, jamais l’unique copie d’un original.
- Les aperçus et caches sont reconstructibles et ne font pas autorité.
