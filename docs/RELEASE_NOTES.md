# Notes de version

## 1.0.0 — Fondation locale de production

- racine canonique indépendante de Worker Rift ;
- frontière Electron durcie et tous les IPC contrôlés ;
- Vault et index lisibles avec IDs permanents et graphe de dépendances ;
- SQLite reconstructible, migrations v1/v2, recherche, relations et révisions ;
- documents gérés avec versions immuables, suppression récupérable et restauration ;
- imports persistants, reprenables, annulables et idempotents ;
- sauvegardes adressées par contenu, vérifiables et restauration planifiée ;
- Coffre virtualisé avec trois lignes préchargées ;
- modules lourds et moteur 3D chargés à la demande ;
- 172 tests, contrats source, audit de dépendances et CI GitHub ;
- installateur Windows NSIS reproductible et workflow de livraison signée.

Le paquet local sert à la validation. Une publication officielle requiert le certificat Windows dans les secrets GitHub ; le workflow refuse volontairement de livrer sans signature.
