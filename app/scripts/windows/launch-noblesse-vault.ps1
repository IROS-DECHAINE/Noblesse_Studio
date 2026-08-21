$ErrorActionPreference = 'Stop'

$launcherPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\launch-latest.ps1')).Path
& $launcherPath
exit $LASTEXITCODE
