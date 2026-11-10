@echo off
REM ====================================================================
REM  update.cmd - get the newest version of the app and restart it
REM  How "working on it slowly over time" works:
REM    1) Claude improves the code and pushes it to GitHub.
REM    2) You double-click this file on the laptop (or Claude Code on
REM       your Mac runs it over SSH).
REM    3) It downloads the changes, runs the tests, and restarts the app.
REM  If the tests fail, it does NOT restart with the new version.
REM ====================================================================
setlocal
set "APP=%USERPROFILE%\subscription-finder"
cd /d "%APP%" 2>nul
if errorlevel 1 (
  echo Can't find the app folder: %APP%
  pause
  exit /b 1
)
if not exist ".git" (
  echo This copy wasn't installed with git, so it can't update itself.
  echo See README.md, "Installing on the laptop".
  pause
  exit /b 1
)

echo 1/4  Downloading the newest version...
git pull --ff-only
if errorlevel 1 (
  echo      Download failed. Nothing was changed. Paste the message above to Claude.
  pause
  exit /b 1
)

echo 2/4  Installing parts...
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 (
  echo      Install failed. Paste the message above to Claude.
  pause
  exit /b 1
)

echo 3/4  Running the automatic checks...
call npm test >"%TEMP%\sf-test-output.txt" 2>&1
if errorlevel 1 (
  echo      Some checks FAILED, so the app was not restarted.
  echo      The test report is safe to share: %TEMP%\sf-test-output.txt
  pause
  exit /b 1
)
echo      All checks passed.

echo 4/4  Restarting the app...
curl.exe -s -o nul --max-time 3 -X POST -H "Origin: http://127.0.0.1:5172" -H "X-Subscription-Finder: 1" -H "Content-Type: application/json" -d "{}" http://127.0.0.1:5172/api/quit
timeout /t 2 /nobreak >nul
start "" /min powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%APP%\launchers\windows\start-background.ps1"
timeout /t 5 /nobreak >nul
curl.exe -s -o nul --max-time 2 http://127.0.0.1:5172/api/hello
if errorlevel 1 (
  echo      The app didn't answer. Check %USERPROFILE%\.subscription-finder\app.log
) else (
  echo      Updated and running.
)
pause
