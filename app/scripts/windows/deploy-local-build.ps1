[CmdletBinding()]
param(
  [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'

$appRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$releaseDirectory = [System.IO.Path]::GetFullPath((Join-Path $appRoot 'release\win-unpacked'))
$targetDirectory = [System.IO.Path]::GetFullPath((Join-Path $appRoot 'build'))
$stagingDirectory = [System.IO.Path]::GetFullPath((Join-Path $appRoot 'build-next'))
$previousDirectory = [System.IO.Path]::GetFullPath((Join-Path $appRoot 'build-previous'))
$packageFile = Join-Path $appRoot 'package.json'
$executableName = 'Noblesse Studio.exe'

function Assert-AppChildPath {
  param([Parameter(Mandatory = $true)][string]$Candidate)

  $rootPrefix = $appRoot.TrimEnd('\') + '\'
  $resolvedCandidate = [System.IO.Path]::GetFullPath($Candidate)
  if (-not $resolvedCandidate.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Chemin de déploiement refusé hors de app/: $resolvedCandidate"
  }
  return $resolvedCandidate
}

function Assert-PackagedDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$Directory,
    [Parameter(Mandatory = $true)][string]$ExpectedVersion
  )

  $safeDirectory = Assert-AppChildPath $Directory
  $executable = Join-Path $safeDirectory $executableName
  $appAsar = Join-Path $safeDirectory 'resources\app.asar'
  $electronFallback = Join-Path $safeDirectory 'resources\default_app.asar'
  if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw "Exécutable local absent: $executable" }
  if (-not (Test-Path -LiteralPath $appAsar -PathType Leaf)) { throw "Paquet app.asar absent: $appAsar" }
  if (Test-Path -LiteralPath $electronFallback) { throw "Paquet Electron générique encore présent: $electronFallback" }

  $fileVersion = (Get-Item -LiteralPath $executable).VersionInfo.FileVersion
  if ($fileVersion -ne $ExpectedVersion) {
    throw "Version de l’exécutable inattendue: $fileVersion au lieu de $ExpectedVersion"
  }
  return $executable
}

function Get-RunningLocalProcesses {
  param([Parameter(Mandatory = $true)][string]$Executable)

  return @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq $executableName -and
    $_.ExecutablePath -and
    $_.ExecutablePath.Equals($Executable, [System.StringComparison]::OrdinalIgnoreCase)
  })
}

function Stop-LocalApplicationGracefully {
  param([Parameter(Mandatory = $true)][string]$Executable)

  $running = Get-RunningLocalProcesses $Executable
  if ($running.Count -eq 0) { return }

  $rootProcesses = @($running | Where-Object { $_.CommandLine -notmatch '\s--type=' })
  foreach ($processInfo in $rootProcesses) {
    $process = Get-Process -Id $processInfo.ProcessId -ErrorAction SilentlyContinue
    if ($process) { [void]$process.CloseMainWindow() }
  }

  $closeDeadline = [DateTime]::UtcNow.AddSeconds(4)
  do {
    Start-Sleep -Milliseconds 250
    $remaining = Get-RunningLocalProcesses $Executable
  } while ($remaining.Count -gt 0 -and [DateTime]::UtcNow -lt $closeDeadline)

  if ($remaining.Count -gt 0) {
    Start-Process -FilePath $Executable -ArgumentList '--noblesse-local-update-quit' -WorkingDirectory (Split-Path -Parent $Executable)
    $updateDeadline = [DateTime]::UtcNow.AddSeconds(8)
    do {
      Start-Sleep -Milliseconds 250
      $remaining = Get-RunningLocalProcesses $Executable
    } while ($remaining.Count -gt 0 -and [DateTime]::UtcNow -lt $updateDeadline)
  }

  if ($remaining.Count -gt 0) {
    throw 'Cette ancienne version de Noblesse Studio reste active en arrière-plan. Utilise une seule fois « Quitter Noblesse Studio » dans son icône de notification, puis relance desktop:deploy-local. Aucun processus n’a été forcé.'
  }
}

$releaseDirectory = Assert-AppChildPath $releaseDirectory
$targetDirectory = Assert-AppChildPath $targetDirectory
$stagingDirectory = Assert-AppChildPath $stagingDirectory
$previousDirectory = Assert-AppChildPath $previousDirectory

$package = Get-Content -LiteralPath $packageFile -Raw | ConvertFrom-Json
$expectedVersion = [string]$package.version
$releaseExecutable = Assert-PackagedDirectory -Directory $releaseDirectory -ExpectedVersion $expectedVersion

if (Test-Path -LiteralPath $stagingDirectory) {
  Remove-Item -LiteralPath $stagingDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path $stagingDirectory | Out-Null
Copy-Item -Path (Join-Path $releaseDirectory '*') -Destination $stagingDirectory -Recurse -Force
$stagedExecutable = Assert-PackagedDirectory -Directory $stagingDirectory -ExpectedVersion $expectedVersion

$targetExecutable = Join-Path $targetDirectory $executableName
Stop-LocalApplicationGracefully -Executable $targetExecutable

if (Test-Path -LiteralPath $previousDirectory) {
  Remove-Item -LiteralPath $previousDirectory -Recurse -Force
}

$targetMoved = $false
try {
  if (Test-Path -LiteralPath $targetDirectory) {
    Move-Item -LiteralPath $targetDirectory -Destination $previousDirectory
    $targetMoved = $true
  }
  Move-Item -LiteralPath $stagingDirectory -Destination $targetDirectory
  $targetExecutable = Assert-PackagedDirectory -Directory $targetDirectory -ExpectedVersion $expectedVersion
} catch {
  if (-not (Test-Path -LiteralPath $targetDirectory) -and $targetMoved -and (Test-Path -LiteralPath $previousDirectory)) {
    Move-Item -LiteralPath $previousDirectory -Destination $targetDirectory
  }
  throw
}

$desktopDirectory = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopDirectory 'Noblesse Studio.lnk'
if (Test-Path -LiteralPath $shortcutPath) {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $targetExecutable
  $shortcut.Arguments = ''
  $shortcut.WorkingDirectory = $targetDirectory
  $shortcut.IconLocation = "$targetExecutable,0"
  $shortcut.Description = 'Ouvrir l’application desktop Noblesse Studio'
  $shortcut.Save()
}

if (-not $NoLaunch) {
  Start-Process -FilePath $targetExecutable -WorkingDirectory $targetDirectory
  Start-Sleep -Seconds 2
  $started = @(Get-RunningLocalProcesses $targetExecutable | Where-Object { $_.CommandLine -notmatch '\s--type=' })
  if ($started.Count -eq 0) { throw 'La version locale a été installée, mais sa relance n’a pas été confirmée.' }
}

[pscustomobject]@{
  status = 'PASS'
  channel = 'LOCAL_WORKSPACE'
  version = $expectedVersion
  executable = $targetExecutable
  previousBuild = if (Test-Path -LiteralPath $previousDirectory) { $previousDirectory } else { $null }
  shortcut = if (Test-Path -LiteralPath $shortcutPath) { $shortcutPath } else { $null }
  launched = -not $NoLaunch
} | ConvertTo-Json -Depth 3
