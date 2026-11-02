$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$electronDirectory = Join-Path $projectDirectory 'node_modules\electron'
$electronMetadata = Get-Content -LiteralPath (Join-Path $electronDirectory 'package.json') -Raw | ConvertFrom-Json
$runtimeVersion = $electronMetadata.version
$runtimeName = "electron-v$runtimeVersion-win32-x64.zip"
$cacheDirectory = Join-Path $projectDirectory '.cache'
$runtimeArchive = Join-Path $cacheDirectory $runtimeName
$runtimeChecksums = Get-Content -LiteralPath (Join-Path $electronDirectory 'checksums.json') -Raw | ConvertFrom-Json
$expectedHash = $runtimeChecksums.$runtimeName
if (-not $expectedHash) { throw 'No official checksum for this Electron runtime' }
New-Item -ItemType Directory -Path $cacheDirectory -Force | Out-Null
if (-not (Test-Path -LiteralPath $runtimeArchive)) {
  Write-Output "Downloading official Electron $runtimeVersion runtime..."
  $ProgressPreference = 'SilentlyContinue'
  Invoke-WebRequest -Uri "https://github.com/electron/electron/releases/download/v$runtimeVersion/$runtimeName" -OutFile $runtimeArchive -TimeoutSec 180
}
$actualHash = (Get-FileHash -LiteralPath $runtimeArchive -Algorithm SHA256).Hash
if ($actualHash -ne $expectedHash) { throw 'Electron checksum mismatch. The archive will not be executed.' }
Write-Output 'Official npm package checksum verified.'
$runtimeDirectory = Join-Path $electronDirectory 'dist'
Expand-Archive -LiteralPath $runtimeArchive -DestinationPath $runtimeDirectory -Force
[IO.File]::WriteAllText((Join-Path $electronDirectory 'path.txt'), 'electron.exe')
Write-Output "Runtime ready: $runtimeDirectory"
