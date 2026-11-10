// =====================================================================
// server.js — the app's "front desk"
// ---------------------------------------------------------------------
// Analogy: this is a tiny private web server, like a website that only
// exists inside your laptop. Your browser visits it at
//     http://127.0.0.1:5172      (127.0.0.1 means "this very computer")
// It hands out the page (public/ folder) and answers the page's
// button presses (the /api/... addresses below).
//
// Safety features:
//   * listens on 127.0.0.1 only, so nothing else on your Wi-Fi can reach it
//   * checks the Host and Origin of every request, so another website
//     open in your browser can't poke at it
//   * strict Content-Security-Policy: the page may only load files from here
//   * prints only progress words and counts (safe to paste for help)
//
// Start options (the launchers and npm scripts use these):
//   --open       open the page in the browser once started
//   --demo-only  fake data only; real scans are switched off
//   --tunnel     used by the Mac launcher: quit when the SSH window closes
// =====================================================================

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const settings = require('./lib/settings');
const savedKeys = require('./lib/saved-keys');
const { normalizeTransactions, runActualJob } = require('./lib/get-transactions');
const { findPatterns } = require('./lib/find-patterns');
const { labelResults, ollamaStatus } = require('./lib/label-with-local-ai');
const { saveReport } = require('./lib/save-report');
const { makeDemoBudget } = require('./lib/demo-data');
const { safeError } = require('./lib/safe-errors');

const DEFAULT_PORT = 5172;                       // the "door number" the app uses
const HOST = '127.0.0.1';                        // ONLY this computer
const PUBLIC_DIR = path.join(__dirname, 'public');

// The only files the page is allowed to load (a guest list, not a folder share).
const STATIC_FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/icon.svg': ['icon.svg', 'image/svg+xml'],
  '/icon-192.png': ['icon-192.png', 'image/png'],                      // phone home-screen icon
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'], // "Add to Home Screen" info
};

// Security headers sent with every answer.
const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; " +
    "font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',           // don't guess file types
  'Referrer-Policy': 'no-referrer',              // don't tell other sites where you came from
  'X-Frame-Options': 'DENY',                     // can't be embedded in another site
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cache-Control': 'no-store',                   // browser shouldn't keep copies of answers
};

// Plain-English names for the progress steps.
const STEP_PERCENT = { starting: 2, connecting: 10, downloading: 30, patterns: 60, labeling: 70, done: 100 };

// Safe log line: only fixed words and numbers ever go through here.
const log = (...words) => console.log('[subscription-finder]', ...words);

// ---------------------------------------------------------------------
// createApp: builds the server. Tests call this directly.
// ---------------------------------------------------------------------
//   extraHosts: extra names the app may be visited by, e.g. the laptop's
//   Tailscale name "legion.tail1234.ts.net" (used with Tailscale Serve).
//   findHosts: optional function that looks up the Tailscale name again
//   (used if Tailscale wasn't ready yet when the app started).
function createApp({ port = DEFAULT_PORT, demoOnly = false, extraHosts = [], findHosts = null } = {}) {
  // Everything the app remembers lives here, in memory only.
  const state = {
    results: null,                               // last scan's results (never written to disk)
    job: { running: false, kind: null, step: null, percent: 0, error: null, testResult: null, aiNote: null },
  };

  // Which Host / Origin values count as "the app itself".
  // Like a guest list at the door: this laptop's own names, plus the
  // Tailscale name (Tailscale Serve brings visitors in under that name).
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const allowedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  const addHost = (h) => {
    const name = String(h || '').trim().toLowerCase().replace(/\.$/, ''); // drop a trailing dot
    if (!/^[a-z0-9.-]+$/.test(name)) return;                          // ignore anything odd
    allowedHosts.add(name);                                            // https://name (port 443 is implied)
    allowedOrigins.add(`https://${name}`);
  };
  extraHosts.forEach(addHost);

  // If a visitor arrives under an unknown "*.ts.net" name, ask Tailscale
  // once more (at most every 30 seconds) in case it wasn't ready at start-up.
  // Only names Tailscale itself reports are ever added.
  let lastLookup = 0;
  async function maybeRefreshHosts(req) {
    const host = String(req.headers.host || '').toLowerCase();
    if (!findHosts || allowedHosts.has(host) || !host.endsWith('.ts.net')) return;
    if (Date.now() - lastLookup < 30000) return;
    lastLookup = Date.now();
    const found = await findHosts().catch(() => null);
    if (found) { addHost(found); log('Tailscale name found; remote access ready'); }
  }

  // --- small helpers for answering ---
  const send = (res, status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type });
    res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
  };
  const fail = (res, status, err) => send(res, status, { error: safeError(err) });

  // Read a small JSON body from a request (max 64 KB).
  const readJson = (req) => new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 65536) { reject(Object.assign(new Error('x'), { code: 'bad-request' })); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(Object.assign(new Error('x'), { code: 'bad-request' })); }
    });
    req.on('error', reject);
  });

  // --- the guard at the door: is this request really from our own page? ---
  function isAllowed(req) {
    const host = String(req.headers.host || '').toLowerCase();
    if (!allowedHosts.has(host)) return false;                         // wrong Host: reject
    const origin = req.headers.origin;
    if (origin !== undefined && !allowedOrigins.has(String(origin).toLowerCase())) return false; // other site
    if (req.headers['sec-fetch-site'] === 'cross-site') return false;  // browser says "from another site"
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // Button presses must come from our page: Origin present + our special header.
      if (origin === undefined) return false;
      if (req.headers['x-subscription-finder'] !== '1') return false;
    }
    return true;
  }

  // --- the progress tracker ---
  const setStep = (step) => {
    state.job.step = step;
    state.job.percent = STEP_PERCENT[step] ?? state.job.percent;
    log('step:', step);
  };

  // Work out which login to use: what you typed, or what's saved on the laptop.
  async function pickLogin(body) {
    const typed = {
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : '',
      password: typeof body.password === 'string' ? body.password : '',
      encryptionPassword: typeof body.encryptionPassword === 'string' ? body.encryptionPassword : '',
    };
    if (typed.apiKey || typed.password) return { login: typed, typed: true };
    const saved = await savedKeys.loadKeys().catch(() => null);
    if (saved && (saved.apiKey || saved.password)) {
      // A typed encryption password wins over a saved one.
      return { login: { ...saved, encryptionPassword: typed.encryptionPassword || saved.encryptionPassword || '' }, typed: false };
    }
    throw Object.assign(new Error('x'), { code: 'missing-login' });
  }

  // --- the jobs: test connection, and scan ---
  async function runJob(kind, body) {
    state.job = { running: true, kind, step: null, percent: 0, error: null, testResult: null, aiNote: null };
    setStep('starting');
    let login = null;                                                  // passwords: memory only, this job only
    try {
      const s = settings.loadSettings();
      let charges, firstDate;

      if (kind === 'demo') {
        // Fake data: same processing steps as a real scan.
        setStep('connecting'); await pause(300);
        setStep('downloading'); await pause(300);
        const budget = makeDemoBudget();
        charges = normalizeTransactions(budget);
        firstDate = budget.firstDate;
      } else {
        if (demoOnly) throw Object.assign(new Error('x'), { code: 'demo-only' });
        if (!s.serverURL || !s.syncId) throw Object.assign(new Error('x'), { code: 'missing-settings' });
        const picked = await pickLogin(body);
        login = picked.login;
        const data = await runActualJob({
          action: kind === 'test' ? 'test' : 'fetch',
          serverURL: s.serverURL, syncId: s.syncId, months: s.months,
          apiKey: login.apiKey || undefined,
          password: login.apiKey ? undefined : login.password,
          encryptionPassword: login.encryptionPassword || undefined,
        }, setStep);
        // It worked. If asked, remember the typed login on this laptop.
        if (picked.typed && body.remember === true) await savedKeys.saveKeys(login);
        if (kind === 'test') {
          state.job.testResult = { accounts: data.accounts, transactions: data.transactions };
          log('test ok:', data.accounts, 'accounts,', data.transactions, 'transactions');
          setStep('done');
          return;
        }
        charges = data.charges;
        firstDate = data.firstDate;
      }

      // Find the patterns (plain math).
      setStep('patterns');
      const results = findPatterns(charges, { firstDate, salt: settings.idSalt() });
      results.demo = kind === 'demo';
      results.aiLabeled = false;
      log('found', results.totals.itemCount, 'recurring items');

      // Optional: label with the local AI.
      if (s.aiEnabled) {
        setStep('labeling');
        const r = await labelResults(results, {
          ollamaURL: s.ollamaURL, model: s.model,
          onProgress: (done, total) => {
            state.job.percent = 70 + Math.round((done / Math.max(total, 1)) * 28);
            log('AI checked', done, 'of', total, 'names');
          },
        });
        state.job.aiNote = r.ok ? null : (r.code || 'some-labels-unknown');
        log('AI labels:', r.labeled || 0, 'of', r.total || 0, r.ok ? '' : '(AI not available or some failed)');
      }

      state.results = results;
      setStep('done');
    } catch (err) {
      state.job.error = safeError(err);
      log('stopped with code:', state.job.error.code);
    } finally {
      login = null;                                                    // forget passwords
      state.job.running = false;
    }
  }

  // --- the request handler ---
  async function handle(req, res) {
    await maybeRefreshHosts(req);
    if (!isAllowed(req)) return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const route = `${req.method} ${url.pathname}`;

    // Static files (the page itself).
    if (req.method === 'GET' && STATIC_FILES[url.pathname]) {
      const [file, type] = STATIC_FILES[url.pathname];
      return send(res, 200, fs.readFileSync(path.join(PUBLIC_DIR, file)), type);
    }

    try {
      switch (route) {
        case 'GET /api/hello':                                         // "is the app here?" (+ is it the fake-data copy?)
          return send(res, 200, { app: 'subscription-finder', demoOnly });

        case 'GET /api/state':                                         // everything the page needs to draw itself
          return send(res, 200, {
            demoOnly,
            platform: process.platform,
            settings: settings.loadSettings(),
            keys: savedKeys.keysInfo(),
            job: state.job,
            hasResults: Boolean(state.results),
          });

        case 'POST /api/settings':
          return send(res, 200, { settings: settings.saveSettings(await readJson(req)) });

        case 'GET /api/ollama': {
          const s = settings.loadSettings();
          return send(res, 200, await ollamaStatus(s.ollamaURL, s.model));
        }

        case 'POST /api/forget-keys':
          savedKeys.forgetKeys();
          return send(res, 200, { ok: true });

        case 'POST /api/test':
        case 'POST /api/scan':
        case 'POST /api/demo': {
          if (state.job.running) return fail(res, 409, { code: 'busy' });
          const body = await readJson(req);
          const kind = url.pathname.slice(5);                          // 'test' | 'scan' | 'demo'
          if (demoOnly && kind !== 'demo') return fail(res, 403, { code: 'demo-only' });
          runJob(kind, body);                                          // runs in the background
          return send(res, 202, { started: true });
        }

        case 'GET /api/results':
          return send(res, 200, { results: state.results });

        case 'POST /api/clear':
          state.results = null;
          return send(res, 200, { ok: true });

        case 'POST /api/save-report': {
          if (!state.results) return fail(res, 400, { code: 'bad-request' });
          const body = await readJson(req);
          const ids = Array.isArray(body.cancelIds) ? body.cancelIds.filter((x) => typeof x === 'string') : [];
          const fileName = saveReport(state.results, ids);
          log('saved a copy');
          return send(res, 200, { fileName, folder: 'Documents/subscription-reports' });
        }

        case 'POST /api/quit':
          send(res, 200, { ok: true });
          log('quit button pressed; goodbye');
          setTimeout(() => process.exit(0), 200);
          return undefined;

        default:
          return send(res, 404, { error: { message: 'Not found', code: 'not-found' } });
      }
    } catch (err) {
      return fail(res, 400, err);
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => fail(res, 500, err));
  });
  return { server, state };
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Open a web address in the default browser.
function openBrowser(url) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  execFile(cmd[0], cmd[1], { windowsHide: true }, () => {});
}

// Is our app already running on this port? (asks /api/hello)
async function alreadyRunning(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/hello`, { signal: AbortSignal.timeout(2000) });
    return (await res.json()).app === 'subscription-finder';
  } catch { return false; }
}

// Ask Tailscale for this laptop's full Tailscale name, e.g.
// "legion.tail1234.ts.net". Returns null if Tailscale isn't installed/on.
function tailscaleName() {
  const candidates = process.platform === 'win32'
    ? ['tailscale', 'C:\\Program Files\\Tailscale\\tailscale.exe']
    : ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'];
  const tryOne = (i) => new Promise((resolve) => {
    if (i >= candidates.length) return resolve(null);
    execFile(candidates[i], ['status', '--json'], { windowsHide: true, timeout: 4000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve(tryOne(i + 1));                          // try the next place
      try {
        const name = String(JSON.parse(stdout)?.Self?.DNSName || '').replace(/\.$/, '');
        resolve(name || null);
      } catch { resolve(null); }
    });
  });
  return tryOne(0);
}

// ---------------------------------------------------------------------
// Started from the command line (npm start, launchers).
// ---------------------------------------------------------------------
async function main() {
  const args = new Set(process.argv.slice(2));
  const port = Number(process.env.SF_PORT) || DEFAULT_PORT;
  const demoOnly = args.has('--demo-only');
  const url = `http://127.0.0.1:${port}/`;

  if (demoOnly) {
    // Fake-data mode uses a throwaway settings folder, so it never
    // touches your real settings, saved keys or reports.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-demo-'));
    process.env.SF_HOME = path.join(tmp, 'home');
    process.env.SF_REPORTS_DIR = path.join(tmp, 'reports');
    log('fake-data-only mode (real scans switched off)');
  }

  // --tunnel: the Mac launcher keeps this program's input open; when the
  // Mac window closes, the input closes, and we quit.
  if (args.has('--tunnel')) {
    process.stdin.on('end', () => { log('Mac window closed; stopping'); process.exit(0); });
    process.stdin.on('error', () => process.exit(0));
    process.stdin.resume();
  }

  // Extra names visitors may use: your Tailscale name (found automatically),
  // plus any listed in SF_ALLOWED_HOSTS (comma-separated).
  const extraHosts = (process.env.SF_ALLOWED_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean);
  const tsName = args.has('--no-tailscale') ? null : await tailscaleName();
  if (tsName) extraHosts.push(tsName);

  const { server } = createApp({ port, demoOnly, extraHosts, findHosts: args.has('--no-tailscale') ? null : tailscaleName });
  server.on('error', async (err) => {
    if (err.code === 'EADDRINUSE' && (await alreadyRunning(port))) {
      log('already running at', url);
      if (args.has('--open')) openBrowser(url);
      if (!args.has('--tunnel')) process.exit(0);
      log('keeping the Mac connection open; close the Mac window to disconnect');
      return;                                                          // stay alive for the tunnel
    }
    log('could not start, code:', err.code || 'unknown');
    process.exit(1);
  });
  // Still only listening on 127.0.0.1. Other devices reach the app only
  // through Tailscale Serve (see README, "Use it from anywhere").
  server.listen(port, HOST, () => {
    log('running at', url);
    if (tsName) log(`from your other devices (needs Tailscale Serve on): https://${tsName}/`);
    log('to stop: press the Quit button, or close this window');
    if (args.has('--open')) openBrowser(url);
  });
}

if (require.main === module) main();

module.exports = { createApp, DEFAULT_PORT, HOST };
