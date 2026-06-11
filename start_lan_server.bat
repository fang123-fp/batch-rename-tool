@echo off
setlocal
cd /d "%~dp0"

set PORT=%PORT%
if "%PORT%"=="" set PORT=8123

where node >nul 2>nul
if %errorlevel%==0 (
  if not exist node_modules (
    echo First launch detected. Installing dependencies...
    call npm install
    if errorlevel 1 goto :end
  )

  echo Starting LAN server with Node.js local backend on port %PORT%...
  set PORT=%PORT%
  call npm start
  goto :end
)

echo Node.js not found. Falling back to PowerShell static server only ^(without local backend extraction^)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve-lan.ps1"

:end
endlocal
