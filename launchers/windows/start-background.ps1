# =====================================================================
#  start-background.ps1 - runs the app with NO window (home-base mode)
# ---------------------------------------------------------------------
#  Started automatically when you log in to the laptop (set up by
#  install-home-base.cmd). The app's messages go into a log file:
#      C:\Users\<you>\.subscription-finder\app.log
#  That log only ever contains progress words and counts, so it's safe
#  to paste to Claude if something goes wrong.
# =====================================================================

$app    = Join-Path $env:USERPROFILE 'subscription-finder'    # the app folder
$drawer = Join-Path $env:USERPROFILE '.subscription-finder'   # your personal drawer
New-Item -ItemType Directory -Force -Path $drawer | Out-Null
$log = Join-Path $drawer 'app.log'

# Keep the log small: start a fresh one if it grows past 1 MB.
if ((Test-Path $log) -and ((Get-Item $log).Length -gt 1MB)) { Remove-Item $log }

Set-Location $app

# Right after login, Tailscale may still be connecting. Wait up to a
# minute so the app can learn its Tailscale name. (If it misses it, the
# app asks again later by itself.)
if (Get-Command tailscale -ErrorAction SilentlyContinue) {
  for ($i = 0; $i -lt 12; $i++) {
    tailscale status *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 5
  }
}

# Start the app. Its messages are added to the end of the log file.
"--- started $(Get-Date -Format 'yyyy-MM-dd HH:mm') ---" | Out-File -Append -FilePath $log
node server.js *>> $log
