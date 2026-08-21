# Notes de version

## 1.0.12 — Barre audio précise et durée toujours visible

- lecteur audio dédié dans le prévisualisateur du Coffre, indépendant de l’affichage variable des contrôles Windows ;
- temps actuel et durée totale affichés en permanence pour chaque son ;
- curseur large cliquable et glissable pour rejoindre directement le moment choisi, comme sur un lecteur vidéo classique ;
- lecture, pause, navigation précédent/suivant et boucle conservées dans une interface cohérente ;
- durée du catalogue utilisée immédiatement, puis confirmée par les métadonnées réelles du WAV au chargement.
- zone d’installation commune à toutes les catégories du Coffre, filtrée par capacité réelle du type d’asset et non par un simple état vert générique ;
- pour les sons UEFN : dossier `NoblesseStudio/<Pack>/Audio` préparé dans le projet, WAV vérifié au nom unique sélectionné dans l’Explorateur, puis glisser-déposer final demandé sans faux état « installé ».

## 1.0.11 — Import audio groupé et corbeilles récupérables

- sélection de 1 à 200 WAV/MP3, titres proposés depuis les noms de fichiers et modifiables avant import ;
- lot persistant fichier par fichier, limite totale de 2 Go, annulation entre deux fichiers, reprise ciblée et succès partiels explicites ;
- un seul rebuild des index par passe, doublons SHA-256 conservés idempotents et mutations du catalogue sérialisées ;
- navigation son précédent/suivant et mode boucle dans le prévisualisateur ;
- mise en corbeille manuelle des sons, assets, textures et matières avec plan hashé, blocage des dépendances et deux validations ;
- originaux préservés, rollback si les projections échouent et restauration depuis **Sécurité et récupération** ;
- double validation également appliquée aux documents, désormais visibles dans les corbeilles locales de récupération.

## 1.0.10 — Import MP3 et aperçu fenêtré corrigés

- format de sortie WAV imposé explicitement à FFmpeg, y compris lorsque le fichier de travail sécurisé se termine par `.wav.part` ;
- variantes remontées au-dessus de l’aperçu pour rester directement accessibles ;
- hauteur de l’aperçu adaptée à la hauteur réelle de la fenêtre, tout en conservant sa taille maximale en plein écran.

## 1.0.9 — Bibliothèque audio gérée et aperçu étendu

- bouton **Ajouter un son** dans Coffre > Sons, avec titre, catégorie et confirmation de droits ;
- sélection WAV/MP3 par jeton opaque : aucun chemin privé ne quitte le processus principal ;
- validation des vrais WAV RIFF et conversion automatique des MP3 en WAV PCM 24 bits / 48 kHz avec FFmpeg découvert localement ;
- traitement audio hors de la boucle principale, limite de 128 Mo et 30 minutes, hash SHA-256 et refus des doublons ;
- original WAV géré dans le Vault, ID permanent, index Sons, projection SQLite et lecteur intégré ;
- prévisualisateur extensible jusqu’à 1 020 px, avec limite dynamique préservant au moins deux cartes lorsque la navigation est masquée.

## 1.0.8 — Coffre organisé et livraison locale automatique

- grandes catégories Assets, Matières, VFX et Sons directement sous le titre du Coffre ;
- 99 matières conservées dans Matières, dont 19 matières animées, sans faux VFX ;
- navigation et prévisualisateur redimensionnables, navigation rétractable et dimensions persistantes ;
- canal `desktop:deploy-local` validé, avec fermeture propre, remplacement contrôlé de `app/build`, rollback local, vérification de version et relance ;
- séparation explicite entre le canal de travail local et la future auto-mise à jour publique signée.

## 1.0.7 — Coffre fidèle et workflows projets durcis

- prévisualisation professionnelle des matériaux depuis les sources réelles du Vault, avec chargement atomique des textures, repli contrôlé et cache natif reconstructible ;
- contrats IPC publics `v1` pour les assets et projets : aucun chemin privé, PID, endpoint ou identifiant dérivé d’un chemin n’est exposé au renderer ;
- lancement réel de PrimeBot Rush sur le port MCP 8000 et de Prime Industry sur 8001 depuis l’application ;
- affichage de la plateforme UEFN dérivé du profil de lancement vérifié au lieu d’une ancienne étiquette produit ;
- surveillance MCP maintenue lorsque UEFN passe au premier plan afin que les cartes se mettent à jour automatiquement ;
- garde anti-course conservée pendant l’ouverture ou la fermeture d’un autre éditeur UEFN ;
- installation UEFN des textures avec normalisation non destructive, relecture des propriétés critiques et confirmation uniquement après sauvegarde vérifiée ;
- contrat UTF-8 automatique étendu aux sources visibles par l’utilisateur ;
- intégrité du Vault, contrats source, audit production, 227 tests, build et paquet desktop validés.

## 1.0.4 — Ouverture directe UEFN corrigée

- correction de la V1 qui ouvrait le Project Browser sur le dernier projet et le port global au lieu du profil choisi ;
- handoff atomique du projet, du port MCP et de l’auto-démarrage dans les préférences UEFN avant chaque lancement ;
- sauvegardes des préférences adressées par SHA-256 et lancements concurrents sérialisés ;
- surcharges `-ini` et flags MCP conservés comme seconde voie de compatibilité ;
- aucun statut vert avant validation du mount, du port et des outils de transfert ;
- nouveau test live requis après redémarrage manuel de Noblesse Studio.

## 1.0.3 — Identité Windows définitive

- identité Windows propre `com.noblesse.studio.desktop`, indépendante de l’ancien prototype Worker Rift ;
- raccourcis Bureau et menu Démarrer reliés directement à `Noblesse Studio.exe` ;
- commande de relance explicite pour l’épinglage dans la barre des tâches ;
- icône runtime incluse dans le paquet et création de la zone de notification tolérante aux erreurs ;
- suppression de l’application d’accueil générique Electron dans les livraisons Windows.

## 1.0.2 — Lancement UEFN par profil

- bouton de lancement sécurisé sous les cartes PrimeBot Rush et Prime Industry ;
- ports MCP dédiés 8000, 8001 et 8002 dans un registre versionné ;
- découverte contrôlée de l’installation UEFN via Epic Games Launcher ;
- anti-doublon, refus des ports occupés et reçus de lancement persistants ;
- statut vert uniquement après validation du projet, du port et des outils MCP ;
- un projet sur le mauvais port reste visible mais ne peut plus recevoir d’asset ;
- décision durable, rollback et déclencheurs de révision documentés.

## 1.0.0 — Fondation locale de production

- racine canonique indépendante de Worker Rift ;
- frontière Electron durcie et tous les IPC contrôlés ;
- Vault et index lisibles avec IDs permanents et graphe de dépendances ;
- SQLite reconstructible, migrations v1/v2, recherche, relations et révisions ;
- documents gérés avec versions immuables, suppression récupérable et restauration ;
- imports persistants, reprenables, annulables et idempotents ;
- sauvegardes adressées par contenu, vérifiables et restauration planifiée ;
- Coffre virtualisé avec trois lignes préchargées ;
- modules lourds et moteur 3D chargés à la demande ;
- 172 tests, contrats source, audit de dépendances et CI GitHub ;
- installateur Windows NSIS reproductible et workflow de livraison signée.

Le paquet local sert à la validation. Une publication officielle requiert le certificat Windows dans les secrets GitHub ; le workflow refuse volontairement de livrer sans signature.
