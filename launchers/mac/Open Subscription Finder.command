#!/bin/bash
# =====================================================================
#  Open Subscription Finder - MAC launcher (double-click me in Finder)
# ---------------------------------------------------------------------
#  Analogy: this digs a private, encrypted hallway (an "SSH tunnel")
#  from your Mac to the laptop, starts the app on the laptop, and opens
#  the app in your Mac's browser through that hallway.
#  Closing this Terminal window closes the hallway AND stops the app.
#
#  Works from anywhere your Mac can reach "legion" (home Wi-Fi, or
#  Tailscale when you're out).
# =====================================================================

# The app's Tailscale address (home-base mode). Fill this in once
# install-home-base.cmd has run on the laptop, e.g.
#   HOME_BASE_URL="https://legion.tail1234.ts.net/"
# If it's set and answering, this launcher just opens it. No SSH needed.
HOME_BASE_URL=""

LAPTOP="insan@legion"                 # who and where to SSH into (backup route)
PORT=5172                             # the app's "door number" (same on both computers)
URL="http://localhost:$PORT/"         # what the browser opens on the Mac
REMOTE='cmd /c "%USERPROFILE%\subscription-finder\launchers\windows\start-for-mac.cmd"'

echo "Subscription Finder"

# 0) Home-base mode: is the always-on app answering over Tailscale?
if [ -n "$HOME_BASE_URL" ] && curl -sf --max-time 5 "${HOME_BASE_URL%/}/api/hello" >/dev/null; then
  echo "Opening the app on the laptop (over Tailscale)."
  open "$HOME_BASE_URL"
  exit 0
fi
[ -n "$HOME_BASE_URL" ] && echo "The always-on app didn't answer over Tailscale; trying the SSH route instead."

echo "Connecting to the laptop ($LAPTOP)..."

# 1) Can we reach the laptop at all? (8-second limit, no password prompts)
if ! ssh -o BatchMode=yes -o ConnectTimeout=8 "$LAPTOP" "echo ok" >/dev/null 2>&1; then
  echo
  echo "Can't reach the laptop."
  echo "  - Is it switched on and awake (not asleep or hibernating)?"
  echo "  - Away from home? Make sure Tailscale is on, on both computers."
  echo "  - First time? SSH keys may not be set up yet (see README)."
  echo
  read -n 1 -s -r -p "Press any key to close this window."
  exit 1
fi

# 2) Is something on this Mac already using the door number?
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  if curl -sf --max-time 2 "${URL}api/hello" >/dev/null; then
    echo "Subscription Finder is already open in another window. Opening the browser."
    open "$URL"
    exit 0
  fi
  echo "Another program on this Mac is using port $PORT. Close it and try again."
  read -n 1 -s -r -p "Press any key to close this window."
  exit 1
fi

# 3) In the background: wait until the app answers, then open the browser.
(
  for _ in $(seq 1 40); do
    if curl -sf --max-time 2 "${URL}api/hello" >/dev/null; then
      open "$URL"
      echo "Opened $URL in your browser. Keep this window open while you use the app."
      exit 0
    fi
    sleep 1
  done
  echo "The app didn't start within 40 seconds. Check the messages above."
) &

# 4) Open the tunnel and start the app on the laptop. This stays running
#    until you close this window (or press Quit in the app).
#    -L      = the tunnel: Mac port -> laptop's own 127.0.0.1 port
#    -T      = no fake terminal (needed so closing this window stops the app)
ssh -T -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
    -L "$PORT:127.0.0.1:$PORT" "$LAPTOP" "$REMOTE"

echo
echo "Disconnected from the laptop. The app has stopped."
read -n 1 -s -r -t 10 -p "This window can be closed."
