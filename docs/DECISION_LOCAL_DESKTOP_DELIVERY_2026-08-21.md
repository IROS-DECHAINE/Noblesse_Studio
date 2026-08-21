# Décision — Livraison desktop locale de travail

## Contexte

Theo utilise l’exécutable empaqueté `app/build/Noblesse Studio.exe`. Un build Vite ou une validation dans le navigateur ne modifie pas cette application. Cette séparation a créé un faux sentiment de livraison : le code était validé, mais l’interface réellement ouverte restait l’ancien paquet.

Le certificat Windows nécessaire à une auto-mise à jour publique n’est pas encore disponible. Le besoin immédiat est un canal local, reproductible et sûr sur le poste de production, sans affaiblir la future chaîne signée.

## Options étudiées

1. Utiliser uniquement Vite pendant les travaux. Rapide, mais différent de l’application réellement utilisée et insuffisant pour vérifier Electron.
2. Remplacer manuellement des fichiers dans `app/build`. Simple, mais non reproductible, sans rollback et dangereux si l’application fonctionne encore.
3. Ajouter immédiatement une mise à jour distante non signée. Refusé : elle créerait une frontière réseau et permettrait l’installation de code sans preuve d’éditeur.
4. Créer un canal local validé qui produit un paquet complet, ferme proprement l’application, échange les répertoires et garde le build précédent.

## Choix

L’option 4 est retenue avec la commande `desktop:deploy-local`.

L’ordre est obligatoire : intégrité des fondations, contrats source, tests, audit de production, packaging Windows en répertoire, vérification de `app.asar`, absence de `default_app.asar`, fermeture gracieuse, copie en staging, échange avec rollback, contrôle de version, maintien du raccourci direct et relance.

Le script ne force jamais la terminaison du processus. Il ferme d’abord la fenêtre normalement, puis lance une seconde instance avec l’argument fermé `--noblesse-local-update-quit`. Une version empaquetée reconnaît cet argument exact, active son cycle `before-quit` et quitte proprement même si les rappels la maintenaient en arrière-plan. Les versions antérieures à 1.0.8 exigent une dernière fermeture manuelle ; le build actif reste intact jusque-là.

## Conséquences

- Une modification visible n’est plus considérée livrée localement avant un PASS de `desktop:deploy-local`.
- `app/build-previous` conserve exactement un rollback reconstructible et reste ignoré par Git.
- Le raccourci Bureau continue de viser directement `Noblesse Studio.exe`.
- Les données sous `data/`, les originaux du Vault et les préférences utilisateur ne sont ni copiés ni remplacés.
- La version SemVer de l’exécutable reste une preuve distincte du commit Git.

## Risques et protections

- Panne pendant l’échange : le script restaure `build-previous` si le nouveau répertoire ne peut pas prendre la place de `build`.
- Application encore active : le déploiement utilise la fermeture de fenêtre puis le protocole local fermé de seconde instance ; il s’arrête si ces deux voies échouent. Aucun `taskkill` ni `Stop-Process` n’est autorisé.
- Mauvais paquet : la version de l’exécutable, `resources/app.asar` et l’absence de l’application générique Electron sont vérifiées avant et après l’échange.
- Accumulation disque : un seul build précédent est conservé.

## Preuve attendue

- sortie JSON `status: PASS`, canal `LOCAL_WORKSPACE` et version attendue ;
- exécutable actif sous `app/build` avec la bonne version ;
- raccourci visant cet exécutable ;
- processus relancé depuis le même chemin ;
- tests de contrat refusant toute terminaison forcée.

## Rollback

Fermer Noblesse Studio, déplacer le `build` défectueux hors du chemin actif, remettre `build-previous` sous le nom `build`, vérifier la version puis relancer l’exécutable. Aucune donnée métier n’est restaurée, car ce mécanisme ne la modifie pas.

## Déclencheur de révision

Revoir cette décision dès qu’un certificat Windows, un dépôt de publication signé et un manifeste de mise à jour authentifié sont disponibles. La future mise à jour distante devra conserver les mêmes portes, un consentement de relance et un rollback contrôlé.
