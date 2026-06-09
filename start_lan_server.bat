@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel%==0 (
  echo Starting LAN server with Node.js...
  node server.js
  goto :end
)

echo Node.js not found. Falling back to PowerShell server...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve-lan.ps1"

:end
endlocal
