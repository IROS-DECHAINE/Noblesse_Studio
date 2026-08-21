$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$launcherMutex = [System.Threading.Mutex]::new($false, 'Local\NoblesseStudioLatestLauncher')
if (-not $launcherMutex.WaitOne(0)) { exit 0 }

try {
  $catalogRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
  $distIndex = Join-Path $catalogRoot 'dist\index.html'
  $electronExe = Join-Path $catalogRoot 'node_modules\electron\dist\electron.exe'
  $needsBuild = -not (Test-Path -LiteralPath $distIndex)

  if (-not $needsBuild) {
    $distStamp = (Get-Item -LiteralPath $distIndex).LastWriteTimeUtc
    $inputFiles = @()
    foreach ($relativeRoot in @('src', 'public', 'scripts')) {
      $inputRoot = Join-Path $catalogRoot $relativeRoot
      if (Test-Path -LiteralPath $inputRoot) {
        $inputFiles += Get-ChildItem -LiteralPath $inputRoot -Recurse -File
      }
    }
    foreach ($relativeFile in @('index.html', 'vite.config.js', 'package.json')) {
      $inputFile = Join-Path $catalogRoot $relativeFile
      if (Test-Path -LiteralPath $inputFile) { $inputFiles += Get-Item -LiteralPath $inputFile }
    }
    $needsBuild = [bool]($inputFiles | Where-Object { $_.LastWriteTimeUtc -gt $distStamp } | Select-Object -First 1)
  }

  if ($needsBuild) {
    $npmCommand = (Get-Command 'npm.cmd' -ErrorAction Stop).Source
    $buildProcess = Start-Process `
      -FilePath $npmCommand `
      -ArgumentList @('run', 'build') `
      -WorkingDirectory $catalogRoot `
      -WindowStyle Hidden `
      -Wait `
      -PassThru
    if ($buildProcess.ExitCode -ne 0) {
      throw "La construction de Noblesse Studio a échoué (code $($buildProcess.ExitCode))."
    }
  }

  if (-not (Test-Path -LiteralPath $electronExe)) {
    throw 'Le moteur local de Noblesse Studio est introuvable.'
  }

  $quotedCatalogRoot = '"{0}"' -f $catalogRoot
  Start-Process -FilePath $electronExe -ArgumentList $quotedCatalogRoot -WorkingDirectory $catalogRoot
} catch {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(
    "Noblesse Studio ne peut pas démarrer.`n`n$($_.Exception.Message)",
    'Noblesse Studio',
    'OK',
    'Error'
  ) | Out-Null
  exit 1
} finally {
  try { $launcherMutex.ReleaseMutex() } catch { }
  $launcherMutex.Dispose()
}
