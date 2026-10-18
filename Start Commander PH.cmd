@echo off
rem Double-click to run Commander PH on this computer (Windows 10 or 11).
rem The first time, it gets what the app needs (including a private copy of
rem Node.js if this computer has none), builds the app, starts it and opens it
rem in your browser. Later starts take seconds. Keep this window open while you
rem use the app; close it to stop. The steps live in scripts\start-windows.ps1.

title Commander PH
cd /d "%~dp0"
if not exist package.json (
  echo This launcher must stay inside the Commander PH folder; it can't find the app here:
  echo   %CD%
  echo To start it from the Desktop, use a shortcut to this file instead of a copy.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-windows.ps1"
if errorlevel 1 goto failed
goto :eof

:failed
echo.
echo Commander PH stopped because of the problem above. Fix it, or ask for help with it,
echo then double-click this file again.
pause
exit /b 1
