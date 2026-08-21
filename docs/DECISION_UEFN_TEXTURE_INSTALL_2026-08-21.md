# Décision — Installation fiable des textures UEFN

## Contexte

Le 21 août 2026, l’installation de `NOB-MAT-DARK-MATTER-PREMIUM-V01` a importé une texture source de `1254 × 1254` pixels. UEFN a ensuite produit une erreur `ValkyrieValidator_Textures` parce que les deux dimensions ne sont pas des puissances de deux. L’application avait pourtant écrit un reçu de réussite : elle contrôlait la taille source, le nombre de nœuds, les sorties du matériau et la sauvegarde, mais pas la conformité de streaming de la texture ni la valeur relue des références de texture.

Ce comportement créait deux risques : un matériau visible comme cassé dans UEFN et un faux état « installé et validé » dans Noblesse Studio.

## Options examinées

1. Modifier le PNG publié pour le convertir en `1024 × 1024`. Rejeté : l’original géré du Vault doit rester immuable et une correction silencieuse détruirait la provenance exacte.
2. Refuser toute texture non puissance de deux. Sûr, mais la matière Dark Matter resterait inutilisable alors qu’UEFN possède un mécanisme officiel de conformité.
3. Appliquer après import la politique officielle UEFN, puis relire les propriétés et recompiler le matériau. Choisi.
4. Considérer `save_assets = true` comme une validation suffisante. Rejeté : UEFN peut sauvegarder un asset tout en signalant une erreur de validation de contenu.

## Choix

L’installateur UEFN v2 suit désormais ce contrat :

- la recette, ses nœuds, ses connexions et toutes ses références de texture sont validés avant de contacter UEFN ;
- toutes les destinations finales sont interrogées avant l’import ; aucune destination partielle n’est écrasée ;
- une texture dont une dimension n’est pas une puissance de deux reçoit `StretchToPowerOfTwo`, `TMGS_FromTextureGroup` et `NeverStream = false` ;
- ces trois propriétés sont relues immédiatement ; une différence bloque l’installation ;
- chaque propriété `Texture` des nœuds du matériau est relue et comparée à la recette ;
- la recompilation, les sorties, la sauvegarde et l’état non modifié de chaque asset sont prouvés avant le reçu `PASS` ;
- l’interface dit « installé et vérifié », pas « validé », car le connecteur UEFN actuel n’expose pas le résultat détaillé de tous les validateurs de contenu.

Les outils `ObjectTools.get_properties` et `AssetTools.exists` deviennent obligatoires. Une session ne peut plus être verte uniquement parce que les familles d’outils existent : les commandes attendues sont vérifiées.

## Conséquences

La texture source reste exactement `1254 × 1254` dans le Vault. Seul l’asset importé dans le projet UEFN reçoit la politique de redimensionnement de build recommandée par Epic. Le reçu v2 enregistre chaque ajustement appliqué.

Une panne survenant après le premier import peut encore laisser une destination partielle. L’installateur la détecte au prochain essai et refuse tout écrasement. La suppression ou la réparation automatique de ces fichiers n’est pas introduite ici : elle exige le job persistant et le rollback contrôlé prévus en Phase 4 de la roadmap.

## Risques

- Une future version d’UEFN peut renommer une propriété ou une valeur d’énumération. La découverte de schéma et la relecture feront alors échouer proprement l’installation au lieu de produire un asset douteux.
- `StretchToPowerOfTwo` peut modifier légèrement l’échantillonnage. Pour une source carrée comme Dark Matter, ce choix évite les bordures visibles qu’un remplissage ajouterait et suit le mécanisme de conformité UEFN.
- Un nouveau validateur UEFN non représenté par ces contrôles peut encore refuser un asset. Un outil officiel donnant un résultat structuré de validation déclenchera une révision de cette décision.

## Preuves

- Journal UEFN local : erreur `ValkyrieValidator_Textures` sur `T_NBL_DarkMatterPremium_Source_v01`, dimensions `1254 × 1254`.
- Audit des recettes : 144 dépendances texture contrôlées ; une seule non puissance de deux, celle de Dark Matter.
- Tests automatisés : conformité de la texture, relecture de la référence du matériau, refus d’une recette incohérente et blocage d’une destination partielle.
- Documentation Epic : [Textures Best Practices in Fortnite](https://dev.epicgames.com/documentation/fortnite/textures-best-practices-in-fortnite?lang=en-US) et [Texture Asset Editor](https://dev.epicgames.com/documentation/unreal-engine/texture-asset-editor-in-unreal-engine?lang=en-US).

## Rollback

Revenir à l’installateur v1 et retirer `get_properties`/`exists` des capacités obligatoires rétablit le comportement précédent. Ce rollback réintroduit le faux succès observé et ne doit être utilisé que pour diagnostiquer une incompatibilité de connecteur, jamais pour publier une installation.

## Déclencheurs de révision

- ajout d’un outil UEFN de validation de contenu avec résultat structuré ;
- mise en place des jobs persistants avec rollback des assets créés ;
- changement du contrat Epic sur les textures non puissance de deux ;
- support d’un autre moteur, qui doit conserver son propre adaptateur et ses propres règles.
