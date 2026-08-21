# Roadmap Noblesse Studio App

L’ordre est volontaire : aucune sophistication visuelle ne passe avant la solidité de la fondation.

## Phase 0 — Fondation produit

- racine indépendante de tout jeu;
- dépôt Git propre;
- chemins centralisés;
- Vault géré;
- IDs permanents;
- index humains et machine;
- SQLite avec migrations;
- migration de l’état local;
- sauvegarde et procédure de restauration;
- tests et build depuis la nouvelle racine.

**Sortie attendue :** `pnpm.cmd verify-foundation`, tests et build en PASS depuis `app/`.

## Phase 1 — Sécurité desktop

- schémas IPC stricts;
- suppression des chemins directs exposés au renderer;
- contrôle d’origine et de frame;
- permissions Electron refusées par défaut;
- secrets via le coffre du système si des secrets apparaissent;
- signature des versions distribuées.

## Phase 2 — Bibliothèque à grande échelle

- imports sous forme de jobs persistants;
- progression, annulation et reprise;
- versions et dépendances;
- détection de doublons par hash;
- recherche SQLite FTS;
- sauvegardes et tests de restauration.

## Phase 3 — Fluidité des aperçus

- grille virtualisée;
- deux à trois lignes d’overscan;
- chargement uniquement des aperçus visibles;
- workers pour hashes, conversions et miniatures;
- cache mémoire borné;
- découpage des bundles lourds.

## Phase 4 — Intégrations et rendu

- installation UEFN/Unreal transactionnelle;
- adaptateurs Roblox/Blender;
- validation et reprise après échec;
- previews 3D et matériaux après mesure des performances.

## Hors périmètre actuel

Comptes, pages de connexion, rôles, synchronisation cloud et collaboration multi-utilisateur.
