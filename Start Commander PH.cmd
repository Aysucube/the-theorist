@echo off
rem Double-click to run Commander PH on this computer (Windows).
rem It installs packages the first time, builds the app, starts it and opens
rem http://localhost:3000. Keep this window open while you use the app;
rem close it to stop. Your phone on the same Wi-Fi can use the "Network"
rem address printed below.

title Commander PH
cd /d "%~dp0"
if not exist package.json (
  echo This launcher must stay inside the commander-ph folder; it can't find the app here:
  echo   %CD%
  echo To start it from the Desktop, use a shortcut to this file instead of a copy.
  pause
  exit /b 1
)
rem Node.js may have been installed after Windows Explorer started.
set "PATH=%ProgramFiles%\nodejs;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS version from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing packages for the first time. This takes a minute...
  call npm ci
  if errorlevel 1 goto failed
)

rem Build every time so the app always matches the latest code. Takes a few seconds.
echo Preparing the app...
call npm run build
if errorlevel 1 goto failed

echo.
echo Commander PH is starting at http://localhost:3000
echo Keep this window open while you use it. Close it to stop the app.
echo.
rem Open the browser a few seconds from now, once the server is listening.
if not defined NO_BROWSER start "" /min cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:3000"
call npm start
goto :eof

:failed
echo.
echo Something went wrong. Read the messages above, or ask for help with them.
pause
exit /b 1
