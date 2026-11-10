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
4. When testing the app, start it **only** with `--demo-only` (or `npm run demo`). That mode switches real scans off and uses a throwaway settings folder.
5. If a step would break a rule, stop and tell the user.

### Facts
- Laptop SSH address: `insan@legion` (Windows, RTX 5080 laptop GPU with 16 GB, Ollama already set up).
- Install folder on the laptop: `%USERPROFILE%\subscription-finder`.
- App port: `5172` (same on both computers through the tunnel).

---

## Steps

### 1. Connection check
Run `ssh -o BatchMode=yes -o ConnectTimeout=8 insan@legion echo ok`.
- If it fails because key-based login isn't set up, walk the user through it **for them to type themselves**: `ssh-keygen -t ed25519` on the Mac (if no key exists), then add the **public** key on the laptop. Windows quirk: if `insan` is an **administrator** account, the key goes in `C:\ProgramData\ssh\administrators_authorized_keys` (not `~\.ssh\authorized_keys`), and that file's permissions must allow only Administrators and SYSTEM:
  `icacls C:\ProgramData\ssh\administrators_authorized_keys /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"`
- Then detect the shell: `ssh insan@legion "echo %COMSPEC% & ver"` (cmd), or note whether it's PowerShell. The launchers wrap commands in `cmd /c`, which works from either.

### 2. Node.js on the laptop
`ssh insan@legion "node --version"`. If it's missing or older than 20, **ask the user** before installing Node LTS (e.g. `winget install OpenJS.NodeJS.LTS`, which may need them at the laptop to approve).

### 3. Copy the project to the laptop (skip node_modules)
For example, from this folder:
`tar --exclude=node_modules --exclude=.git -czf - . | ssh insan@legion "mkdir %USERPROFILE%\subscription-finder 2>nul & tar -xzf - -C %USERPROFILE%\subscription-finder"`
(Windows 10/11 include `tar`.) Then on the laptop: `cd /d %USERPROFILE%\subscription-finder && npm install && npm test`. All tests should pass. Report the pass/fail counts only.

**Line endings:** the `.bat`/`.cmd` files must have Windows line endings (CRLF). `.gitattributes` handles this for a git checkout. If you copied from an archive, check them.

### 4. Ollama check (fake data only)
- `ssh insan@legion "curl.exe -s http://127.0.0.1:11434/api/tags"` lists installed models. This contains model names only, so it's fine to read.
- If `qwen3:14b` isn't there, **ask the user** before running `ollama pull qwen3:14b` (about 9 GB). `gpt-oss:20b` is an alternative.
- **Is Ollama reachable from an SSH session?** If the curl above works, yes. If it doesn't, check whether the user is logged in at the laptop and whether Ollama's tray app is running. The most reliable setup is Ollama starting at login (its default) plus the user logging in once after each restart. Explain this to the user.
- Run a fake-data scan with AI on, over the tunnel:
  1. `ssh -T -L 5172:127.0.0.1:5172 insan@legion "cmd /c \"cd /d %USERPROFILE%\subscription-finder && node server.js --demo-only --tunnel\""` (leave running)
  2. In another terminal, send the requests the page would send (POSTs need both headers):
     `curl -s -X POST -H "Origin: http://localhost:5172" -H "X-Subscription-Finder: 1" -H "Content-Type: application/json" -d "{\"aiEnabled\":true,\"model\":\"qwen3:14b\"}" http://localhost:5172/api/settings`
     `curl -s -X POST -H "Origin: http://localhost:5172" -H "X-Subscription-Finder: 1" -H "Content-Type: application/json" -d "{}" http://localhost:5172/api/demo`
     wait until `curl -s http://localhost:5172/api/state` shows `"running":false`, then
     `curl -s http://localhost:5172/api/results`
  3. These are FAKE results, so you may read them. Show the user a small table of name → kind → what it is.
  4. Stop the tunnel (Ctrl+C).

### 5. Launchers
- **Laptop:** copy `launchers\windows\Subscription Finder.bat` to the laptop Desktop. On Windows the Desktop may be redirected to OneDrive, so check both `%USERPROFILE%\Desktop` and `%USERPROFILE%\OneDrive\Desktop`. Ask the user to double-click it at the laptop and confirm the page opens (they can press **Try with fake data**).
- **Mac:** copy `launchers/mac/Open Subscription Finder.command` to `~/Desktop`, run `chmod +x` on it, and remove the download quarantine flag if present: `xattr -d com.apple.quarantine ~/Desktop/"Open Subscription Finder.command"`. Ask the user to double-click it, press **Try with fake data**, and confirm results appear. Then close the Terminal window and check the app stopped (`curl -s http://localhost:5172/api/hello` should fail).

### 6. Finish
Tell the user in a few plain sentences what was set up, what to double-click on each computer, and the backup commands (README "Backup: typing commands instead"). Remind them: **the first real scan is theirs to do, at the app, not through Claude.** Suggest they create an Actual API key and tick **Remember on this laptop** if they want to scan from anywhere without typing.
