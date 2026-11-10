@echo off
REM ====================================================================
REM  Subscription Finder - LAPTOP launcher (double-click me)
REM  Put a copy of this file on the laptop's Desktop.
REM  It: 1) finds the app folder, 2) makes sure the local AI (Ollama)
REM  is running, 3) starts the app and opens it in your browser.
REM  Closing this black window stops the app.
REM ====================================================================
title Subscription Finder

REM --- 1) Go to the app folder ---
cd /d "%USERPROFILE%\subscription-finder" 2>nul
if errorlevel 1 (
  echo Can't find the app folder: %USERPROFILE%\subscription-finder
  echo See README.md, "Installing on the laptop".
  pause
  exit /b 1
)

REM --- Is Node.js installed? ---
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js isn't installed. Install the LTS version from nodejs.org, then try again.
  pause
  exit /b 1
)

REM --- 2) Make sure the local AI is running (optional; scans work without it) ---
curl.exe -s -o nul --max-time 2 http://127.0.0.1:11434/api/version
if errorlevel 1 (
  echo Starting the local AI ^(Ollama^)...
  if exist "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe" (
    start "" "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe"
  ) else (
    start "Ollama" /min ollama serve
  )
  timeout /t 4 /nobreak >nul
)

REM --- 3) Start the app and open the browser ---
echo Starting Subscription Finder. Leave this window open while you use it.
node server.js --open
echo.
echo The app has stopped.
pause
