# Calendrier Noblesse Studio — guide d’exploitation

## Ce qui fonctionne localement

- calendrier semaine et jour, événements, tâches, deadlines et blocs de travail ;
- éléments horaires, journées entières et périodes de plusieurs jours ;
- récurrence quotidienne, hebdomadaire, mensuelle ou annuelle ;
- jusqu’à cinq rappels ordinateur par élément ;
- stockage persistant, import sans perte de l’ancien planning et commandes CLI/IA ;
- rattrapage des rappels après suspension ou redémarrage lorsque l’application repart ;
- fiche rapide au clic avec l’horaire exact et les dates concrètes de chaque rappel ;
- fenêtre de journée au clic sur une case, avec tous les rendez-vous regroupés et leurs titres, descriptions, lieux, projets et nombres de rappels ;
- suppression confirmée depuis la fiche rapide, avec retrait automatique de la copie Google quand le compte est connecté ;
- copie optionnelle vers l’agenda Google principal pour les notifications téléphone et iPad.

## Limites honnêtes

Une notification ordinateur nécessite que Noblesse Studio tourne, même caché en arrière-plan. Aucun logiciel local ne peut afficher un toast pendant que le PC est éteint. L’e-mail nécessite un service toujours allumé et un fournisseur vérifié ; l’interface le garde donc désactivé tant que ces prérequis ne sont pas configurés.

## Utilisation

1. Ouvrir **Calendrier** puis cliquer une case du mois ou un jour de la semaine pour afficher tous les rendez-vous de cette journée.
2. Ouvrir un rendez-vous de la liste pour lire sa fiche complète, ou cliquer **Ajouter un rendez-vous**. Il reste aussi possible de cliquer **Nouvel événement** ou de double-cliquer une heure du planning.
3. Choisir le type, le projet, les horaires et autant de rappels que nécessaire.
4. Cliquer **Activer les rappels** une seule fois et vérifier la notification test.
5. La fiche affiche clairement le titre, la description, le type, le projet, le lieu, l’état Google Calendar et chaque rappel concret, puis permet de **Modifier** ou **Supprimer**. La suppression demande toujours une confirmation et précise lorsqu’elle concerne toute une série récurrente.

Raccourcis : `Ctrl+N` crée un élément, `T` revient à aujourd’hui, `Échap` ferme l’éditeur.

## Rappels ordinateur

Le bouton **Activer les rappels** active aussi le fonctionnement en arrière-plan puis affiche immédiatement une notification test. Si le test échoue, l’activation est annulée afin de ne pas afficher un faux état « actif ».

La fiche rapide d’un événement affiche la date et l’heure auxquelles chaque rappel doit réellement partir. L’icône Noblesse Studio reste dans la zone système tant que les rappels en arrière-plan sont actifs. Fermer la fenêtre la masque ; **Quitter Noblesse Studio** depuis l’icône système arrête les rappels locaux.

## Google Calendar — téléphone et iPad

1. Dans Google Cloud, activer **Google Calendar API**.
2. Configurer l’écran de consentement OAuth puis créer un client **Application de bureau**.
3. Télécharger son JSON.
4. Dans **Calendrier → Google Calendar**, choisir ce JSON puis cliquer **Connecter mon compte Google**.
5. Autoriser les notifications de Google Calendar sur le téléphone et l’iPad.

La synchronisation initiale copie les éléments existants. Les changements suivants sont envoyés automatiquement ; **Synchroniser maintenant** relance les éléments en attente. Supprimer un élément dans Noblesse Studio retire aussi sa copie Google ; si Google est temporairement indisponible, cette suppression reste en attente. Noblesse Studio ne connaît jamais le mot de passe Google et chiffre localement les jetons avec Windows.

Cette version est volontairement à sens unique : modifier un événement dans Google ne modifie pas Noblesse Studio. La déconnexion conserve les copies déjà présentes dans Google. Voir [la décision Google Calendar](DECISION_GOOGLE_CALENDAR_SYNC_2026-08-22.md).

## Sauvegarde et migration

Le fichier canonique du calendrier est écrit dans le dossier de données de Noblesse Studio avec une sauvegarde précédente. Le stockage historique `noblesse:planning:v1` reste intact après import. Ne le supprimer qu’après avoir contrôlé le nombre d’éléments importés et réalisé un export.

## Connexion IA

Une IA ne reçoit pas un accès libre au disque. Elle appelle les commandes calendrier avec un acteur, une clé d’idempotence et, pour une modification, la révision attendue. Les suppressions de séries et notifications à des tiers restent soumises à confirmation humaine.

## E-mail — prérequis avant activation

- domaine expéditeur du studio ;
- SPF, DKIM et DMARC valides ;
- adresse d’envoi vérifiée ;
- fournisseur sélectionné et clé stockée dans le coffre du système ;
- gestion des rebonds, plaintes et désinscriptions ;
- ordonnanceur serveur toujours allumé ;
- test de confidentialité et consentement séparé de la notification ordinateur.
