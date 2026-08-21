# Calendrier Noblesse Studio — fidelity ledger

- Date de validation : 2026-08-21
- Méthode : Codex In-app Browser sur la build Vite de production
- Viewport natif validé : **1536 × 1024**, ratio de pixels 1
- Concept de référence : `noblesse-studio-calendar-week-day-concept-v01.png`
- Capture d’implémentation semaine/jour : `calendar-qa-desktop-1536x1024.png`
- Capture d’implémentation mois complet : `calendar-qa-month-1536x1024.png`

## Comparaison concept / implémentation

| Point | Concept | Implémentation validée | Verdict |
|---|---|---|---|
| Shell studio | Sidebar sombre fixe, Calendrier sélectionné | Même sidebar, même sélection bleue, même famille d’icônes | Fidèle |
| Barre de période | Précédent, Aujourd’hui, Suivant, semaine courante | Même ordre et même densité ; ajout du bouton explicite « Activer les rappels » | Fidèle, capacité réelle ajoutée |
| Mois complet | Extension demandée dans le même shell sombre | 42 jours stables, lundi–dimanche, jours adjacents atténués, mois entier visible à 1536 × 1024 | Fidèle au système, extension fonctionnelle demandée |
| Navigation existante | Modules studio conservés | Accueil, Projets, Coffre, Fortnite, Roblox, Documents, Finances, puis Calendrier | Aucun module retiré ni déplacé |
| Densité mensuelle | Points/compteurs et périodes longues demandés | Compteur rouge par jour, aperçu horaire, barres continues par projet sur chaque semaine, débordement `+ N autres` | Conforme à la demande |
| Semaine lundi–dimanche | Sept cellules, date sélectionnée bleue, compte numérique | Sept vraies dates, focus clavier visible, compteur `0…9+`, état Aujourd’hui séparé | Fidèle et plus accessible |
| Rail multi-jours | Ligne « Toute la journée » avec barre projet | Rail présent, placement par colonnes/lignes, couleur projet et superposition en lanes | Fidèle ; les données QA montrent une journée, le span multi-jours est couvert par test automatisé |
| Planning 00:00–24:00 | Grille verticale, blocs horaires, ligne rouge actuelle | 25 repères, événement positionné/minuté, chevauchements en colonnes, auto-scroll autour de l’heure actuelle | Fidèle, comportement temps réel ajouté |
| Agenda à venir | Dates groupées, horaires et projets | Dates groupées, tâches cliquables/terminables, projets, récurrences futures | Fidèle et fonctionnel |
| Palette | Bleu PrimeBot, or Prime Industry, quartz sombre | Tokens projet distincts, contraste/focus cohérents, rouge réservé au présent et au destructif | Fidèle |
| Éditeur | Drawer/modal complet | Dialogue latéral piégé au clavier : type, projet, journée entière, dates, fuseau, récurrence, lieu, notes, 5 rappels | Fidèle au second concept |
| Suppression | Action destructive | Deux clics : « Supprimer » puis « Confirmer la suppression » | Plus sûr que le concept |

## Diff de copy

- Conservé : `Calendrier`, `Aujourd’hui`, `Nouvel événement`, `Toute la journée`, `À venir`, jours `LUN` à `DIM`.
- Ajout demandé : `Mois`, `Semaine` et l’aide d’interaction sous la grille mensuelle.
- Ajout nécessaire : `Activer les rappels` / `Rappels actifs`, pour respecter le consentement explicite aux notifications.
- Ajout nécessaire : `Organisation du studio`, pour raccorder la page au système éditorial existant.
- L’e-mail apparaît uniquement dans l’éditeur sous la forme `E-mail — connexion requise`; aucune promesse d’envoi n’est faite sans backend.
- Les exemples statiques de mai 2025 du concept ne sont pas livrés : dates, heures, compteurs et éléments sont issus du vrai calendrier.

## Vérifications Browser

- création et persistance d’un rendez-vous récurrent PrimeBot avec deux rappels ;
- création et persistance d’une deadline toute la journée ;
- projection de trois occurrences hebdomadaires dans l’agenda ;
- ouverture de l’éditeur depuis le bloc horaire ;
- armement de la confirmation de suppression sans supprimer la donnée QA ;
- déplacement clavier vendredi → samedi → vendredi avec mise à jour du panneau jour ;
- viewport 1536 × 1024 et capture réelle ;
- mois complet : 42 dates, changement août → septembre, sélection d’un jour et détail inférieur synchronisé ;
- conservation de la vue semaine : commutateur pressé et sept jours rendus ;
- responsive 390 × 844 : aucun débordement horizontal du document, grille mensuelle scrollable dans sa propre surface ;
- aucune erreur ni alerte console après les interactions.

## Déviations acceptées

1. Le panneau jour se place automatiquement autour de l’heure actuelle, alors que le concept statique commence à 00:00. Cela évite un long scroll quotidien tout en conservant les 24 heures.
2. Le bouton de notifications est absent du concept mais obligatoire pour un consentement honnête.
3. Le concept montre plus d’événements fictifs ; la capture QA utilise uniquement deux éléments créés par le parcours réel.
4. L’e-mail reste désactivé jusqu’à l’existence d’un fournisseur, d’un domaine vérifié et d’un service toujours allumé.
5. Le concept de référence illustre la semaine/jour ; la vue mois est une extension explicitement demandée, réalisée avec exactement les mêmes tokens, contrôles, couleurs projet et modèle de sélection.

Conclusion : **implémentation fidèle**, avec uniquement des écarts motivés par les données réelles, la sécurité et l’accessibilité.
