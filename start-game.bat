@echo off
cd /d "%~dp0"
echo Starting Blink Bash...
echo Keep this window open while you play.
where node >nul 2>&1
if %errorlevel%==0 (
  node server.js
) else if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.js
) else (
  echo A recent Node.js runtime is required on the host computer.
  echo Install Node.js, then double-click this file again.
  pause
  exit /b 1
)
pause
