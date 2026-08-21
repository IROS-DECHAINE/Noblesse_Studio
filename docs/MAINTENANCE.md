# Maintenance de production

## À chaque modification importante

Depuis `app/` :

```powershell
pnpm.cmd verify-source
pnpm.cmd test
pnpm.cmd build
```

Après une modification du Vault, d’un manifeste documentaire ou d’une relation :

```powershell
pnpm.cmd rebuild-indexes
pnpm.cmd verify-foundation
```

## Routine recommandée

| Fréquence | Action |
|---|---|
| Avant une opération importante | Créer un instantané de sauvegarde |
| Chaque semaine | Vérifier qu’un instantané récent existe |
| Chaque mois | Vérifier cryptographiquement le dernier instantané et tester les contrôles complets |
| Tous les 2 à 3 mois | Mettre à jour Electron et les dépendances sur une branche dédiée |
| Avant chaque livraison | Tests, build, audit, paquet Windows et signature numérique |

Dependabot prépare les mises à jour dans GitHub. Une mise à jour ne rejoint jamais `main` sans tests verts et contrôle visuel de l’application.

## Porte de livraison

Une version est publiable uniquement si :

- `verify-source`, `verify-foundation`, les tests et le build sont en PASS ;
- `pnpm.cmd audit --prod --audit-level high` ne signale aucune vulnérabilité haute ou critique ;
- l’installateur est produit par le workflow de livraison avec un certificat Windows ;
- un instantané récent et vérifié existe ;
- les notes de version indiquent toute migration de données.

La version du code suit SemVer. Les migrations de données restent additives et traçables ; un cache ou une base reconstructible ne doit jamais devenir la seule copie d’une information.

## Canal desktop local de travail

Theo utilise directement `app/build/Noblesse Studio.exe`. Après toute modification visible validée, la tâche n’est donc pas terminée tant que la version locale n’a pas été déployée avec :

```powershell
Set-Location app
pnpm.cmd desktop:deploy-local
```

La commande rejoue les portes obligatoires, fabrique `release/win-unpacked`, ferme l’application sans arrêt forcé — y compris via une demande locale de seconde instance lorsque les rappels tournent —, garde un seul rollback sous `app/build-previous`, remplace `app/build`, maintient le raccourci direct et relance l’exécutable. Une impossibilité de fermeture bloque le remplacement au lieu de risquer les données.

Le canal local est distinct de l’auto-mise à jour publique. Une diffusion distante reste interdite sans certificat Windows, manifeste signé et procédure de rollback publiée.
