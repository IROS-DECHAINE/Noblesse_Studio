# Données locales

Ce dossier contient uniquement les données mutables de l’application.

| Dossier | Rôle | Autorité |
|---|---|---|
| `database/` | SQLite, recherche et relations | Reconstructible |
| `state/` | Finances, calendrier et favoris locaux | Métier |
| `runtime/` | État Chromium/Electron et localStorage | Technique |
| `backups/` | Sauvegardes et preuves de migration | Récupération |
| `logs/` | Journaux d’exécution | Diagnostic |

Les originaux d’assets ne vont pas ici. Ils restent dans `../library/storage/`.

La base canonique est `database/noblesse-studio.db`. Elle peut être reconstruite à partir du catalogue, des manifestes et des originaux avec :

```powershell
Set-Location ..\app
pnpm.cmd rebuild-indexes
```

Ces données ne sont pas intégrées au paquet Electron ni versionnées avec le code.
