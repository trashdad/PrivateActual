@echo off
REM ====================================================================
REM  uninstall-home-base.cmd - undo install-home-base.cmd
REM  Stops the background app, stops it starting at login, and turns
REM  Tailscale Serve off for the app. The app folder and your settings
REM  stay where they are (delete them by hand if you want them gone).
REM ====================================================================
setlocal
set "STARTER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Subscription Finder background.cmd"

echo Stopping the app...
curl.exe -s -o nul --max-time 3 -X POST -H "Origin: http://127.0.0.1:5172" -H "X-Subscription-Finder: 1" -H "Content-Type: application/json" -d "{}" http://127.0.0.1:5172/api/quit

echo Removing the start-at-login file...
del "%STARTER%" 2>nul

echo Turning off Tailscale Serve for the app...
tailscale serve --https=443 off

echo Done.
pause
