# Décision — Contrats IPC publics pour les assets et les projets

- **Statut :** acceptée et validée
- **Date :** 2026-08-21
- **Propriétaire :** Noblesse Studio App
- **Portée :** réponses `noblesse:assets`, `noblesse:projects` et `noblesse:project-favorite`

## Decision

Les données envoyées du processus principal Electron vers le renderer passent par des contrats publics versionnés et fermés. La version 1 est construite par liste blanche, validée à l’exécution avec JSON Schema 2020-12, puis contrôlée récursivement contre les chemins Windows absolus, UNC, les chemins de périphériques et les URL `file:`.

Les objets métier internes restent complets dans le processus principal. Les aperçus du Vault sont résolus par `assetId`; le renderer ne choisit plus leur chemin. Les projets Unreal n’obtiennent un ID public que lorsqu’un profil approuvé du registre les identifie par leur descripteur. Un projet découvert mais non enregistré est omis de la liste publique et compté explicitement dans les diagnostics.

## Context

L’audit de sécurité a observé 252 valeurs absolues dans les réponses de 133 assets sur 354 : 133 `source_path` et 119 `source_origin`. Les projets publiaient aussi `path`, `folder`, `endpoint`, `processId` et, pour Unreal, un ID calculé depuis le chemin absolu du fichier `.uproject`.

Ces informations sont utiles aux services privilégiés, mais inutiles à React. Leur exposition couple l’interface à la machine de Theo, révèle l’organisation privée des disques et transforme un déplacement de fichier en changement d’identité. Une simple suppression ponctuelle de quelques champs laisserait chaque handler libre de réintroduire le problème.

## Non-negotiables

- Le renderer transmet et reçoit des IDs permanents et des objets bornés.
- Aucun chemin machine absolu, UNC, chemin de périphérique ou URL `file:` ne franchit ces réponses IPC publiques.
- Les objets publics sont construits par liste blanche; aucune projection n’utilise l’opérateur de propagation sur l’objet interne.
- `target_path` peut conserver un identifiant de contenu moteur tel que `/Game/...`; ce n’est pas un chemin de fichier Windows.
- Un déplacement ou renommage de projet enregistré ne modifie pas son ID public.
- Les projets non enregistrés restent visibles dans les diagnostics sans obtenir d’identité inventée.
- Les index du Vault et les modèles internes ne sont pas dégradés pour satisfaire l’interface.
- Toute nouvelle version est additive ou possède une migration explicite; la version 1 ne change pas silencieusement de sens.

## Evidence

- Audit runtime : 354 assets contrôlés, 133 concernés, 252 valeurs absolues exposées.
- `readVaultCatalog()` contient légitimement les champs internes `source_path` et `source_origin`.
- `listUnrealProjects()` dérivait `id` de `fullPath.toLowerCase()` et retournait `path` et `folder`.
- Le renderer utilise des libellés, états, capacités, IDs et identifiants de contenu moteur; il n’utilise aucun chemin machine de ces réponses.
- Le registre `project-connections.v1.json` possède déjà des IDs durables et des descripteurs approuvés permettant de reconnaître les projets Unreal.
- La frontière Electron possède déjà `contextIsolation`, le sandbox, une API preload étroite et un contrôle de frame; la sérialisation publique manquait.
- Electron recommande de valider l’émetteur de chaque message IPC et d’exposer une fonction précise par message : <https://www.electronjs.org/docs/latest/tutorial/security> et <https://www.electronjs.org/docs/latest/tutorial/context-isolation>.
- OWASP recommande de sélectionner explicitement les propriétés retournées et d’imposer un schéma de réponse : <https://owasp.org/API-Security/editions/2023/en/0xa3-broken-object-property-level-authorization/>.
- JSON Schema définit `additionalProperties` pour contrôler les propriétés non déclarées : <https://json-schema.org/understanding-json-schema/reference/object#additional-properties>.

## Options

### Option A — Retrait manuel des champs dans chaque handler

Chaque handler construit localement un objet plus petit sans schéma partagé.

### Option B — Passerelle IPC et DTO publics versionnés

Une passerelle commune impose l’autorisation, la validation d’entrée et la sérialisation de sortie. Des schémas JSON stricts et des projecteurs par liste blanche définissent les réponses publiques.

### Option C — Processus utilitaire comme courtier de données

Un utility process possède les catalogues et expose un protocole sérialisé au processus principal, qui le retransmet au renderer.

## Weighted comparison

Scores : 1 = faible, 5 = excellent. Le total pondéré maximal est 500.

| Critère | Poids | A | B | C |
|---|---:|---:|---:|---:|
| Réduction durable du risque de divulgation | 30 | 2 | 5 | 5 |
| Maintenabilité sur dix ans | 25 | 2 | 5 | 4 |
| Compatibilité et migration contrôlée | 15 | 3 | 5 | 3 |
| Testabilité automatique | 15 | 3 | 5 | 4 |
| Complexité opérationnelle proportionnée | 10 | 5 | 4 | 1 |
| Performance pour 50 000 assets | 5 | 4 | 4 | 3 |
| **Total pondéré** | **100** | **275** | **480** | **390** |

La confiance est élevée pour la sécurité et la maintenabilité, car les trois canaux et leurs consommateurs ont été tracés. Elle est moyenne pour la charge à 50 000 assets, qui reste à mesurer et ne doit pas être déclarée supportée sur cette seule décision.

## Chosen option

L’option B est retenue. Elle ferme la vulnérabilité à la vraie frontière de confiance sans déplacer prématurément les lectures légères dans un autre processus. Elle donne un format contrôlable aux tests, conserve les données complètes côté privilégié et permet une évolution explicite par version.

La version 1 utilise :

- une enveloppe `{ schemaVersion: 1, items: [...] }` pour les assets;
- une enveloppe `{ schemaVersion: 1, items: [...], diagnostics: { unregisteredCount } }` pour les projets;
- un schéma d’entrée fermé pour la modification d’un favori;
- des IDs de registre pour les projets approuvés;
- une URL d’aperçu opaque fondée sur `assetId`, résolue uniquement dans le processus principal.

## Rejected why

- **Option A rejetée :** rapide mais fragile. Chaque futur handler peut oublier un champ, propager un objet interne ou diverger des autres réponses.
- **Option C rejetée maintenant :** elle apporte isolation et capacité de calcul, mais ajoute un protocole, un cycle de vie et des erreurs distribuées sans résoudre mieux la projection publique. Elle reste pertinente lorsque le scan, le hash ou les miniatures deviennent réellement lourds.

## Downstream impact

- Le preload conserve les mêmes fonctions métier, mais reçoit des enveloppes versionnées.
- `desktopApi.js` valide la version et remet uniquement `items` aux composants React.
- Le protocole `noblesse-vault` attend un `assetId`; il charge ensuite la source interne correspondante.
- Le registre des connexions devient l’autorité d’identité des projets Unreal exposés et installables.
- Les services internes Vault, UEFN et Unreal conservent leurs chemins nécessaires; seule leur vue publique change.
- Toute extension de DTO exige un changement de schéma, de projecteur et de test.

## Risks

- Un champ utile oublié peut provoquer une régression visible; les tests renderer et le build couvrent les usages actuels.
- Un projet Unreal non enregistré disparaît de la liste installable; le compteur de diagnostic évite un échec silencieux et l’enregistrement explicite est le remède.
- Une chaîne métier légitime pourrait ressembler à un chemin privé; le garde-fou cible uniquement les formes Windows/UNC/périphérique et `file:`, pas les identifiants `/Game/...`.
- La validation de 354 objets a un coût; elle est linéaire et sera mesurée avant toute affirmation à 50 000 assets.
- Les autres canaux IPC restent à migrer progressivement; ils conservent leurs contrôles actuels et ne sont pas déclarés couverts par cette décision.

## Validation

- Test des projecteurs avec des objets internes contenant tous les champs privés connus.
- Test récursif négatif pour `D:\\...`, UNC, chemin de périphérique et URL `file:`.
- Test positif pour les identifiants de contenu `/Game/...` et le rendu des assets/projets légitimes.
- Test de la passerelle : autorisation avant entrée, entrée avant handler, sortie avant réponse.
- Test d’identité : descripteur Unreal enregistré vers ID stable; projet non enregistré sans ID dérivé du chemin.
- Contrat source automatique pour imposer la passerelle sur les trois canaux et l’URL exacte de la frame.
- Chaîne complète : index, fondations, contrats source, tests, audit production, build et paquet desktop.

Résultats du 2026-08-21 :

- 354 assets projetés; 252 valeurs privées avant sérialisation, 0 après;
- 1 projet Unreal découvert, 1 publié avec l’ID stable `unreal:noblesse_vault_install_qa`, 0 non enregistré et 0 chemin privé;
- 220 tests sur 220;
- intégrité du Vault : 962 fichiers, 0 manquant, 0 hash invalide;
- contrats source, audit production, build Vite et paquet NSIS 1.0.6 : `PASS`;
- `app.asar` contient les contrats, la passerelle, Ajv et l’icône; les tests et `default_app.asar` sont absents;
- exécutables non signés, conformément au blocage de publication déjà connu.

## Rollback

Le rollback restaure les trois handlers directs, l’ancienne résolution d’aperçu par chemin relatif et l’ancienne forme de réponse. Il ne requiert aucune migration de données, car les catalogues et registres internes ne changent pas. Ce rollback réouvre toutefois la divulgation de chemins et ne peut être livré qu’en mesure d’urgence documentée.

## Review trigger

Réviser cette décision si :

- une version 2 de DTO est nécessaire;
- un nouveau canal publie des assets, projets ou chemins locaux;
- le nombre d’assets rend la validation synchrone mesurablement perceptible;
- les scans, hashes ou miniatures migrent vers un utility process;
- Unreal ou une autre plateforme adopte une autorité d’identité différente du registre approuvé;
- un test de sécurité démontre qu’une autre forme de chemin privé traverse encore la frontière.
