// =====================================================================
// server-security.test.js — the app's privacy guards
// Starts the real app in fake-data-only mode on a spare port, then
// knocks on its door in good and bad ways.
// =====================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 5600 + Math.floor(Math.random() * 300);           // a spare door number
const ROOT = path.join(__dirname, '..');
let app;                                                        // the running app
let output = '';                                                // everything it printed

// Send a request with full control over headers (fetch can't fake Host).
function request(method, urlPath, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, method, path: urlPath, headers: { Host: `127.0.0.1:${PORT}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}
const TS_NAME = 'legion.example-tailnet.ts.net';                  // a made-up Tailscale name
const GOOD = { Origin: `http://127.0.0.1:${PORT}`, 'X-Subscription-Finder': '1', 'Content-Type': 'application/json' };

test.before(async () => {
  app = spawn(process.execPath, ['server.js', '--demo-only', '--no-tailscale'], {
    cwd: ROOT,
    env: { ...process.env, SF_PORT: String(PORT), SF_ALLOWED_HOSTS: TS_NAME },   // pretend Tailscale name
  });
  app.stdout.on('data', (c) => (output += c));
  app.stderr.on('data', (c) => (output += c));
  for (let i = 0; i < 50; i++) {                                // wait up to 5 seconds
    try { if ((await request('GET', '/api/hello')).status === 200) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('app did not start');
});
test.after(() => app && app.kill());

test('the page loads, with a strict Content-Security-Policy', async () => {
  const r = await request('GET', '/');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-security-policy'], /default-src 'self'/);
  assert.equal(r.headers['access-control-allow-origin'], undefined, 'no CORS headers');
});

test('the page and its code load nothing from the internet', () => {
  for (const f of ['index.html', 'app.js', 'style.css']) {
    const text = fs.readFileSync(path.join(ROOT, 'public', f), 'utf8');
    assert.ok(!/https?:\/\/(?!127\.0\.0\.1|localhost)[a-z0-9]/i.test(text.replace(/placeholder="[^"]*"/g, '')), `${f} must not reference outside addresses`);
    assert.ok(!/@import|url\(\s*['"]?http/i.test(text), `${f} must not import outside files`);
  }
});

test('wrong Host is rejected', async () => {
  for (const host of ['evil.example', `evil.example:${PORT}`, `192.168.1.5:${PORT}`, '127.0.0.1:9999']) {
    const r = await request('GET', '/api/state', { Host: host });
    assert.equal(r.status, 403, host);
  }
});

test('wrong Origin is rejected', async () => {
  const r1 = await request('GET', '/api/state', { Origin: 'https://evil.example' });
  assert.equal(r1.status, 403);
  const r2 = await request('POST', '/api/demo', { ...GOOD, Origin: 'https://evil.example' }, {});
  assert.equal(r2.status, 403);
  const r3 = await request('GET', '/api/state', { 'Sec-Fetch-Site': 'cross-site' });
  assert.equal(r3.status, 403);
});

test('button presses need our Origin and our special header', async () => {
  const noHeader = await request('POST', '/api/clear', { Origin: GOOD.Origin, 'Content-Type': 'application/json' }, {});
  assert.equal(noHeader.status, 403);
  const noOrigin = await request('POST', '/api/clear', { 'X-Subscription-Finder': '1' }, {});
  assert.equal(noOrigin.status, 403);
  const ok = await request('POST', '/api/clear', GOOD, {});
  assert.equal(ok.status, 200);
  const viaLocalhost = await request('POST', '/api/clear', { ...GOOD, Host: `localhost:${PORT}`, Origin: `http://localhost:${PORT}` }, {});
  assert.equal(viaLocalhost.status, 200, 'the Mac tunnel uses localhost');
});

test('only listens on 127.0.0.1 (not reachable via the network address)', async (t) => {
  const lanAddress = Object.values(os.networkInterfaces()).flat()
    .find((a) => a && a.family === 'IPv4' && !a.internal)?.address;
  if (!lanAddress) return t.skip('this computer has no network address to test with');
  const reachable = await new Promise((resolve) => {
    const s = net.connect({ host: lanAddress, port: PORT });
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
  });
  assert.equal(reachable, false, 'must NOT answer on ' + 'the network address');
});

test('fake-data-only mode refuses real scans', async () => {
  for (const p of ['/api/scan', '/api/test']) {
    const r = await request('POST', p, GOOD, { password: 'x' });
    assert.equal(r.status, 403);
    assert.equal(JSON.parse(r.body).error.code, 'demo-only');
  }
});

test('fake scan works end to end, then Save a copy and Clear', async () => {
  const start = await request('POST', '/api/demo', GOOD, {});
  assert.equal(start.status, 202);
  let job;
  for (let i = 0; i < 100; i++) {
    job = JSON.parse((await request('GET', '/api/state')).body).job;
    if (!job.running) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(job.error, null);
  const results = JSON.parse((await request('GET', '/api/results')).body).results;
  assert.ok(results.totals.itemCount >= 10);

  const saved = await request('POST', '/api/save-report', GOOD, { cancelIds: [] });
  assert.equal(saved.status, 200);
  assert.match(JSON.parse(saved.body).fileName, /^subscriptions-[\d-]+\.html$/);

  const cleared = await request('POST', '/api/clear', GOOD, {});
  assert.equal(cleared.status, 200);
  assert.equal(JSON.parse((await request('GET', '/api/results')).body).results, null);
});

test('the terminal output contains no shop names or amounts', () => {
  const { EXPECTED } = require('../lib/demo-data');
  for (const e of EXPECTED) assert.ok(!output.includes(e.name), 'printed a shop name');
  assert.ok(!/\$\d/.test(output), 'printed an amount');
});

test('Tailscale Serve visitors (your own devices) are let in', async () => {
  // Tailscale Serve may pass the Tailscale name as the Host, or 127.0.0.1. Both must work.
  for (const host of [TS_NAME, `127.0.0.1:${PORT}`]) {
    const page = await request('GET', '/', { Host: host });
    assert.equal(page.status, 200, host);
    const press = await request('POST', '/api/clear', { ...GOOD, Host: host, Origin: `https://${TS_NAME}` }, {});
    assert.equal(press.status, 200, host);
  }
});

test('look-alike Tailscale names and plain http are still rejected', async () => {
  assert.equal((await request('GET', '/api/state', { Host: 'evil.example-tailnet.ts.net' })).status, 403);
  assert.equal((await request('GET', '/api/state', { Host: TS_NAME + '.evil.example' })).status, 403);
  const other = await request('POST', '/api/clear', { ...GOOD, Host: TS_NAME, Origin: 'https://evil.example-tailnet.ts.net' }, {});
  assert.equal(other.status, 403);
  const plainHttp = await request('POST', '/api/clear', { ...GOOD, Host: TS_NAME, Origin: `http://${TS_NAME}` }, {});
  assert.equal(plainHttp.status, 403);
});

test('phone home-screen files are served', async () => {
  const m = await request('GET', '/manifest.webmanifest');
  assert.equal(m.status, 200);
  assert.equal(JSON.parse(m.body).start_url, '/');
  assert.equal((await request('GET', '/icon-192.png')).headers['content-type'], 'image/png');
});
