param([ValidateSet('open','task','usage','pomodoro','journal','status','stop')][string]$Action = 'open')
$ErrorActionPreference = 'Stop'
$petInstallDirectory = Join-Path $env:LOCALAPPDATA 'Zhixi\app'
$petExecutable = Join-Path $petInstallDirectory 'QiqiCodexPet.exe'
$petInstalled = Test-Path -LiteralPath $petExecutable -PathType Leaf
$petProcesses = @(Get-CimInstance Win32_Process -Filter "name='QiqiCodexPet.exe'" | Where-Object { $_.ExecutablePath -eq $petExecutable -and $_.CommandLine -notmatch '--type=' })
if ($Action -eq 'status') {
  @{ installed=$petInstalled; running=($petProcesses.Count -gt 0); executable=$petExecutable; pids=@($petProcesses.ProcessId) } | ConvertTo-Json -Compress
  exit 0
}
if (-not $petInstalled) { throw 'Zhixi desktop runtime is missing. Run install.cmd from the release, or scripts/install-desktop.ps1 from the repository.' }
$petArguments = switch ($Action) { 'task' { '--panel' } 'usage' { '--usage' } 'pomodoro' { '--pomodoro' } 'journal' { '--journal' } 'stop' { '--quit' } default { $null } }
$petStartOptions = @{ FilePath=$petExecutable; WorkingDirectory=$petInstallDirectory; WindowStyle='Hidden'; PassThru=$true }
if ($petArguments) { $petStartOptions.ArgumentList = @($petArguments) }
$petProcess = Start-Process @petStartOptions
@{ requested=$Action; dispatched=$true; pid=$petProcess.Id } | ConvertTo-Json -Compress
