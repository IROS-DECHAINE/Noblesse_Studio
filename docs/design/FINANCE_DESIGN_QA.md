# Finances — fidélité visuelle et QA

## Références

- Concept généré et retenu : `design/noblesse-studio-finances-concept-v02.png`
- Rendu desktop final : `design/noblesse-studio-finances-render-v01.png`
- Rendu mobile final : `design/noblesse-studio-finances-mobile-render-v01.png`
- Formulaire mobile final : `design/noblesse-studio-finances-mobile-form-render-v01.png`

Le concept et les rendus ont été inspectés ensemble avec `view_image`.

## Méthode de capture

Le Browser intégré Codex a été piloté avec son API Playwright. Un bundle QA statique local a permis d’injecter en mémoire le contrat `studioApi` sans écrire de fausse donnée dans l’application. L’état initial contenait uniquement la dépense canonique GPT Pro de 100 EUR. La dépense Adobe de 249,90 EUR utilisée pour le test d’interaction n’a jamais été livrée ni persistée dans le projet.

Cette méthode headless a été choisie pour respecter le verrou absolu du projet interdisant de contrôler une fenêtre Windows sans autorisation immédiate. Viewports contrôlés : 1536 × 1024 et 390 × 844. Les artefacts QA temporaires ont été supprimés après capture.

## Parcours critique exercé

1. Ouvrir Finances et charger le registre canonique.
2. Saisir montant, date, libellé, projet, catégorie, fournisseur et note.
3. Préparer la dépense.
4. Relire le plan immuable.
5. Confirmer l’écriture.
6. Vérifier le reçu, les KPI, le graphe et la nouvelle ligne.
7. Tester les périodes 3 mois et 12 mois, puis l’information bancaire.

Résultat : le total passe de 100 EUR à 349,90 EUR et de 1 à 2 mouvements dans la session QA. Console fraîche : aucune erreur et aucun avertissement. Sur mobile, `scrollWidth 375 <= innerWidth 390` : aucun débordement horizontal.

## Comparaison concept / rendu

| Point | Verdict | Observation |
| --- | --- | --- |
| Hiérarchie générale | Fidèle | Sidebar, titre, action principale, KPI, graphe, registre, formulaire et bloc banque conservent le même ordre. |
| Grille desktop | Fidèle | Quatre KPI sur une ligne, graphe à gauche et formulaire à droite, largeur et densité cohérentes avec le reste de Noblesse Studio. |
| Langage visuel | Fidèle | Fond quartz sombre, panneaux bleu nuit, bordures fines, bleu pour les recettes et or pour les dépenses. |
| Graphe | Fidèle | Douze mois, barre réelle de juin à 100 EUR ; capture prise après 1,8 s, hauteur mesurée à 293 px. |
| Provenance | Amélioré | La ligne GPT Pro affiche `Documenté`; les saisies futures affichent `Déclaré`, sans prétendre être rapprochées par la banque. |
| Saisie | Amélioré | Le bouton direct du concept devient `Préparer`, puis `Confirmer`, afin d’éviter une écriture accidentelle. |
| Banque | Honnête | `Non connectée` et bouton informatif ; aucune fausse connexion ni collecte de secret. |
| Mobile | Adapté | Navigation compacte, KPI en grille 2 × 2, graphe et tableau empilés, formulaire pleine largeur. |

## Différences de copie assumées

- `Enregistrer la dépense` devient `Préparer la dépense`, puis `Confirmer l’écriture` : le registre exige une revue explicite.
- `Connecter la banque` devient `En savoir plus` tant qu’aucun connecteur sécurisé n’existe.
- `Écritures documentées uniquement` devient `Registre local · couverture partielle` : une saisie manuelle est réelle mais seulement déclarée.
- `Solde du registre` précise qu’il s’agit de recettes moins dépenses enregistrées, pas du solde bancaire global.

## Validation technique

- 11/11 tests Finance réussis.
- 50/50 tests globaux réussis.
- Build Vite de production réussi.
- Projection synthétique de 100 000 mouvements sur dix ans : 10 buckets annuels en 152 ms sur la machine de QA.
