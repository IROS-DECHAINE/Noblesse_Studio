# Noblesse Studio — Documents design spec

- Date : 2026-08-21
- Statut : implémentation de référence

## Objectif

Rendre les canons du studio accessibles en trois gestes maximum : choisir le studio ou le jeu, choisir le document, le lire. La rubrique accepte aussi les images, vidéos, sons et formats bureautiques, sans transformer l’écran en gestionnaire de fichiers complexe.

## Références visuelles

- écran principal : `noblesse-studio-documents-concept-v01.png` ;
- ajout : `noblesse-studio-documents-add-modal-concept-v01.png` ;
- identité existante : `noblesse-studio-projects-roadmap-v01.png`.

La palette, la barre latérale de 226 px, les bordures, les icônes et la densité restent celles de l’application actuelle. Le seul fond clair est la page de lecture Markdown, volontairement proche d’un PDF imprimé.

## Architecture visible

1. En-tête court : `Documents` et action primaire `Ajouter`.
2. Rail de quatre destinations : `Noblesse Studio`, `PRIMEBOT RUSH`, `PRIME INDUSTRY`, `HOW MANY BOX`.
3. Liste compacte et scrollable des documents du projet sélectionné.
4. Lecteur principal : Markdown mis en page, PDF natif, image, vidéo, audio ou état de format externe.
5. Actions secondaires : `Ouvrir`, `Afficher dans le dossier`, `Supprimer`.

La liste est préférée à une grille : elle garde une densité stable lorsque la bibliothèque grandit. Aucun KPI, tag décoratif, faux chiffre ou panneau sans fonction n’est autorisé.

## Copie autorisée au premier écran

`Documents`, `Ajouter`, les quatre noms de destinations, les titres et métadonnées réels des fichiers, `Ouvrir`, `Afficher dans le dossier`, `Supprimer`, `Aucun document`, `Ajouter le premier document`.

## États

- destination sélectionnée : bordure bleu électrique et contraste renforcé ;
- document sélectionné : ligne bleue discrète ;
- bibliothèque vide : une phrase et une seule action ;
- document manquant : lecture bloquée, ouverture externe désactivée ;
- chargement/erreur : message court dans le lecteur, sans overlay plein écran ;
- suppression : confirmation explicite avec le titre exact ;
- import : destination, zone de dépôt, choix de fichiers, liste des fichiers et action finale.

## Aperçus

- Markdown/TXT : rendu React sûr, sans HTML brut, avec titres, paragraphes, listes, citations, tableaux et blocs de code ;
- PDF : lecteur Chromium via protocole local borné par identifiant ;
- images : ajustement contenu, jamais de crop destructif ;
- vidéo/audio : contrôles natifs ;
- formats Office ou inconnus : conservation et ouverture par l’application système.

## Stockage et sécurité

- les documents ajoutés vivent hors de l’exécutable et hors de `public/`, `dist/` et `release/` ;
- les canons existants sont indexés comme liens en lecture, sans créer une seconde vérité ;
- les imports gérés sont copiés sous une arborescence adressée par SHA-256 ;
- un manifeste JSON versionné existe par document ;
- le renderer ne reçoit jamais de chemin local, seulement un identifiant ou un jeton de sélection opaque ;
- la suppression est planifiée, vérifiée puis réversible via `.trash` ;
- les exécutables, scripts et raccourcis sont refusés ;
- les aperçus passent par un protocole Electron dédié résolu côté processus principal.

## Responsive

- ≥ 1180 px : quatre miniatures puis liste et lecteur côte à côte ;
- 681–1179 px : rail horizontal et lecteur dominant ;
- ≤ 680 px : navigation compacte existante, rail scrollable, liste puis lecteur empilés ;
- aucune largeur ne doit produire un scroll horizontal de page.

## Parcours de validation

`Documents -> choisir PRIMEBOT RUSH -> choisir un canon -> lire -> Ajouter -> choisir des fichiers -> importer -> ouvrir -> afficher dans le dossier -> supprimer avec confirmation`.

La build n’est pas suffisante : vérifier aussi le rendu desktop, un viewport mobile, la console, les contrôles médias et la persistance après redémarrage.
