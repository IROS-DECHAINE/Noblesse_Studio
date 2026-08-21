# Sécurité de Noblesse Studio

Ce dépôt contient une application locale privée. Ne publiez jamais de clé API, mot de passe, jeton, certificat, fichier de signature ou donnée personnelle dans Git.

## Signaler un problème

N’ouvrez pas d’issue publique pour une vulnérabilité. Utilisez l’onglet **Security** du dépôt GitHub et créez un signalement privé. Incluez la version de l’application, l’impact observé et les étapes minimales de reproduction, sans joindre de donnée réelle du studio.

## Versions prises en charge

Seule la dernière version stable publiée et signée est prise en charge. Une mise à jour de sécurité importante déclenche une livraison prioritaire.

## Règles de livraison

- les tests, les contrats source, l’audit des dépendances et la construction doivent réussir ;
- une livraison Windows requiert le certificat configuré dans les secrets GitHub ;
- les données sous `data/` et les originaux sous `library/storage/` ne sont jamais inclus dans Git ni dans l’installateur ;
- les secrets applicatifs devront utiliser le stockage sécurisé du système d’exploitation, jamais un fichier JSON en clair.
