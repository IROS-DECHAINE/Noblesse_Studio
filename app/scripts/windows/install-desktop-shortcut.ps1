$ErrorActionPreference = 'Stop'

$appRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$launcherPath = Join-Path $appRoot 'scripts\launch-latest.ps1'
$iconPath = Join-Path $appRoot 'assets\noblesse-vault.ico'
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath 'Noblesse Studio.lnk'
$powershellPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

if (-not (Test-Path -LiteralPath $launcherPath)) { throw "Lanceur introuvable : $launcherPath" }
if (-not (Test-Path -LiteralPath $iconPath)) { throw "Icône introuvable : $iconPath" }
if (-not (Test-Path -LiteralPath $desktopPath)) { throw "Bureau introuvable : $desktopPath" }

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershellPath
$shortcut.Arguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $launcherPath
$shortcut.WorkingDirectory = $appRoot
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = 'Ouvrir l’application desktop Noblesse Studio'
$shortcut.WindowStyle = 7
$shortcut.Save()

Get-Item -LiteralPath $shortcutPath | Select-Object FullName, Length, LastWriteTime
