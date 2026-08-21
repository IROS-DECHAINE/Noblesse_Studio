# Décision — Corbeille récupérable de la bibliothèque

## Contexte

Theo doit pouvoir retirer manuellement un son, un asset, une texture, une matière ou un document sans risquer d’effacer un original ou de casser silencieusement une dépendance. Les index générés et SQLite ne sont pas des sources à modifier directement.

## Options étudiées

1. Supprimer immédiatement les fichiers et l’entrée de catalogue. Refusé : action irréversible et dangereuse pour les packs partagés.
2. Masquer l’élément uniquement dans l’interface. Refusé : le catalogue et les projections continueraient à le publier.
3. Préparer un plan durable, vérifier les dépendances, exiger deux validations, retirer logiquement les entrées du catalogue et conserver les originaux pour restauration.

## Choix

L’option 3 est retenue.

Le renderer transmet uniquement une liste bornée d’IDs permanents. Le processus principal relit le catalogue validé, calcule les dépendances entrantes et persiste un plan avec hash. Une première validation humaine accepte le plan ; une seconde confirmation distincte autorise la mutation. Si un élément restant dépend d’une cible, la mutation est bloquée et nomme les dépendants.

La corbeille des assets vit sous `library/storage/.trash/`. Elle conserve un reçu privé contenant les entrées complètes du catalogue. Les originaux gérés restent immuables à leur emplacement : la corbeille est logique, récupérable et ne sert pas à libérer de l’espace. La restauration republie les mêmes IDs après contrôle des sources et de leurs hashes.

Le catalogue et le reçu d’intégrité sont mis à jour, puis tous les index et SQLite sont reconstruits. Un échec de projection restaure le catalogue et l’intégrité précédents. Les mutations audio et corbeille partagent une file de sérialisation. Les documents conservent leur corbeille adressée par manifeste et objets ; l’interface de récupération réunit les deux mécanismes.

## Conséquences

- Un bouton de corbeille agit sur la carte visible : un son correspond à une entrée ; une matière groupée peut correspondre à plusieurs variantes.
- Une texture encore utilisée ne peut pas être retirée isolément.
- Les éléments et documents supprimés se restaurent depuis **Sécurité et récupération**.
- Aucune purge définitive n’est exposée dans cette version.
- La taille disque ne diminue pas lors d’une mise en corbeille, volontairement.

## Risques et protections

- Renderer compromis : DTO IPC fermés, IDs seulement, contrôle d’émetteur et réponses par liste blanche.
- Plan périmé : le hash du catalogue doit encore correspondre lors de la seconde confirmation.
- Dépendance cassée : blocage sur toute dépendance entrante connue.
- Transaction interrompue : reçu `PREPARED`, contrôle au démarrage et finalisation ou rollback selon le hash du catalogue.
- Fichier restauré altéré : contrôle de présence, lien symbolique et SHA-256 pour toute source gérée déclarée.

## Preuve

- tests du plan, de la seconde confirmation, du blocage de dépendance, du rollback de projection, de la restauration et de l’absence de chemins privés ;
- contrat IPC couvrant plan, application, liste et restauration ;
- validation complète et paquet desktop avant remise à Theo.

## Rollback

Retirer l’interface et les canaux de corbeille sans supprimer `.trash/`. Restaurer chaque reçu par le service avant de retirer le service lui-même. Une purge physique exige une décision distincte, une sauvegarde vérifiée et l’autorisation explicite de Theo.

## Déclencheur de révision

Revoir cette décision pour une purge définitive, une politique de rétention, une suppression de pack natif complet, une bibliothèque multi-utilisateur ou de nouvelles formes de dépendances.
