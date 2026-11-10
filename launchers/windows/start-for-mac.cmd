@echo off
REM ====================================================================
REM  start-for-mac.cmd - run BY the Mac launcher over SSH. Don't
REM  double-click this one; use "Subscription Finder.bat" at the laptop.
REM  It starts the app in "--tunnel" mode: when the Mac window closes,
REM  the SSH connection ends and the app stops by itself.
REM  Only fixed words go to the screen (safe to paste for help).
REM ====================================================================

cd /d "%USERPROFILE%\subscription-finder" 2>nul
if errorlevel 1 (
  echo LAPTOP: app folder not found - see README "Installing on the laptop"
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo LAPTOP: Node.js is not installed
  exit /b 1
)

REM Is the local AI running? If not, try to start it in the background.
REM (Best fix: let Ollama start automatically when you log in - see README.)
curl.exe -s -o nul --max-time 2 http://127.0.0.1:11434/api/version
if errorlevel 1 (
  echo LAPTOP: local AI not running - trying to start it
  start "" /b ollama serve >nul 2>&1
)

echo LAPTOP: starting the app
node server.js --tunnel
