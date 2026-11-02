param([switch]$NoStart)
$ErrorActionPreference = 'Stop'
$petRepository = Split-Path -Parent $PSScriptRoot
$petRuntimeDirectory = Join-Path $petRepository 'app'
if (-not (Test-Path -LiteralPath (Join-Path $petRuntimeDirectory 'QiqiCodexPet.exe'))) { $petRuntimeDirectory = Join-Path $petRepository 'dist\QiqiCodexPet-win32-x64' }
if (-not (Test-Path -LiteralPath (Join-Path $petRuntimeDirectory 'QiqiCodexPet.exe'))) { throw 'Build the desktop runtime with npm ci and npm run package first.' }
$petInstallRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Zhixi'))
$petInstalledApp = Join-Path $petInstallRoot 'app'
$petStagedApp = Join-Path $petInstallRoot ('staging-' + [Guid]::NewGuid().ToString('N'))
$petBackupApp = Join-Path $petInstallRoot ('backups\app-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
foreach ($petTarget in @($petInstalledApp,$petStagedApp,$petBackupApp)) { if (-not ([IO.Path]::GetFullPath($petTarget).StartsWith($petInstallRoot + '\',[StringComparison]::OrdinalIgnoreCase))) { throw 'Install path escaped the Zhixi directory.' } }
New-Item -ItemType Directory -Path $petStagedApp -Force | Out-Null
foreach ($petItem in Get-ChildItem -LiteralPath $petRuntimeDirectory -Force) { Copy-Item -LiteralPath $petItem.FullName -Destination $petStagedApp -Recurse -Force }
foreach ($petRelative in @('QiqiCodexPet.exe','resources\app.asar')) {
  if ((Get-FileHash -LiteralPath (Join-Path $petRuntimeDirectory $petRelative)).Hash -ne (Get-FileHash -LiteralPath (Join-Path $petStagedApp $petRelative)).Hash) { throw 'Staged runtime checksum failed.' }
}
$petExistingExecutable = Join-Path $petInstalledApp 'QiqiCodexPet.exe'
if (Test-Path -LiteralPath $petExistingExecutable) {
  $petQuit = Start-Process -FilePath $petExistingExecutable -ArgumentList '--quit' -WindowStyle Hidden -PassThru
  $petQuit.WaitForExit(8000) | Out-Null
  $petDeadline = (Get-Date).AddSeconds(8)
  do {
    $petRunning = @(Get-CimInstance Win32_Process -Filter "name='QiqiCodexPet.exe'" | Where-Object { $_.ExecutablePath -eq $petExistingExecutable -and $_.CommandLine -notmatch '--type=' })
    if ($petRunning.Count -eq 0) { break }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $petDeadline)
  if ($petRunning.Count -gt 0) { throw 'Close the running Zhixi application, then run the installer again.' }
}
if (Test-Path -LiteralPath $petInstalledApp) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $petBackupApp) -Force | Out-Null
  Move-Item -LiteralPath $petInstalledApp -Destination $petBackupApp
}
try { Move-Item -LiteralPath $petStagedApp -Destination $petInstalledApp }
catch { if ((Test-Path -LiteralPath $petBackupApp) -and -not (Test-Path -LiteralPath $petInstalledApp)) { Move-Item -LiteralPath $petBackupApp -Destination $petInstalledApp }; throw }
$petShortcutDirectory = Join-Path ([Environment]::GetFolderPath('Programs')) 'Zhixi'
New-Item -ItemType Directory -Path $petShortcutDirectory -Force | Out-Null
$petShortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $petShortcutDirectory 'Zhixi.lnk'))
$petShortcut.TargetPath = Join-Path $petInstalledApp 'QiqiCodexPet.exe'
$petShortcut.WorkingDirectory = $petInstalledApp
$petShortcut.Description = 'Zhixi Codex desktop companion'
$petShortcut.Save()
if (-not $NoStart) { Start-Process -FilePath $petShortcut.TargetPath -WorkingDirectory $petInstalledApp -WindowStyle Hidden | Out-Null }
@{ installed=$true; executable=$petShortcut.TargetPath; profilePreserved=$true; previousRuntimeBackup=$(if(Test-Path -LiteralPath $petBackupApp){$petBackupApp}else{$null}) } | ConvertTo-Json -Compress
