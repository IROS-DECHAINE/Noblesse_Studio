# Notes de version

## 1.0.3 — Identité Windows définitive

- identité Windows propre `com.noblesse.studio.desktop`, indépendante de l’ancien prototype Worker Rift ;
- raccourcis Bureau et menu Démarrer reliés directement à `Noblesse Studio.exe` ;
- commande de relance explicite pour l’épinglage dans la barre des tâches ;
- icône runtime incluse dans le paquet et création de la zone de notification tolérante aux erreurs ;
- suppression de l’application d’accueil générique Electron dans les livraisons Windows.

## 1.0.2 — Lancement UEFN par profil

- bouton de lancement sécurisé sous les cartes PrimeBot Rush et Prime Industry ;
- ports MCP dédiés 8000, 8001 et 8002 dans un registre versionné ;
- découverte contrôlée de l’installation UEFN via Epic Games Launcher ;
- anti-doublon, refus des ports occupés et reçus de lancement persistants ;
- statut vert uniquement après validation du projet, du port et des outils MCP ;
- un projet sur le mauvais port reste visible mais ne peut plus recevoir d’asset ;
- décision durable, rollback et déclencheurs de révision documentés.

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
