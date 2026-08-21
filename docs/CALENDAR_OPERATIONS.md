# Calendrier Noblesse Studio — guide d’exploitation

## Ce qui fonctionne localement

- calendrier semaine et jour, événements, tâches, deadlines et blocs de travail ;
- éléments horaires, journées entières et périodes de plusieurs jours ;
- récurrence quotidienne, hebdomadaire, mensuelle ou annuelle ;
- jusqu’à cinq rappels ordinateur par élément ;
- stockage persistant, import sans perte de l’ancien planning et commandes CLI/IA ;
- rattrapage des rappels après suspension ou redémarrage lorsque l’application repart.

## Limites honnêtes

Une notification ordinateur nécessite que Noblesse Studio tourne, même caché en arrière-plan. Aucun logiciel local ne peut afficher un toast pendant que le PC est éteint. L’e-mail nécessite un service toujours allumé et un fournisseur vérifié ; l’interface le garde donc désactivé tant que ces prérequis ne sont pas configurés.

## Utilisation

1. Ouvrir **Calendrier** puis choisir un jour dans la barre lundi–dimanche.
2. Cliquer **Nouvel événement**, ou double-cliquer une heure du planning.
3. Choisir le type, le projet, les horaires et autant de rappels que nécessaire.
4. Cliquer **Activer les rappels** une seule fois et vérifier la notification test.
5. Cliquer un bloc ou une ligne d’agenda pour le modifier.

Raccourcis : `Ctrl+N` crée un élément, `T` revient à aujourd’hui, `Échap` ferme l’éditeur.

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
