# Décision — Import audio géré dans le Coffre

## Contexte

Theo doit pouvoir ajouter rapidement de nombreux sons téléchargés sans déplacer manuellement des fichiers, convertir chaque MP3 ou reconstruire les index. Le produit reste local, Windows et mono-utilisateur. Les chemins privés, commandes arbitraires et binaires non vérifiés ne doivent pas franchir la frontière Electron.

## Options étudiées

1. Référencer les fichiers depuis Téléchargements. Refusé : la bibliothèque casserait après leur déplacement.
2. Décoder les MP3 dans le renderer. Refusé : les chemins franchiraient la frontière privilégiée et le traitement pourrait bloquer l’interface.
3. Embarquer immédiatement un FFmpeg statique. Écarté pour le canal actuel : poids, correctifs et obligations de redistribution exigent une revue avant publication.
4. Sélectionner jusqu’à 200 fichiers par jetons opaques, traiter chaque entrée dans une opération persistante et publier des WAV gérés dans le Vault.

## Choix

L’option 4 est retenue.

Le dialogue natif accepte de 1 à 200 fichiers `.wav` ou `.mp3`, limités à 128 Mo et 30 minutes par fichier, avec une limite de 2 Go par lot. Le renderer reçoit seulement un jeton temporaire, le nom simple, un titre suggéré dérivé du nom du fichier, la taille et le format. Il peut modifier les titres avant l’import. La requête IPC est fermée à une liste `{ selectionToken, title }`, une catégorie commune et la confirmation des droits.

Le lot est écrit dans `data/state/operations/` avant le premier traitement. Chaque fichier conserve son état, ses tentatives et son résultat. Le traitement est séquentiel pour borner la charge, annulable entre deux fichiers et reprenable après interruption. Une reprise ne rejoue que les entrées non terminées. Les succès partiels sont explicites et les index ne sont reconstruits qu’une fois en fin de passe.

Un WAV doit être un conteneur RIFF/WAVE lisible avec une piste PCM ou flottante valide ; il est copié sans réencodage. Un MP3 est converti avec l’exécutable `ffmpeg` découvert dans le `PATH` ou défini par `NOBLESSE_FFMPEG_EXECUTABLE`. Les arguments sont fixes, sans shell : première piste audio, aucune vidéo ni métadonnée, sortie PCM 24 bits à 48 kHz et format de sortie WAV explicitement imposé, y compris pour les fichiers temporaires `.wav.part`.

La copie, la conversion, l’analyse WAV et les hashes s’exécutent hors de la boucle principale. L’original téléchargé n’est ni déplacé ni modifié. Pour un MP3, une copie immuable `original.mp3` est conservée. Le WAV final vit sous `library/storage/user-audio/<asset-id>/audio.wav` avec un ID permanent indépendant du chemin.

Toutes les mutations du catalogue audio et de la corbeille passent par une file commune. Un doublon SHA-256 est refusé, le catalogue et son reçu d’intégrité sont écrits atomiquement autant que le permet le système de fichiers, puis les index et SQLite sont reconstruits. Un échec restaure l’état précédent.

## Conséquences

- Les noms de fichiers deviennent automatiquement les titres proposés, ce qui rend les imports massifs rapides.
- Le lecteur du Coffre permet précédent, suivant et lecture en boucle sans lecture automatique globale. Sa barre dédiée affiche le temps actuel et la durée totale, puis accepte un clic, un glissement ou le clavier pour rejoindre directement une position. La durée manifestée reste visible pendant le chargement et les métadonnées réelles du WAV la remplacent dès qu’elles sont disponibles.
- L’application conserve une copie durable même si le téléchargement original disparaît.
- Un MP3 ne regagne pas de qualité perdue ; la sortie haute qualité évite seulement une compression destructive supplémentaire.
- L’installation audio utilise désormais la zone commune du Coffre. Pour UEFN, l’adaptateur vérifie la session et le projet, prépare le dossier Audio dans le Content Browser et une copie de transfert au nom Unreal unique, puis demande le glisser-déposer final. Le connecteur officiel ne possédant pas encore d’importeur `SoundWave`, ce transfert reste honnêtement `AWAITING_USER_IMPORT` et non `installé`. Unreal automatique et Roblox attendent toujours leurs adaptateurs propres.
- La conversion MP3 dépend aujourd’hui d’un FFmpeg local approuvé ; les WAV restent importables sans FFmpeg.

## Risques et protections

- Fichier hostile : limites par fichier et par lot, refus des liens symboliques, analyse RIFF stricte et worker isolé.
- Commande injectée : l’interface ne choisit jamais l’exécutable ou ses arguments ; aucun shell n’est utilisé.
- Doublon : comparaison SHA-256 avant publication.
- État partiel : journal persistant par fichier, écritures temporaires, rollback et reprise ciblée.
- Course avec une mise en corbeille : mutations du catalogue sérialisées par une file commune.
- Droits incertains : confirmation explicite pour tout le lot et preuve horodatée dans la métadonnée interne.

## Preuve attendue

- tests WAV, MP3 réel, faux WAV, lot multi-fichiers, reprise partielle, jetons sans chemins et DTO IPC fermés ;
- un seul rebuild d’index par passe complète ;
- navigation précédent/suivant avec boucle, durée totale explicite et recherche temporelle bornée dans le lecteur ;
- préparation UEFN sans chemin privé dans le renderer, copie WAV hashée, dossier Audio ciblé et reçu `AWAITING_USER_IMPORT` ;
- `rebuild-indexes`, intégrité, contrats source, tests, audit, build et paquet desktop en PASS.

## Rollback

Retirer les canaux IPC audio, le service de lot et l’interface, puis reconstruire les index. Ne jamais supprimer les WAV déjà importés sans plan confirmé et corbeille récupérable : ils sont devenus des originaux métier.

## Déclencheur de révision

Revoir cette décision avant une publication publique, l’ajout d’un convertisseur embarqué, de nouveaux formats, une exécution parallèle mesurée ou le premier adaptateur audio vers un moteur.
