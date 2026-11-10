// =====================================================================
// helpers.test.js — AI labeling, saved report, safe errors, cache cleanup
// =====================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { labelResults, checkLocalOllamaUrl, parseModelJson, ollamaStatus } = require('../lib/label-with-local-ai');
const { buildReportHtml } = require('../lib/save-report');
const { safeError } = require('../lib/safe-errors');
const { runActualJob } = require('../lib/get-transactions');
const { makeDemoBudget } = require('../lib/demo-data');
const { normalizeTransactions } = require('../lib/get-transactions');
const { findPatterns } = require('../lib/find-patterns');

const demoResults = () => {
  const b = makeDemoBudget('2026-11-10');
  return findPatterns(normalizeTransactions(b), { today: '2026-11-10', firstDate: b.firstDate });
};

test('the AI address must be this laptop', () => {
  assert.equal(checkLocalOllamaUrl('http://127.0.0.1:11434'), 'http://127.0.0.1:11434');
  assert.equal(checkLocalOllamaUrl('http://localhost:11434'), 'http://localhost:11434');
  for (const bad of ['http://192.168.1.10:11434', 'http://tower:11434', 'https://api.example.com', 'http://127.0.0.1.evil.com', 'nonsense']) {
    assert.throws(() => checkLocalOllamaUrl(bad), bad);
  }
});

test('labeling refuses a non-local AI address and does not crash', async () => {
  const r = demoResults();
  const out = await labelResults(r, { ollamaURL: 'http://192.168.1.10:11434', model: 'x' });
  assert.equal(out.ok, false);
  assert.equal(out.code, 'ollama-must-be-local');
});

test('thinking text is stripped before reading JSON', () => {
  const parsed = parseModelJson('<think>hmm, let me see</think>\n{"items":[{"i":0,"kind":"other","what_it_is":"x"}]}');
  assert.equal(parsed.items[0].kind, 'other');
});

test('labeling with a pretend Ollama sends ONLY names, and fills labels', async () => {
  const seen = [];
  // A fake Ollama on this computer that answers "subscription / test label".
  const fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'qwen3:14b' }] })); return; }
      const msg = JSON.parse(body);
      seen.push(msg);
      const names = msg.messages[0].content.split('Names:\n')[1].split('\n');
      const items = names.map((_, i) => ({ i, kind: i === 0 ? 'store_or_restaurant' : 'subscription', what_it_is: 'test label' }));
      res.end(JSON.stringify({ message: { content: JSON.stringify({ items }) } }));
    });
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${fake.address().port}`;
  try {
    assert.equal((await ollamaStatus(url, 'qwen3:14b')).state, 'running');
    assert.equal((await ollamaStatus(url, 'gpt-oss:20b')).state, 'model-missing');

    const r = demoResults();
    const out = await labelResults(r, { ollamaURL: url, model: 'qwen3:14b' });
    assert.equal(out.ok, true);
    assert.equal(r.aiLabeled, true);
    assert.ok(r.buckets.flatMap((b) => b.items).every((i) => i.whatItIs === 'test label'));

    // Privacy: the request must not contain amounts or dates.
    const sent = JSON.stringify(seen);
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(sent), 'no dates sent');
    assert.ok(!/\$\d|\d+\.\d\d/.test(sent), 'no amounts sent');
    assert.equal(seen[0].options.temperature, 0);
    assert.equal(seen[0].think, false);
  } finally {
    fake.close();
  }
});

test('labeling survives Ollama being off', async () => {
  const r = demoResults();
  const out = await labelResults(r, { ollamaURL: 'http://127.0.0.1:1', model: 'qwen3:14b' });
  assert.equal(out.ok, false);
  assert.equal(r.aiLabeled, false);
});

test('a saved copy blocks all network requests and escapes names', () => {
  const r = demoResults();
  r.buckets[0].items[0].name = '<img src=https://evil.example/x>';
  const html = buildReportHtml(r, []);
  assert.match(html, /default-src 'none'/);
  assert.ok(!html.includes('<img'), 'names are escaped');
  assert.ok(!/<[a-z][^>]*\s(src|href)\s*=\s*["']?https?:/i.test(html), 'no tags load outside files');
});

test('error messages never include the original text', () => {
  const e = new Error('could not reach https://budget.secret.example with password hunter2');
  e.code = 'network-failure';
  const safe = safeError(e);
  assert.ok(!JSON.stringify(safe).includes('secret'));
  assert.ok(!JSON.stringify(safe).includes('hunter2'));
  const weird = safeError(Object.assign(new TypeError('Card 1234 at Shop X'), { code: 'has spaces and data' }));
  assert.deepEqual(Object.keys(weird).sort(), ['code', 'message']);
  assert.equal(weird.code, 'TypeError');
});

test('a failed Actual connection still deletes its temporary cache folder', async () => {
  const before = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('sf-actual-cache-')).length;
  // Port 1 on this computer: nothing is there, so the connection fails.
  await assert.rejects(
    runActualJob({ action: 'test', serverURL: 'http://127.0.0.1:1', syncId: 'x', months: 1, password: 'not-real' }),
    (err) => typeof err.code === 'string' || typeof err.name === 'string',
  );
  const after = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('sf-actual-cache-')).length;
  assert.equal(after, before, 'cache folder removed');
});
