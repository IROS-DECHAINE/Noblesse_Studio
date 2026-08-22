# Décision — synchronisation Google Calendar

Date : 2026-08-22
Statut : adoptée pour la première version

## Contexte

Le calendrier local sait persister les événements et afficher des rappels Windows, mais un PC éteint ne peut pas prévenir un téléphone. Google Drive n’est pas adapté : il stocke des fichiers, pas des événements ni leurs notifications. Google Calendar constitue le pont vers Android, iPhone et iPad.

## Décision

- Noblesse Studio reste l’autorité du calendrier.
- La première version synchronise dans un seul sens : **Noblesse Studio → agenda Google principal**.
- Toute création ou modification locale est copiée avec ses horaires, récurrences, lieu, notes et jusqu’à cinq rappels `popup`.
- Une suppression locale supprime la copie Google correspondante.
- Une panne réseau ne bloque jamais l’écriture locale : l’opération Google reste en attente et peut être relancée par **Synchroniser maintenant**.
- Les modifications faites directement dans Google ne sont pas importées dans cette version. Cette limite évite les conflits et doublons silencieux.

## Connexion et secrets

L’utilisateur crée dans Google Cloud un client OAuth de type **Application de bureau**, après activation de l’API Google Calendar. Noblesse Studio lit le JSON choisi dans le processus principal Electron puis chiffre le client OAuth et le jeton durable avec `safeStorage` Windows.

Le renderer ne reçoit jamais :

- le chemin du fichier OAuth ;
- le `client_secret` ;
- le jeton d’accès ou de renouvellement ;
- le mot de passe Google, qui reste saisi exclusivement chez Google.

L’autorisation utilise OAuth 2, PKCE et une redirection locale temporaire sur `127.0.0.1`. Le périmètre demandé est limité à l’identité e-mail et à `calendar.events`. Les écritures passent par le processus principal Electron.

## Identité et stockage

Chaque élément Noblesse possède un ID permanent. Sa copie Google reçoit un ID déterministe dérivé par SHA-256 et une propriété privée contenant l’ID Noblesse. Les associations, états en attente et dates de synchronisation vivent dans :

```text
data/state/integrations/google-calendar.v1.json
```

Le fichier est écrit atomiquement avec sauvegarde précédente. Les secrets présents dans ce fichier sont chiffrés par le système ; le jeton d’accès temporaire ne touche jamais le disque.

## Déconnexion et retour arrière

La déconnexion efface les secrets et associations locales. Elle ne supprime pas automatiquement les événements déjà copiés dans Google, afin d’éviter une destruction distante implicite. Ils peuvent être supprimés manuellement dans Google Calendar. Reconnecter puis lancer une synchronisation recrée des associations déterministes sans dupliquer volontairement les événements.

Si cette intégration doit être désactivée, retirer sa connexion dans l’interface suffit : le calendrier local, ses rappels Windows et son stockage canonique continuent de fonctionner.

## Limites acceptées

- Google Calendar doit être installé et autorisé à notifier sur chaque téléphone ou tablette.
- Après la copie, les notifications mobiles peuvent fonctionner même si le PC est éteint ; une modification locale ne peut évidemment pas être envoyée tant que le PC n’a pas retrouvé Internet.
- L’application n’envoie pas d’e-mail elle-même. Un futur envoi e-mail exige un fournisseur, un domaine vérifié et un ordonnanceur toujours allumé.
- La synchronisation bidirectionnelle est reportée jusqu’à la définition d’une politique explicite de résolution des conflits.

## Vérification

- projection événement Google et rappels testés sans réseau réel ;
- identifiants et jetons absents du statut public et du stockage en clair ;
- cas hors ligne conservé en état `PENDING` ;
- tests du runtime de rappel et du rendu des horaires concrets ;
- build Electron requis avant livraison.
