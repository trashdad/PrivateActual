# Subscription Finder — rules for Claude

The owner is a beginner. Explain in plain English with everyday analogies, and comment code generously.

## Privacy rules (always, in every session)
1. **Fake data only.** Never connect to the Actual server, never run a real scan or "Test connection".
2. **Never ask for, type, store or handle** the Actual password, API key or encryption password.
3. **Never read, print, copy, list, open or screenshot**: `%USERPROFILE%\.subscription-finder\` (settings, saved keys, app.log), `Documents\subscription-reports\`, any `sf-actual-cache-*` folder, or Actual's data on tower.
4. **The real app** runs on Legion at `127.0.0.1:5172` and over Tailscale Serve at the laptop's `*.ts.net` address. On it, call **only** `GET /api/hello` (is it up?) and, to restart it after an update, `POST /api/quit` (returns nothing but `{"ok":true}`). Never `/api/state`, `/api/results` or anything else. Restart = quit, then start `launchers\windows\start-background.ps1` hidden.
5. **Testing:** use `--demo-only` on port **5180**, and first confirm `/api/hello` shows `"demoOnly":true`.
6. **Tower** (`ssh root@tower`): read only the Actual container's name, image, port and version. Change nothing; don't look at other containers.
7. Ask before installing anything. If a step would break a rule, stop and say so.

## Facts
- Laptop: Legion (Windows). App folder: `%USERPROFILE%\subscription-finder` (git checkout of branch `claude/eager-planck-j2khor`).
- Actual server version 26.11, which matches `@actual-app/api` 26.11.0.
- Install with `npm ci --ignore-scripts`; better-sqlite3 ships a prebuilt Windows binary.
- Code changes: edit, `npm test`, commit and push; on Legion `launchers\windows\update.cmd` pulls, tests and restarts.
- Rules/knobs for detection: `lib/pattern-rules.js`. Full docs: `README.md`.
