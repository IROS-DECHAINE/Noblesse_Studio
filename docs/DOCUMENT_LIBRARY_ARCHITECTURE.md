# Bibliothèque Documents — architecture locale durable

- Statut : `IMPLEMENTED_V1`
- Date : 2026-08-21

## But

La rubrique Documents doit survivre au remplacement de React, Electron ou du futur noyau natif. Les fichiers et leurs métadonnées restent donc lisibles sans l’application.

## Racine de données

Ordre de résolution :

1. variable `NOBLESSE_DOCUMENT_ROOT` ;
2. `D:\NO_BLESSE Studio\Documents` lorsque le dossier studio existe ;
3. le dossier Documents du compte Windows, sous `Noblesse Studio\Documents`.

Cette racine ne doit jamais être placée sous `public`, `dist`, `release` ou dans l’archive ASAR.

## Organisation v1

```text
Documents/
  manifests/                # un JSON versionné par document
  objects/sha256/           # copies gérées, classées par empreinte
  plans/                    # intentions de suppression vérifiables
  receipts/                 # reçus d’import, suppression et restauration
  .trash/                   # originaux gérés retirés, récupérables
  .tmp/                     # staging borné, jamais source de vérité
```

Les documents existants dans les projets sont `linked` : le manifeste les indexe mais leur source reste à son emplacement canonique. Les documents ajoutés depuis l’application sont `managed` : une copie est placée dans la bibliothèque et vérifiée par SHA-256.

## Manifeste

Chaque manifeste porte au minimum :

- `schemaVersion` ;
- identifiant stable ;
- destination studio/jeu ;
- titre et nom original ;
- nature, extension et MIME ;
- taille et SHA-256 ;
- statut canonique éventuel ;
- origine `linked` ou `managed` ;
- statut actif/supprimé ;
- révision, dates et référence du dernier reçu.

Un index futur (SQLite/FTS5) devra être intégralement reconstruisible depuis ces manifestes. Il ne deviendra jamais la vérité métier.

## Import

1. L’humain choisit ou dépose les fichiers.
2. Le processus principal produit des jetons opaques à durée courte.
3. L’interface renvoie seulement ces jetons et la destination choisie.
4. Le service valide projet, type, fichier régulier et absence de lien symbolique.
5. La copie passe par `.tmp`, reçoit son hash, puis est déplacée dans `objects/sha256`.
6. Le manifeste est écrit atomiquement.
7. Un reçu clôt l’opération.

Les exécutables, scripts, installateurs et raccourcis sont refusés. Le renderer ne peut pas demander la lecture d’un chemin arbitraire.

## Suppression

La suppression suit `plan -> confirmation -> apply -> receipt`.

- `linked` : seule l’entrée de bibliothèque est retirée ; le canon source n’est jamais supprimé.
- `managed` : le fichier est déplacé sous `.trash` lorsqu’aucun autre manifeste actif ne le référence.
- `restore` : la révision et le reçu permettent de réactiver l’entrée et de remettre l’objet géré en place.

Une purge définitive n’appartient pas à la v1 et devra recevoir une approbation distincte.

## Lecture et ouverture

L’interface reçoit uniquement l’identifiant du document. Le processus principal le résout et expose le contenu par `noblesse-doc://file/<id>`. Le protocole refuse tout autre hôte ou identifiant et conserve les en-têtes de lecture nécessaires aux PDF, vidéos et sons.

- Markdown/TXT : texte borné, rendu React sans HTML brut ;
- PDF/image/vidéo/audio : flux local par identifiant ;
- Office/autre : ouverture par l’application système ;
- `Afficher dans le dossier` : résolution côté processus principal uniquement.

## Bootstrap canonique

`app/electron/data/document-bootstrap.v1.json` contient une courte liste explicite de canons réels. Aucun scan aveugle de milliers de fichiers n’est autorisé. Le bootstrap est idempotent : il crée ou remet à jour le lien connu sans dupliquer la source.

## Sauvegarde et reconstruction

À sauvegarder : `manifests`, `objects`, `receipts`, `plans` et `.trash`. Le dossier `.tmp` peut être supprimé après arrêt de l’application.

Procédure de reprise :

1. restaurer la racine sur le même chemin ou définir `NOBLESSE_DOCUMENT_ROOT` ;
2. relancer l’application ;
3. relire tous les manifestes ;
4. vérifier les hashes des objets gérés et l’existence des liens canoniques ;
5. reconstruire tout index dérivé ;
6. conserver les reçus pour l’audit.

## Portes avant import massif

- tests import/suppression/restauration et Unicode verts ;
- aucun chemin local rendu au frontend ;
- aperçu PDF et seek média vérifiés dans Electron ;
- persistance après redémarrage ;
- reconstruction depuis les manifestes ;
- sauvegarde restaurée sur une autre racine ;
- bibliothèque versionnée avec le reste du produit.
