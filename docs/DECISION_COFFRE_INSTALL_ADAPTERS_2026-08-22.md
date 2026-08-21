# Decision — Installation commune du Coffre par adaptateurs typés

Propriétaire : Codex
Statut : ACCEPTED
Date : 2026-08-22
Échéance : livraison locale 1.0.12

## Decision

Toutes les catégories du Coffre partagent la même zone de destination et d’action, mais chaque élément exige une capacité d’installation typée et un adaptateur propre à son format.

## Context

L’installateur était visible dans Matières, tandis que Sons utilisait seulement un lecteur. Assets et VFX doivent conserver la même expérience lorsque leurs catalogues seront alimentés. Copier le code matière vers chaque catégorie ferait toutefois croire qu’une recette shader, un WAV, un mesh et un système Niagara suivent le même protocole.

## Non-negotiables

- le renderer transmet seulement un ID d’asset, un ID de projet et une intention bornée ;
- un état vert générique ne suffit pas : le projet doit annoncer la capacité du type sélectionné ;
- aucun chemin privé ou exécutable ne traverse l’IPC ;
- un original du Vault reste immuable ; une copie de handoff est reconstructible et hashée ;
- l’application n’annonce jamais « installé » avant preuve de création et de sauvegarde dans le moteur ;
- les règles UEFN, Unreal et Roblox restent dans des adaptateurs séparés.

## Evidence

- l’installateur matière existant prouve la recette, les références, la sauvegarde et l’état non modifié avant succès ;
- Epic documente la création d’un `SoundWave` par import d’un WAV dans UEFN : <https://dev.epicgames.com/documentation/en-us/fortnite/importing-custom-audio-in-unreal-editor-for-fortnite> ;
- le connecteur MCP actuel expose `TextureTools.import_file`, `StaticMeshTools.import_file`, la création de dossiers et la navigation du Content Browser, mais aucun importeur audio ;
- `SetContentBrowserPath` et `AssetTools.create_folder` permettent de préparer précisément la destination sans focaliser, fermer ou redémarrer UEFN.

## Options

Critères pondérés : exactitude et sécurité 35, expérience utilisateur 20, maintenance sur dix ans 20, vitesse de livraison 10, réversibilité 10, confiance des preuves 5. Total : 100.

| Option | Exactitude 35 | UX 20 | Maintenance 20 | Livraison 10 | Réversibilité 10 | Preuve 5 | Score / 500 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Copier l’installateur matière partout | 1 | 5 | 1 | 4 | 2 | 1 | 220 |
| Zone commune + capacités typées + handoff audio honnête | 5 | 4 | 5 | 4 | 5 | 5 | 470 |
| Attendre un futur importeur Epic avant toute interface | 5 | 1 | 3 | 1 | 5 | 5 | 340 |

## Chosen option

La deuxième option est retenue. Elle donne immédiatement la même architecture visuelle à toutes les catégories, empêche la sélection d’un projet dépourvu de l’adaptateur nécessaire et permet un workflow audio sûr aujourd’hui. La duplication perd car elle crée de faux succès. Le report complet perd car il laisse l’expérience incohérente alors qu’un handoff officiel et explicite est possible.

Pour UEFN audio, l’action prépare `/<Mount>/NoblesseStudio/<Pack>/Audio`, copie le WAV dans `data/state/install-handoffs/` sous un nom Unreal stable, vérifie son hash, positionne le Content Browser et ouvre l’Explorateur. Le reçu reste `AWAITING_USER_IMPORT` jusqu’au glisser-déposer humain.

## Downstream impact

- maintenant : Matières et Sons partagent le contrôle de destination et l’action ;
- prochain catalogue : Assets et VFX réutilisent le contrôle, mais n’activent le bouton qu’après ajout de leurs adaptateurs et preuves propres ;
- futur : un importeur audio officiel ou signé peut remplacer le handoff sans modifier l’interface ni le contrat renderer ;
- opérations : les copies de handoff vivent dans les données locales reconstructibles, jamais dans Git ou dans SQLite comme source unique.

## Risks

- confusion entre « prêt » et « installé » : wording, mode IPC et reçu distincts ;
- mauvais projet UEFN : mount et profil vérifiés avant préparation ;
- collision de noms : préfixe, titre normalisé et suffixe d’ID permanent ;
- copie corrompue : SHA-256 comparé au manifeste ;
- évolution MCP : découverte des outils à chaque session et refus par défaut si une commande manque.

## Validation

- tests du nom, du hash, du mauvais type, du mount et des commandes MCP bornées ;
- test des capacités par type dans la session et le DTO public ;
- test de l’interface : un projet matière sans capacité audio reste désactivé ;
- chaîne `rebuild-indexes`, fondation, contrats source, tests, audit, build et paquet desktop ;
- preuve humaine restante : glisser un WAV préparé dans le dossier UEFN ouvert et confirmer la création du `SoundWave`.

## Rollback

Retirer l’adaptateur de handoff et remettre les sons en lecture seule. Les originaux du Vault ne changent pas. Les copies sous `data/state/install-handoffs/` peuvent être régénérées et ne doivent jamais être confondues avec des originaux métier.

## Review trigger

Réviser cette décision lorsque le connecteur Epic expose un importeur audio vérifiable, avant le premier adaptateur Unreal ou Roblox audio, et avant l’activation d’un premier mesh ou VFX installable.
