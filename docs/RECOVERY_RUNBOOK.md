# Sauvegarde et récupération

Ce guide est la procédure officielle pour protéger les données locales de Noblesse Studio. Il est volontairement court et exécutable sans connaissances de programmation.

## Ce qui est protégé

- le Vault publié : `library/storage/` ;
- les documents gérés et leurs versions : `D:\NO_BLESSE Studio\Documents` ;
- l’état métier local : `data/state/`.

La base SQLite, les caches, les aperçus et les fichiers de build restent reconstructibles. Une sauvegarde est un instantané immuable : chaque fichier est contrôlé par SHA-256 et les fichiers identiques ne sont stockés qu’une fois.

## Utilisation normale

Dans l’application, ouvrir **Réglages → Sauvegardes et récupération** :

1. vérifier la taille estimée ;
2. créer un instantané avant une importation importante ou une mise à jour ;
3. lancer **Vérifier** sur le dernier instantané au moins une fois par mois.

Le premier instantané peut copier plusieurs gigaoctets. Les suivants réutilisent les objets identiques et sont donc généralement beaucoup plus petits.

## Copie sur un autre disque

Une sauvegarde située sur le même disque ne protège pas contre la panne de ce disque. Pour placer le dépôt sur un disque externe, définir `NOBLESSE_BACKUP_ROOT` avant de lancer l’application :

```powershell
$env:NOBLESSE_BACKUP_ROOT = 'E:\Noblesse Studio Backups'
```

Le chemin configuré ne doit jamais se trouver à l’intérieur d’un dossier qu’il sauvegarde.

## Restauration contrôlée

Une restauration touche des données métier. Fermer complètement Noblesse Studio, puis ouvrir PowerShell dans `Noblesse Studio App\app` :

```powershell
pnpm.cmd recovery status
pnpm.cmd recovery verify <snapshotId>
pnpm.cmd recovery plan-restore <snapshotId>
pnpm.cmd recovery apply-restore <planId> <planHash> --acknowledge-app-closed
```

Le plan expire après 30 minutes et devient invalide si les données ont changé. Juste avant la restauration, l’outil crée automatiquement un instantané de sécurité. Les fichiers supplémentaires absents de l’ancien instantané sont conservés : aucune suppression implicite n’est effectuée.

Après restauration :

```powershell
pnpm.cmd rebuild-indexes
pnpm.cmd verify-foundation
```

Ne jamais modifier les manifestes, objets ou plans présents dans `data/backups/` à la main.
