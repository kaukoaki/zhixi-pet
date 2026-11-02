param([switch]$SkipDesktop)
$ErrorActionPreference = 'Stop'
$petRepository = Split-Path -Parent $PSScriptRoot
if (-not $SkipDesktop) { & (Join-Path $PSScriptRoot 'install-desktop.ps1') }
$petCodex = (Get-Command codex -ErrorAction Stop).Source
$petCodexDirectory = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex' }
$petConfig = Join-Path $petCodexDirectory 'config.toml'
if (Test-Path -LiteralPath $petConfig) {
  $petConfigBackup = Join-Path $petCodexDirectory ('backups\zhixi-install-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.toml')
  New-Item -ItemType Directory -Path (Split-Path -Parent $petConfigBackup) -Force | Out-Null
  Copy-Item -LiteralPath $petConfig -Destination $petConfigBackup
}
& $petCodex plugin marketplace add $petRepository --json
if ($LASTEXITCODE -ne 0) { throw 'Codex marketplace registration failed.' }
& $petCodex plugin add 'zhixi-pet@zhixi-local' --json
if ($LASTEXITCODE -ne 0) { throw 'Codex plugin installation failed.' }
& $petCodex plugin list --marketplace 'zhixi-local' --json
if ($LASTEXITCODE -ne 0) { throw 'Codex plugin verification failed.' }
