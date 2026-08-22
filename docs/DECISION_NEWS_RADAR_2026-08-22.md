# Décision — Radar gaming officiel à la demande

## Decision

Au 22 août 2026, Noblesse Studio adopte un Radar gaming local chargé uniquement à la demande par le processus principal Electron, limité à des sources officielles autorisées et soutenu par un cache reconstructible de courte durée. Cette décision doit être enregistrée avant la sauvegarde globale sur `main`.

Propriétaire : `Codex`
Statut : `ACCEPTÉ`
Date : `2026-08-22`

## Context and deadline

Theo veut consulter les informations Unreal Engine, Roblox Studio et les incidents Epic utiles au studio sans transformer l’accueil en fil d’actualité permanent.

La décision est requise avant la sauvegarde globale du produit sur `main` le 22 août 2026.

## Non-negotiables

Les contraintes sont :

- conserver une application locale mono-utilisateur, sans serveur ni télémétrie ;
- ne jamais donner au renderer un accès réseau ou système privilégié ;
- accepter uniquement HTTPS et des domaines officiels explicitement autorisés ;
- borner la taille, le temps de réponse et le nombre d’éléments téléchargés ;
- continuer à afficher honnêtement le dernier état connu lorsqu’une source est indisponible ;
- ne pas activer X/Twitter sans compte développeur, budget et décision explicites.

Inconnues actuelles : stabilité à long terme des formats RSS publics et coût futur éventuel d’une source authentifiée.

## Evidence

- `app/electron/lib/newsRadarService.mjs` contient trois sources fermées : Unreal Engine, Roblox DevForum et Epic Games Status.
- Chaque requête expire après 10 secondes et refuse une réponse supérieure à 2 Mio.
- Les URL publiées sont limitées à HTTPS et aux hôtes propres à chaque source.
- Le cache `news-radar.v1.json` est reconstructible, écrit atomiquement avec une sauvegarde et réutilisé pendant dix minutes.
- Le renderer ne reçoit qu’un instantané public borné via `noblesse:news-radar:snapshot`.
- `app/electron/lib/newsRadarService.test.mjs` prouve le filtrage des domaines, la lecture des incidents et la réutilisation du cache.
- La chaîne complète du 22 août 2026 valide 303 tests, les contrats source, l’intégrité du Vault et le build Windows 1.0.16.

## Options

Notes de 1 à 5. Les poids totalisent 100 ; le total maximal est 500.

| Critère | Poids | A — Main Electron, sources fermées et cache | B — Requêtes directes du renderer | C — Agrégateur cloud Noblesse |
|---|---:|---:|---:|---:|
| Sécurité et validation | 30 | 5 | 1 | 3 |
| Respect du modèle local | 20 | 5 | 2 | 1 |
| Résilience et maintenance | 15 | 4 | 2 | 4 |
| Performance et sobriété | 15 | 4 | 3 | 4 |
| Valeur lisible pour Theo | 10 | 4 | 4 | 5 |
| Réversibilité | 10 | 5 | 4 | 2 |
| **Total pondéré** | **100** | **460** | **225** | **300** |

Confiance : `observée` pour A et B grâce au code et aux tests ; `inférée` pour C, puisqu’aucun serveur Noblesse n’existe dans le périmètre actuel.

## Chosen option

L’option A est retenue. Elle respecte la frontière Electron existante, limite les données non fiables avant l’IPC, reste fonctionnelle en cas de panne partielle et peut être retirée sans migration métier.

L’option B est rejetée : elle déplacerait le contrôle des domaines et du réseau dans l’interface, dépendrait de CORS et affaiblirait la frontière de sécurité. L’option C est rejetée : elle introduirait serveur, exploitation distante et collecte réseau alors que le produit reste volontairement local.

## Downstream impact

- Le processus principal possède la collecte, la validation, le cache et les erreurs techniques.
- Le preload expose une capacité précise ; l’interface ne choisit ni URL ni domaine.
- L’accueil reste léger : aucun polling permanent et aucune actualisation avant l’ouverture du Radar.
- Les préférences de sujets sont locales et ne quittent pas la machine.
- Ajouter Roblox, Unreal ou une autre plateforme exige un adaptateur/source autorisée distincte et des tests associés.
- Le cache ne devient jamais une source métier autoritaire et peut être supprimé puis reconstruit.

## Risks and mitigations

- **Changement de format d’un flux** : l’échec reste isolé à sa source, l’ancien cache est conservé et les parseurs sont testés.
- **Contenu hostile dans un flux officiel compromis** : texte nettoyé et borné, HTML retiré, URL HTTPS revalidée par allowlist.
- **Réponse lente ou volumineuse** : délai de 10 secondes, limite de 2 Mio et nombre maximal d’éléments.
- **Information périmée** : l’état `stale`, l’heure d’actualisation et l’erreur de source restent visibles.
- **Coût ou authentification futurs** : aucun connecteur payant n’est activé implicitement.

Pré-mortem : si le Radar devient bruyant, lent ou peu fiable, la cause la plus probable sera une évolution des flux ou une multiplication des sources. La mitigation consiste à conserver une liste courte, mesurer chaque source et la désactiver indépendamment plutôt qu’à assouplir les limites globales.

## Validation

Signaux de validation : zéro requête avant ouverture, trois sources au maximum, aucun lien hors allowlist, cache réutilisé pendant dix minutes, panne partielle explicite et aucun secret requis.

## Rollback

Rollback : retirer le bouton et le canal IPC, arrêter l’initialisation du service, puis supprimer le cache sous `data/state/integrations/`. Aucun original du Vault, événement calendrier ou document n’est affecté.

## Review trigger

Réexaminer cette décision si une source impose une authentification, devient payante, change de domaine ou de format, si une veille automatique en arrière-plan est demandée, si un serveur/cloud est autorisé, ou si des mesures montrent que les limites actuelles nuisent à la stabilité de l’application.
