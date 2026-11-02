@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-codex-plugin.ps1"
if errorlevel 1 pause
