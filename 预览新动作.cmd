@echo off
setlocal
cd /d "%~dp0"
set "ELECTRON_RUN_AS_NODE="
if not exist "actions\branding-installation.json" (
  echo The production library is not available. See docs/branding/ALL-ACTIONS-2026-11-01.md.
  exit /b 1
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0scripts\preview-branding-delivery.cjs" "--manifest=actions/branding-installation.json" "--select=wallet-careful"
