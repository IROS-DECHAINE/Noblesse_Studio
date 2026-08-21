# Projets — Roadmap interactive v2

## Résultat livré

- L’en-tête, le bouton de planning et les trois grandes cartes restent inchangés.
- Le rail est maintenant un vrai sélecteur : slider déplaçable, boutons précédent/suivant, tactile, molette/trackpad et clavier.
- Cliquer une carte sélectionne le projet, aligne sa carte, ouvre sa roadmap et place le focus sur son titre.
- La première étape non validée devient automatiquement « À faire maintenant » et apparaît aussi dans l’en-tête comme prochaine étape.
- Chaque bulle reste librement cliquable, réversible et reçoit un retour visuel bref.
- Le dernier projet consulté est restauré au retour dans l’onglet.
- L’ajout d’un projet reste piloté par une seule entrée dans `src/data/projectRoadmaps.js`.

## Architecture v2

`portfolioProjects` porte les métadonnées et jalons stables. `getRoadmapSnapshot` calcule la progression, la prochaine étape et le cas terminé sans division invalide, y compris pour une future roadmap vide.

Le stockage `noblesse-studio.project-roadmaps.v2` utilise une enveloppe versionnée :

- `schemaVersion`
- `selectedProjectId`
- `overrides`
- `updatedAt`

Seules les modifications manuelles sont sauvegardées. Les nouvelles valeurs validées par le canon peuvent donc faire évoluer les défauts sans être écrasées par un ancien snapshot complet. Les données v1 sont relues puis migrées automatiquement. Un stockage indisponible conserve une session fonctionnelle et l’interface l’indique.

Une icône inconnue reçoit un fallback, les projets/étapes inconnus ne mutent rien et `validatePortfolioProjects` permet d’auditer un futur registre étendu.

## Sources relues

- `docs/CURRENT_CANON_INDEX.md`
- `D:/NO_BLESSE Studio/Roblox/GAMES/PrimeIndustry/docs/CURRENT_STATE.md`
- `D:/NO_BLESSE Studio/Roblox/GAMES/PrimeIndustry/HANDOFF.md`
- `D:/NO_BLESSE Studio/Roblox/GAMES/PrimeIndustry/PROJECT_MANIFEST.json`
- `D:/NO_BLESSE Studio/Roblox/GAMES/HowManyBoxesCanYouCarry/HANDOFF.md`
- Canons PrimeBot référencés par l’index courant du workspace

Les libellés de phase des cartes restent ceux de l’écran accepté. Les résumés et jalons de roadmap reflètent l’état canon relu.

## Fidelity ledger

| Point inspecté | Référence acceptée | Rendu v2 | Décision |
| --- | --- | --- | --- |
| En-tête et CTA | Titre, description et planning de la capture v1 | Même copie, mêmes positions et proportions | Conforme |
| Grandes cartes | Trois cartes, miniatures et métriques inchangées | Contenu et géométrie conservés | Conforme |
| Rail | Indicateur visuel non interactif en v1 | Range réel + sélection exacte + « Projet n sur total » | Amélioration intentionnelle demandée |
| Roadmap | Frise horizontale et bulles vertes/grises | Même structure, étape active bleue/dorée et prochaine action visible | Amélioration intentionnelle |
| Typographie | Descriptions secondaires peu contrastées | 12 px et contraste renforcé sans changer la hiérarchie | Écart corrigé |
| Mobile | Frise verticale v1 | Même anatomie, slider visible, focus et prochaine étape conservés | Conforme et renforcé |
| Mouvement | Transitions sobres | Retour de validation bref, neutralisé en mouvement réduit | Conforme |

Diff de copie au-dessus de la ligne de flottaison : aucun changement dans l’en-tête ni les cartes. Le seul changement intentionnel est `3 projets` → `Projet 1 sur 3` afin de rendre le sélecteur explicite. Dans la roadmap, `À faire` devient `À faire maintenant` pour la prochaine action et `À venir` pour les jalons suivants.

## Vérifications

- Suite complète : 72 tests réussis, 0 échec.
- Build Vite de production : réussi, 2 747 modules transformés.
- Capture native desktop : 1536 × 1024.
- Capture mobile : 390 × 844, aucune largeur de page excédentaire.
- Slider : valeur `3` sélectionne How Many et met à jour carte, titre et position.
- Flèche suivante : PrimeBot → Prime Industry, slider `2`, roadmap mise à jour.
- Clavier : `ArrowLeft` au premier projet boucle vers How Many, empêche le scroll navigateur et conserve le focus.
- Retour Accueil → Projets : Prime Industry reste sélectionné depuis l’enveloppe v2.
- Clic carte : focus transféré au titre de la roadmap et panneau révélé.
- Clic Boulangerie : `false → true`, prochaine étape mise à jour vers `Noyau entreprise`, seul override manuel persisté.
- Console navigateur : aucune erreur sur les scénarios desktop et mobile.
- Accessibilité : liste nommée, boutons pressables, slider nommé, région roadmap, progression native et annonces live.

Le navigateur intégré n’était pas exposé dans cette session et le CLI Playwright n’était pas disponible localement. La vérification de secours a utilisé Chrome headless piloté par DevTools sur le build Vite local, puis `view_image` sur la référence et chaque rendu final.

## Preuves visuelles

- Référence acceptée : `design/noblesse-studio-projects-roadmap-v01.png`
- Avant toute roadmap : `design/noblesse-studio-projects-before-roadmap-v01.png`
- Desktop v2 : `design/noblesse-studio-projects-roadmap-v02.png`
- Prime Industry v2 : `design/noblesse-studio-projects-roadmap-industry-v02.png`
- Mobile v2 : `design/noblesse-studio-projects-roadmap-mobile-v02.png`

Aucun écart matériel réparable ne reste sur le module Projets.
