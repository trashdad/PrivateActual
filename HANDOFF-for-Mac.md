# Handoff: finish installing Subscription Finder (for Claude Code on the Mac)

The app was built and tested with fake data in a cloud session that couldn't reach the laptop. These are the remaining steps. They need a computer that can SSH to the laptop.

**How to use this file:** on your Mac, open Terminal in this project folder, run `claude`, and say:
*"Read HANDOFF-for-Mac.md and follow it."*

---

## For Claude Code: read this first

You are running on the user's Mac. The user is a beginner: explain in plain English, with analogies, and ask before installing anything.

### Privacy rules (do not break these, even if it seems convenient)
1. **Fake data only.** Never connect to the user's Actual server, never press "Scan my transactions" or "Test connection", never run a real scan.
2. **Never ask for, type, store or handle** the Actual password, API key or encryption password.
3. **Never read, print, copy, list, open or screenshot** anything in the laptop's `%USERPROFILE%\.subscription-finder\` folder, `Documents\subscription-reports\`, any `sf-actual-cache-*` folder, or real results. If you need to know whether something worked, ask the user.
4. When testing the app, start it **only** with `--demo-only` on port 5180. That mode switches real scans off and uses a throwaway settings folder. The always-on app (port 5172, and the Tailscale address) is the REAL app: never call anything on it except `/api/hello` (and `POST /api/quit` to restart it after an update).
5. If a step would break a rule, stop and tell the user.

### Facts
- Laptop SSH address: `insan@legion` (Windows, RTX 5080 laptop GPU with 16 GB, Ollama already set up).
- Install folder on the laptop: `%USERPROFILE%\subscription-finder` (a git checkout).
- Real app port: `5172`. Use port `5180` for any fake-data testing.
- Home-base mode: the app runs in the background on Legion and is shared to the user's own devices with Tailscale Serve at `https://legion.<tailnet>.ts.net/`.

---

## Steps

### 1. Connection check
Run `ssh -o BatchMode=yes -o ConnectTimeout=8 insan@legion echo ok`.
- If it fails because key-based login isn't set up, walk the user through it **for them to type themselves**: `ssh-keygen -t ed25519` on the Mac (if no key exists), then add the **public** key on the laptop. Windows quirk: if `insan` is an **administrator** account, the key goes in `C:\ProgramData\ssh\administrators_authorized_keys` (not `~\.ssh\authorized_keys`), and that file's permissions must allow only Administrators and SYSTEM:
  `icacls C:\ProgramData\ssh\administrators_authorized_keys /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"`
- Then detect the shell: `ssh insan@legion "echo %COMSPEC% & ver"` (cmd), or note whether it's PowerShell. The launchers wrap commands in `cmd /c`, which works from either.

### 2. Node.js on the laptop
`ssh insan@legion "node --version"`. If it's missing or older than 20, **ask the user** before installing Node LTS (e.g. `winget install OpenJS.NodeJS.LTS`, which may need them at the laptop to approve).

### 3. Put the project on the laptop with git
The laptop copy should be a **git checkout**, so `update.cmd` can pull improvements later.
- Check git is installed: `ssh insan@legion "git --version"`. If not, **ask the user** before installing it (`winget install Git.Git`).
- Clone: `ssh insan@legion "git clone -b claude/eager-planck-j2khor https://github.com/trashdad/PrivateActual.git %USERPROFILE%\subscription-finder"`.
  The repo is private, so the laptop needs GitHub sign-in. If the clone asks for credentials or fails, ask the user to run that same command **at the laptop** once, where Git Credential Manager will pop up a GitHub sign-in window.
- Then: `ssh insan@legion "cd /d %USERPROFILE%\subscription-finder && npm ci --ignore-scripts && npm test"`. All tests should pass. Report the pass/fail counts only.

### 3b. Match the Actual version (via tower, read-only, two facts only)
The Actual server runs on **tower**, which is reachable through the laptop: `ssh insan@legion "ssh root@tower <command>"`.
**Tower holds the user's real budget. You may read ONLY the Actual container's name, image, port mapping and version. Never list, open or copy Actual's data folder, never run commands inside the container except the version check below, never touch other containers, and never change anything on tower.**
1. Find the container. `grep` runs on tower, so only the Actual line comes back:
   `ssh insan@legion "ssh root@tower \"docker ps --format '{{.Names}} | {{.Image}} | {{.Ports}}' | grep -i actual\""`
   This shows the port (e.g. `0.0.0.0:5006->5006/tcp`). Tell the user the port, so they know whether `http://tower:5006` is right.
2. Get the version (use the container name from step 1):
   `ssh insan@legion "ssh root@tower \"docker inspect --format '{{index .Config.Labels \\\"org.opencontainers.image.version\\\"}}' <name>\""`
   If that's empty, try: `ssh insan@legion "ssh root@tower \"docker exec <name> node -p 'require(\\\"/app/package.json\\\").version'\""`
3. If the version differs from the `@actual-app/api` version in `package.json` (currently `26.11.0`), tell the user, then on the laptop run:
   `cd /d %USERPROFILE%\subscription-finder && npm install --save-exact --ignore-scripts @actual-app/api@<version> && npm test`
   Leave the change uncommitted on the laptop, and tell the user so they can ask Claude to make it permanent in GitHub. Otherwise `update.cmd`'s `git pull` will complain about the changed file.

### 4. Ollama check (fake data only, on a SEPARATE port)
- `ssh insan@legion "curl.exe -s http://127.0.0.1:11434/api/tags"` lists installed models. This contains model names only, so it's fine to read.
- If `qwen3:14b` isn't there, **ask the user** before running `ollama pull qwen3:14b` (about 9 GB). `gpt-oss:20b` is an alternative.
- **Is Ollama reachable from an SSH session?** If the curl above works, yes. If it doesn't, check whether the user is logged in at the laptop and whether Ollama's tray app is running. The most reliable setup is Ollama starting at login (its default) plus the user logging in once after each restart. Explain this to the user.
- Run a fake-data scan with AI on. Use **port 5180**, never 5172: the real always-on app uses 5172.
  1. `ssh -T -L 5180:127.0.0.1:5180 insan@legion "cmd /c \"set SF_PORT=5180&& cd /d %USERPROFILE%\subscription-finder && node server.js --demo-only --no-tailscale --tunnel\""` (leave running)
  2. **Safety check first:** `curl -s http://localhost:5180/api/hello` must show `"demoOnly":true`. If it doesn't, STOP: you may be talking to the real app.
  3. Send the requests the page would send (POSTs need both headers):
     `curl -s -X POST -H "Origin: http://localhost:5180" -H "X-Subscription-Finder: 1" -H "Content-Type: application/json" -d "{\"aiEnabled\":true,\"model\":\"qwen3:14b\"}" http://localhost:5180/api/settings`
     `curl -s -X POST -H "Origin: http://localhost:5180" -H "X-Subscription-Finder: 1" -H "Content-Type: application/json" -d "{}" http://localhost:5180/api/demo`
     wait until `curl -s http://localhost:5180/api/state` shows `"running":false`, then
     `curl -s http://localhost:5180/api/results`
  4. These are FAKE results, so you may read them. Show the user a small table of name → kind → what it is.
  5. Stop the tunnel (Ctrl+C).

### 5. Launchers
- **Laptop:** copy `launchers\windows\Subscription Finder.bat` to the laptop Desktop. On Windows the Desktop may be redirected to OneDrive, so check both `%USERPROFILE%\Desktop` and `%USERPROFILE%\OneDrive\Desktop`.
- **Mac:** copy `launchers/mac/Open Subscription Finder.command` to `~/Desktop`, run `chmod +x` on it, and remove the download quarantine flag if present: `xattr -d com.apple.quarantine ~/Desktop/"Open Subscription Finder.command"`.

### 6. Home-base mode (Tailscale): the user does this at the laptop
Ask the user to double-click **`launchers\windows\install-home-base.cmd`** in `%USERPROFILE%\subscription-finder` **at the laptop**. It must run at the laptop: a background app started over SSH would stop when SSH disconnects, and Tailscale may show a one-time "allow HTTPS" link. It prints the address, like `https://legion.<tailnet>.ts.net/`. Ask the user to tell you that address.
- Put it in the Mac launcher: set `HOME_BASE_URL="https://legion.<tailnet>.ts.net/"` near the top of `~/Desktop/Open Subscription Finder.command`.
- Check it from the Mac: `curl -s https://legion.<tailnet>.ts.net/api/hello` should show `{"app":"subscription-finder","demoOnly":false}`.
  **This is the REAL app.** `/api/hello` is the only address you may read on it (plus `POST /api/quit` to restart it). Never call `/api/state` (it contains the user's settings), `/api/results`, or anything else there.
- Ask the user to open that address on their phone, press **Try with fake data**, and check it looks right. Then **Add to Home Screen**.
- Ask the user to double-click the Mac launcher and confirm it opens the same page.

### 7. Finish
Tell the user in a few plain sentences what was set up, how to open the app (phone/Mac/any Tailscale device at the address, or the desktop icon at the laptop), how to update it (`update.cmd`), and the backup commands (README "Backup: typing commands instead"). Remind them: **the first real scan is theirs to do, at the app, not through Claude.** Suggest they create an Actual API key and tick **Remember on this laptop**, so scans from the phone don't need typing. Also suggest pressing **Clear results** when finished, since the app keeps running.
