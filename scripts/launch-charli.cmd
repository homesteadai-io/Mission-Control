@echo off
rem One-click launcher for Charli (Mission Control).
rem Builds only if the app hasn't been built yet, then launches the packaged app.
setlocal
set "REPO=%~dp0.."
cd /d "%REPO%"

if not exist "node_modules\" (
  echo Installing dependencies (first run)...
  call npm install || goto :error
)

if not exist "dist\index.html" goto :build
if not exist "dist-electron\main.js" goto :build
goto :launch

:build
echo Building Charli...
call npm run build || goto :error

:launch
start "" ".\node_modules\.bin\electron.cmd" .
exit /b 0

:error
echo.
echo Charli failed to start. See the message above.
pause
exit /b 1
