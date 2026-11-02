@echo off
setlocal
cd /d "%~dp0"
if exist "%LOCALAPPDATA%\Zhixi\app\QiqiCodexPet.exe" (
  start "" "%LOCALAPPDATA%\Zhixi\app\QiqiCodexPet.exe"
  exit /b
)
if exist "%~dp0node_modules\electron\dist\electron.exe" (
  start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
  exit /b
)
if exist "%~dp0dist\QiqiCodexPet-win32-x64\QiqiCodexPet.exe" (
  start "" "%~dp0dist\QiqiCodexPet-win32-x64\QiqiCodexPet.exe"
  exit /b
)
echo Please run npm install in this folder first.
pause
