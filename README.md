# Subscription Finder

A small, private app that reads your spending from your own **Actual Budget** server and sorts every repeating charge into **weekly, every 2 weeks, monthly, every 2 months, quarterly, twice a year, yearly** and **pay-as-you-go**. Use it to decide what to cancel.

It runs on your **home laptop** (the Lenovo Legion). You can use it sitting at the laptop, or from your Mac.

> **Analogy:** the app is like hiring a bookkeeper who comes to your house, reads your statements at your kitchen table, and never takes any paper home. The "kitchen table" is the laptop.

---

## What never leaves the house

| Thing | Where it goes |
|---|---|
| Your transactions | From your Actual server → the laptop's memory. A temporary copy Actual makes is **deleted after every scan**, even if the scan fails. |
| Results | Only in the running app's memory. Gone when you press **Clear results**, **Quit**, or close the window. Written to disk **only** if you press **Save a copy**. |
| Passwords / API key | Typed into the app, used for one scan, then forgotten. **Unless** you tick "Remember on this laptop", which saves them **on the laptop only**, locked with Windows (see below). |
| Shop names for AI labels | Sent only to the AI on the laptop itself (Ollama at `127.0.0.1`). Never amounts or dates. The app refuses any AI address that isn't the laptop. |
| The page itself | Loads nothing from the internet: no fonts, no scripts, no images from outside. |

**Who can open the app?** The app listens on `127.0.0.1` ("this very computer"), so other devices on your Wi-Fi can't even see it. Your own devices get in one of two ways: through **Tailscale Serve** (home-base mode, below), or through an **SSH tunnel**, a private encrypted hallway from your Mac. Both routes are encrypted. The app also checks every request, so a random website open in another browser tab can't talk to it.

---

## Opening the app

### From anywhere: phone, Mac, any of your devices (home-base mode)
Legion is the app's **home base**. Once it's set up (see **Setting up home-base mode** below), the app runs quietly in the background whenever you're logged in to the laptop. You open it from any device that's on **your** Tailscale by visiting:

```
https://legion.<your-tailnet>.ts.net
```

(The installer prints your exact address.) On a phone, open that in the browser, then choose **Add to Home Screen** so it opens like an app.

> **How it stays private:** the app itself still only answers the laptop (`127.0.0.1`). **Tailscale Serve** is a doorman: it accepts visitors only from devices signed in to your Tailscale, brings them in through an encrypted connection with a real HTTPS padlock, and walks them to the app. Devices on your home Wi-Fi that aren't on your Tailscale see nothing, and neither does the internet.
>
> One thing to know: **anyone on your Tailscale can open the app.** If you ever share your tailnet or the laptop with other people in the Tailscale admin console, they could too.

### Sitting at the laptop
Double-click **Subscription Finder** on the laptop's desktop. A black window opens (leave it open), then your browser shows the app. To stop: press **Quit** in the app, or close the black window.

### From your Mac
Double-click **Open Subscription Finder** on your Mac's desktop. A Terminal window opens, connects to the laptop, and your browser shows the app. To stop: press **Quit**, or close the Terminal window. Either one stops the app on the laptop too.

This works from anywhere your Mac can reach `legion`: at home, or away from home with Tailscale switched on.

If the laptop is asleep or off, the Terminal window says so in plain English.

### Backup: typing commands instead
If an icon doesn't work, you can start it by hand.

**At the laptop** (in a Command Prompt):
```
cd %USERPROFILE%\subscription-finder
npm start
```
**From the Mac** (in Terminal):
```
ssh -T -L 5172:127.0.0.1:5172 insan@legion "cmd /c \"%USERPROFILE%\subscription-finder\launchers\windows\start-for-mac.cmd\""
```
then open http://localhost:5172 in your browser.

**Practice with fake data only:** `npm run demo` (real scans are switched off in this mode, and it uses a throwaway settings folder).

---

## The three screens

### 1. Setup
- **Actual server address**: what you type in the browser to open Actual, e.g. `https://budget.example.com` or `http://yourserver:5006` (5006 is Actual's usual "door number").
- **Budget Sync ID**: in Actual, go to **Settings → Show advanced settings → Sync ID**.
- **Months of history**: 15 is a good default. Yearly charges need 13+ months to show up twice.
- **Local AI labels**: optional. The AI only fills in the **What it is** column ("video streaming", "water bill"…).
- **AI status light:**
  - 🟢 **running**: ready.
  - 🟡 **model not downloaded**: pick a model from the list, or on the laptop run `ollama pull qwen3:14b`.
  - 🔴 **not running**: start Ollama from the Start menu. Scans still work without it.
- **Saved login on this laptop**: says whether a login is saved. **Forget saved login** deletes it.

Settings are saved in a hidden "personal drawer" folder on the laptop: `C:\Users\<you>\.subscription-finder\`. **Passwords are never saved in settings.**

### 2. Scan
- **API key (recommended) or server password.** An API key is like a spare house key that only opens one room: it works for one budget and can be cancelled in Actual without changing your password. Make one in Actual: **Settings → General → Security → API keys → Add key**.
- **Encryption password**: only if you turned on end-to-end encryption in Actual. Otherwise leave it blank.
- **Remember on this laptop**: saves what you typed on the laptop, so next time (even from your Mac, or away from home) you can scan without typing. It's saved only after a successful scan or test.
  - On Windows it's locked with Windows' built-in safe (DPAPI). **Analogy:** a lockbox bolted to the laptop. A copied file is useless on any other computer. Programs on the laptop itself can open it, so keep the laptop's Windows login private.
- **Test connection**: shows only how many accounts and transactions it found.
- **Scan my transactions**: the real thing.
- **Try with fake data**: practice with made-up data.
- The password boxes empty themselves after each scan.

### 3. Results
- **Recurring, per year (active)**: the estimated yearly cost of everything still being charged.
- **You'd save per year**: tick **Cancel?** next to anything you'd drop, and this adds them up. The ticks are remembered by this browser as scrambled codes, never names.
- **Status**: **Active**, or **Maybe already cancelled** (no charge for more than 1½ normal gaps, e.g. 45+ days for a monthly item).
- **Show**: filter by status. **Show stores & restaurants**: hides shops like groceries from pay-as-you-go (only when AI labels exist).
- **Save a copy**: saves one HTML file in `Documents\subscription-reports\` on the laptop. It opens in any browser and **can't connect to the internet** (it has a lock that blocks all network requests).
- **Clear results**: wipes them from memory.

---

## How it decides (the short version)

1. **Keep only money going out.** Refunds, income and transfers between your own accounts are dropped. Split purchases count once.
2. **Group by shop.** Messy bank names like `STREAMFLIX.COM*AB12CD` are tidied to `Streamflix.com`.
3. **Measure the gaps** between charges. Mostly ~30 days apart = monthly; ~365 = yearly, and so on. A skipped or late charge is allowed.
4. **Same shop, different prices?** Charges are split by amount, so one Apple payee with $2.99/month and $29.99/year shows as two items. A price increase is recognised as the same subscription.
5. **No schedule but 3+ charges in a year** → pay-as-you-go. Its yearly cost is what you actually spent in the last 12 months.

**To adjust the rules** (gap sizes, minimum number of charges, how similar amounts must be), edit `lib/pattern-rules.js`. Every number has a comment. Then restart the app.

---

## If something breaks

Every error in the app shows a friendly message plus a short **code** like `invalid-password`. The app is designed so the message, the code, and everything in the black/Terminal window are **safe to paste to Claude or anyone else**: they never contain shop names, amounts, dates, account names, addresses or passwords.

Common ones:

| Code | What to do |
|---|---|
| `network-failure` | Check the server address on Setup, and that the server is running. Away from home? Turn on Tailscale on the laptop. |
| `invalid-password` / `token-expired` | Re-type the password, or make a new API key in Actual. |
| `budget-not-found` | Check the Sync ID. |
| `missing-key` / `decrypt-failure` | Type (or re-type) the encryption password. |
| `self-signed-cert` | See **HTTPS certificate** below. |
| `out-of-sync-migrations` | See **Version mismatch** below. |
| `keys-unavailable` | Saved login can't be read; type it again and tick Remember. |

### HTTPS certificate
If your Actual address starts with `https://` and uses a **self-signed** certificate (your browser warned you the first time), Node.js won't trust it. **Don't turn checking off.** Instead, trust just that one certificate:
1. Save the server's certificate as a file on the laptop, e.g. `C:\Users\<you>\.subscription-finder\actual-cert.pem`.
2. Add one line near the top of both `.bat`/`.cmd` launchers (after `@echo off`):
   `set NODE_EXTRA_CA_CERTS=%USERPROFILE%\.subscription-finder\actual-cert.pem`

A normal certificate (e.g. from Let's Encrypt) needs nothing.

### Version mismatch
The `@actual-app/api` package version follows Actual's releases (e.g. `26.11.0`). If your server is much older or newer and scans fail, install the matching version on the laptop (find yours in Actual under **Settings**, or the **?** help menu):
```
cd %USERPROFILE%\subscription-finder
npm install --save-exact --ignore-scripts @actual-app/api@<your version>
```

### The AI over SSH (Mac launcher)
Ollama normally starts when you log in to Windows (it sits in the system tray). When the Mac launcher starts the app over SSH, the app uses that same running Ollama. If the laptop restarted and nobody has logged in yet, Ollama isn't running. The launcher then tries to start it, and if that doesn't work, scans still run without AI labels. **Most reliable fix:** keep Ollama's "start at login" on (it's the default), and log in to the laptop once after each restart.

---

## Installing on the laptop (one time)

1. Install **Node.js LTS** from nodejs.org, **Git** from git-scm.com, **Tailscale**, and Ollama from ollama.com if you want AI labels.
2. Download the app with git (so it can update itself later). In a Command Prompt:
   `git clone -b claude/eager-planck-j2khor <repo address> %USERPROFILE%\subscription-finder`
3. In that folder: `npm ci --ignore-scripts`, then `npm test`. (`--ignore-scripts` skips compiling the database engine, which comes ready-made for Windows.)
4. Copy `launchers\windows\Subscription Finder.bat` to the Desktop.
5. On the Mac: copy `launchers/mac/Open Subscription Finder.command` to the Desktop.

`HANDOFF-for-Mac.md` has step-by-step instructions that Claude Code on your Mac can follow to do all of this for you, using fake data only.

## Setting up home-base mode (Tailscale)

At the laptop, double-click **`launchers\windows\install-home-base.cmd`**. It:
1. makes the app start by itself, with no window, every time you log in to Windows. It puts a small starter file in your Startup folder, so no administrator rights are needed.
2. starts the app now.
3. turns on **Tailscale Serve** for the app, then prints your address (`https://legion.<your-tailnet>.ts.net`).

The **first time** you run it, Tailscale may print a link asking you to allow HTTPS for your tailnet. Open the link, click allow, then run the installer again.

**Never use `tailscale funnel` for this app.** Funnel puts things on the public internet. Serve (what the installer uses) is for your own devices only.

To undo all of it, double-click `launchers\windows\uninstall-home-base.cmd`.

While in home-base mode, the app's messages go to `C:\Users\<you>\.subscription-finder\app.log`. Like everything the app prints, the log only holds progress words and counts, so it's safe to paste for help.

**Results stay in the laptop's memory** until you press Clear results or the app restarts. In home-base mode the app keeps running, so press **Clear results** when you're done if you'd rather not leave them there.

## Updating the app (working on it over time)

The routine for improvements:
1. Ask Claude for a change. Claude edits the code and pushes it to GitHub. Claude never needs your real data for this.
2. At the laptop, double-click **`launchers\windows\update.cmd`**. Or Claude Code on your Mac can run it over SSH.
3. It downloads the change, runs the automatic checks, and restarts the app. **If any check fails, it doesn't restart with the new version.**

## Files

| File | What it does |
|---|---|
| `server.js` | The app's front desk: serves the page, answers buttons, guards the door. |
| `public/` | The page: `index.html` (layout), `style.css` (looks), `app.js` (buttons). |
| `lib/get-transactions.js` + `lib/actual-worker.js` | Fetch and clean up transactions from Actual. |
| `lib/find-patterns.js` | The pattern math. |
| `lib/pattern-rules.js` | **The knobs** you can adjust. |
| `lib/label-with-local-ai.js` | Optional AI labels via Ollama on the laptop. |
| `lib/save-report.js` | "Save a copy". |
| `lib/demo-data.js` | Fake data plus the answer key (which bucket each fake item belongs in). |
| `lib/settings.js`, `lib/saved-keys.js` | Settings and the optional saved login (the "personal drawer"). |
| `lib/safe-errors.js` | Friendly, safe-to-share error messages. |
| `test/` | Automatic checks. Run with `npm test`. |
| `launchers/windows/` | `Subscription Finder.bat` (desktop icon), `install-home-base.cmd` / `uninstall-home-base.cmd` (Tailscale home base on or off), `update.cmd` (get the newest version), `start-background.ps1` (runs it with no window), `start-for-mac.cmd` (used by the Mac launcher). |
| `launchers/mac/` | `Open Subscription Finder.command`: opens the Tailscale address if set, otherwise uses an SSH tunnel. |
| `public/manifest.webmanifest`, `public/icon-192.png` | Let phones "Add to Home Screen". |
