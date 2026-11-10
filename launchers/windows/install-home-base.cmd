@echo off
REM ====================================================================
REM  install-home-base.cmd - make Legion the app's "home base"
REM  Double-click once, at the laptop. It:
REM    1) makes the app start by itself (no window) every time you log in
REM    2) starts it now
REM    3) turns on Tailscale Serve, so your phone, Mac or any of YOUR
REM       Tailscale devices can open it at https://legion.<tailnet>.ts.net
REM  The app itself still only listens on 127.0.0.1 (this laptop). Tailscale
REM  Serve is the doorman who walks your own devices in. Devices that are
REM  not on your Tailscale can't see it.
REM  Undo everything with uninstall-home-base.cmd.
REM ====================================================================
setlocal
set "APP=%USERPROFILE%\subscription-finder"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "STARTER=%STARTUP%\Subscription Finder background.cmd"

cd /d "%APP%" 2>nul
if errorlevel 1 (
  echo Can't find the app folder: %APP%
  pause
  exit /b 1
)

REM --- 1) Start at login: put a tiny starter file in the Startup folder ---
echo 1/3  Making the app start automatically when you log in...
> "%STARTER%" echo @echo off
>> "%STARTER%" echo REM Starts Subscription Finder in the background at login. Made by install-home-base.cmd
>> "%STARTER%" echo start "" /min powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%APP%\launchers\windows\start-background.ps1"
echo      Done.

REM --- 2) Start it now (unless it's already running) ---
echo 2/3  Starting the app now...
curl.exe -s -o nul --max-time 2 http://127.0.0.1:5172/api/hello
if errorlevel 1 (
  start "" /min powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%APP%\launchers\windows\start-background.ps1"
  timeout /t 6 /nobreak >nul
)
curl.exe -s -o nul --max-time 2 http://127.0.0.1:5172/api/hello
if errorlevel 1 (
  echo      The app didn't answer. Check the log: %USERPROFILE%\.subscription-finder\app.log
) else (
  echo      Running.
)

REM --- 3) Tailscale Serve: share it with YOUR Tailscale devices only ---
echo 3/3  Turning on Tailscale Serve...
where tailscale >nul 2>&1
if errorlevel 1 (
  echo      Tailscale isn't installed or isn't on the PATH. Install it from tailscale.com, then run this again.
  pause
  exit /b 1
)
REM "--bg" keeps it on, even after restarts. It forwards HTTPS to the app on 127.0.0.1:5172.
REM NOTE: this is "serve" (tailnet only), NOT "funnel" (public internet). Never use funnel for this app.
tailscale serve --bg http://127.0.0.1:5172
if errorlevel 1 (
  echo.
  echo      Tailscale Serve didn't turn on. If it printed a link above, open it to
  echo      allow HTTPS for your tailnet, then run this file again.
  echo      If it says "access denied", right-click this file and "Run as administrator".
  pause
  exit /b 1
)

echo.
echo All set. Open this address on your phone, Mac or other Tailscale devices:
tailscale serve status
echo.
echo Tip: on a phone, open it in the browser, then "Add to Home Screen".
pause
