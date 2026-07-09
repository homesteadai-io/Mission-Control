@echo off
rem One-click launcher for Charli (Mission Control).
rem Builds only if the app hasn't been built yet, then launches Electron directly.
rem NOTE: goto-style flow on purpose -- cmd parenthesized blocks break on paths
rem with trailing backslashes (the original "node_modules\" bug).
setlocal
set "REPO=%~dp0.."
cd /d "%REPO%"

if not exist "node_modules" goto install
goto checkbuild

:install
echo Installing dependencies (first run)...
call npm install
if errorlevel 1 goto error

:checkbuild
if not exist "dist\index.html" goto build
if not exist "dist-electron\main.js" goto build
goto launch

:build
echo Building Charli...
call npm run build
if errorlevel 1 goto error

:launch
start "Charli" "%REPO%\node_modules\electron\dist\electron.exe" "%REPO%"
exit /b 0

:error
echo.
echo Charli failed to start. See the message above.
pause
exit /b 1
