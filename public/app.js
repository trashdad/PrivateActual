// =====================================================================
// app.js — makes the page's buttons work
// ---------------------------------------------------------------------
// The page talks to the app's server (server.js) on this same laptop.
// Every button press sends a small message to an /api/... address and
// shows the answer. Text from results is always inserted as plain text
// (textContent), never as HTML, so a weird shop name can't break the page.
// =====================================================================

'use strict';

// ---------- tiny helpers ----------
const $ = (id) => document.getElementById(id);                 // find an element by id

// 1549 -> "$15.49"
const money = (cents) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Talk to the server. POSTs carry a special header the server checks for.
async function api(path, body) {
  const options = body === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Subscription-Finder': '1' },
    body: JSON.stringify(body),
  };
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw data.error || { message: 'Something went wrong.', code: 'http-' + res.status };
  return data;
}

// Show a message (and optional safe code) in a message line.
function say(el, text, isError = false) {
  el.textContent = text;
  el.classList.toggle('error', isError);
}

// Make a new element with optional text.
function el(tag, text, className) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (className) e.className = className;
  return e;
}

// Browser storage can be switched off; never let that break the page.
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } },
};

// ---------- tabs ----------
function showTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  for (const t of ['setup', 'scan', 'results']) $('tab-' + t).hidden = t !== name;
  store.set('sf-tab', name);
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

// ---------- SETUP screen ----------
let appState = null;                                               // last /api/state answer

async function loadState() {
  appState = await api('/api/state');
  const s = appState.settings;
  $('mode-badge').hidden = !appState.demoOnly;
  $('serverURL').value = s.serverURL;
  $('syncId').value = s.syncId;
  $('months').value = s.months;
  $('aiEnabled').checked = s.aiEnabled;
  showKeys(appState.keys);
  if (appState.demoOnly) {                                         // real scans off in this mode
    $('btn-test').disabled = true;
    $('btn-scan').disabled = true;
  }
  return appState;
}

// Describe the saved login (yes/no only; the app never shows the key).
function showKeys(keys) {
  if (keys.saved) {
    $('keys-text').textContent = keys.encrypted
      ? 'A login is saved on this laptop, locked with Windows.'
      : 'A login is saved on this laptop (not encrypted on this kind of computer).';
  } else {
    $('keys-text').textContent = 'No login saved. You can tick "Remember on this laptop" on the Scan screen.';
  }
  $('forget-keys').hidden = !keys.saved;
  $('saved-login-note').hidden = !keys.saved;
}

// Check Ollama and fill in the model list.
async function checkOllama() {
  const light = $('ollama-light');
  say($('ollama-text'), 'Checking…');
  light.className = 'light';
  let info;
  try { info = await api('/api/ollama'); }
  catch (e) { info = { state: 'error', models: [], code: e.code }; }

  // Fill the model picker: installed models, plus the chosen one.
  const select = $('model');
  const chosen = appState.settings.model;
  select.replaceChildren();
  for (const m of new Set([chosen, ...info.models])) {
    const opt = el('option', info.models.includes(m) || info.models.includes(m + ':latest') ? m : m + ' (not downloaded)');
    opt.value = m;
    select.append(opt);
  }
  select.value = chosen;

  // Status light and plain-English hint.
  const messages = {
    running: ['good', 'AI is running and the model is ready.', ''],
    'model-missing': ['meh', 'AI is running, but this model is not downloaded.',
      `Pick a downloaded model above, or download this one in a terminal on the laptop: ollama pull ${chosen}`],
    'not-running': ['bad', 'AI is not running.',
      'Start Ollama on the laptop (it lives in the Start menu). Scans still work without it; items just won\'t get descriptions.'],
    error: ['bad', 'AI check failed.', 'Code: ' + (info.code || 'unknown')],
  };
  const [cls, text, hint] = messages[info.state] || messages.error;
  light.classList.add(cls);
  say($('ollama-text'), text);
  $('ollama-hint').textContent = hint;
}

$('ollama-refresh').addEventListener('click', checkOllama);

$('save-settings').addEventListener('click', async () => {
  try {
    const { settings } = await api('/api/settings', {
      serverURL: $('serverURL').value,
      syncId: $('syncId').value,
      months: Number($('months').value),
      aiEnabled: $('aiEnabled').checked,
      model: $('model').value,
    });
    appState.settings = settings;
    say($('settings-msg'), 'Saved.');
    checkOllama();
  } catch (e) {
    say($('settings-msg'), e.message, true);
  }
});

$('forget-keys').addEventListener('click', async () => {
  await api('/api/forget-keys', {});
  showKeys({ saved: false });
});

// ---------- SCAN screen ----------

// Switch the password box label between "API key" and "password".
document.querySelectorAll('input[name=loginType]').forEach((r) => r.addEventListener('change', () => {
  const isKey = document.querySelector('input[name=loginType]:checked').value === 'apiKey';
  $('secret-label').textContent = isKey ? 'Actual API key' : 'Actual server password';
  $('secret-hint').hidden = !isKey;
}));

// Show progress for a running job.
function showProgress(job) {
  $('progress').hidden = false;
  $('bar-fill').style.width = (job.percent || 0) + '%';
  const order = ['connecting', 'downloading', 'patterns', 'labeling', 'done'];
  const now = order.indexOf(job.step);
  document.querySelectorAll('.steps li').forEach((li) => {
    const i = order.indexOf(li.dataset.step);
    li.className = i < now ? 'past' : i === now ? 'now' : '';
  });
}

// Lock or unlock the three scan buttons.
function setBusy(busy) {
  for (const id of ['btn-test', 'btn-scan', 'btn-demo']) $(id).disabled = busy || (appState.demoOnly && id !== 'btn-demo');
}

// Start a job and watch it until it finishes.
async function startJob(kind) {
  const isKey = document.querySelector('input[name=loginType]:checked').value === 'apiKey';
  const body = kind === 'demo' ? {} : {
    apiKey: isKey ? $('secret').value : '',
    password: isKey ? '' : $('secret').value,
    encryptionPassword: $('encryptionPassword').value,
    remember: $('remember').checked,
  };
  setBusy(true);
  $('scan-code').hidden = true;
  say($('scan-msg'), kind === 'test' ? 'Testing the connection…' : 'Working…');
  try {
    await api('/api/' + kind, body);
  } catch (e) {
    setBusy(false);
    return showError(e);
  } finally {
    $('secret').value = '';                                     // clear the password boxes
    $('encryptionPassword').value = '';
  }

  // Check every half second until the job is done.
  let job;
  do {
    await new Promise((r) => setTimeout(r, 500));
    const st = await api('/api/state');
    job = st.job;
    showProgress(job);
    if (!job.running) showKeys(st.keys);
  } while (job.running);
  setBusy(false);

  if (job.error) return showError(job.error);
  if (kind === 'test') {
    say($('scan-msg'), `Connected. Found ${job.testResult.accounts} accounts and ${job.testResult.transactions} transactions.`);
    return;
  }
  say($('scan-msg'), 'Done! Opening your results…');
  await loadResults();
  showTab('results');
}

// Show a friendly error plus its safe-to-share code.
function showError(err) {
  say($('scan-msg'), err.message || 'Something went wrong.', true);
  if (err.code) {
    $('scan-code').hidden = false;
    $('scan-code').textContent = 'Code (safe to share): ' + err.code;
  }
}

$('btn-test').addEventListener('click', () => startJob('test'));
$('btn-scan').addEventListener('click', () => startJob('scan'));
$('btn-demo').addEventListener('click', () => startJob('demo'));

// ---------- RESULTS screen ----------
let results = null;                                             // the current results (memory only)
const CANCEL_KEY = 'sf-cancel-ids';                             // saved ticks: scrambled IDs only

function cancelIds() { return new Set(store.get(CANCEL_KEY, [])); }

async function loadResults() {
  results = (await api('/api/results')).results;
  // Stores & restaurants are hidden by default when AI labels exist.
  $('show-stores').checked = !(results && results.aiLabeled);
  renderResults();
}

const BUCKET_WORDS = { weekly: 'weekly', biweekly: 'every 2 weeks', monthly: 'monthly', bimonthly: 'every 2 months', quarterly: 'quarterly', semiannual: 'twice a year', yearly: 'yearly', payg: 'pay-as-you-go' };

function renderResults() {
  $('no-results').hidden = Boolean(results);
  $('results-area').hidden = !results;
  if (!results) return;

  $('demo-note').hidden = !results.demo;
  $('history-warning').hidden = !results.shortHistory;
  $('history-warning').textContent = `Only ${results.historyMonths} months of history: yearly charges can't be detected yet (they need 13+ months).`;
  $('ai-note').hidden = Boolean(results.aiLabeled);
  $('ai-note').textContent = 'No AI descriptions this time ("What it is" shows "unknown"). Check the AI status on the Setup screen.';
  $('total-yearly').textContent = money(results.totals.activeYearlyCents);

  // Counts per bucket.
  const counts = $('bucket-counts');
  counts.replaceChildren();
  for (const b of results.buckets) counts.append(el('li', `${b.label}: ${b.items.length}`));

  // Filters.
  const statusFilter = $('status-filter').value;
  const showStores = $('show-stores').checked;
  const ticked = cancelIds();

  // One table per bucket.
  const sections = $('sections');
  sections.replaceChildren();
  for (const b of results.buckets) {
    const items = b.items.filter((i) =>
      (statusFilter === 'all' || i.status === statusFilter) &&
      (showStores || b.id !== 'payg' || i.kind !== 'store_or_restaurant'));
    if (!items.length) continue;

    sections.append(el('h3', `${b.label} (${items.length})`));
    const wrap = el('div', null, 'table-wrap');
    const table = el('table');
    const head = el('tr');
    for (const h of ['Name', 'What it is', 'Typical charge', 'How often', 'Last charged', 'Next expected', 'Cost per year', 'Status', 'Cancel?']) head.append(el('th', h));
    const thead = el('thead');
    thead.append(head);
    table.append(thead);
    const tbody = el('tbody');

    for (const i of items) {
      const tr = el('tr');
      if (i.status !== 'active') tr.className = 'cancelled';
      tr.append(el('td', i.name));
      tr.append(el('td', i.whatItIs || 'unknown'));
      tr.append(el('td', money(i.typicalCents), 'num'));
      tr.append(el('td', i.bucket === 'payg' ? `no schedule (~${i.gapDays} days apart)` : `${BUCKET_WORDS[i.bucket]} (~${i.gapDays} days)`));
      tr.append(el('td', i.lastDate));
      tr.append(el('td', i.nextDate || '—'));
      tr.append(el('td', money(i.yearlyCents), 'num'));
      const statusCell = el('td');
      statusCell.append(el('span', i.status === 'active' ? 'Active' : 'Maybe already cancelled', 'pill'));
      tr.append(statusCell);

      // The "Cancel?" tick box. Remembers only the scrambled ID.
      const box = el('input');
      box.type = 'checkbox';
      box.checked = ticked.has(i.id);
      box.setAttribute('aria-label', 'Cancel ' + i.name);
      box.addEventListener('change', () => {
        const set = cancelIds();
        if (box.checked) set.add(i.id); else set.delete(i.id);
        store.set(CANCEL_KEY, [...set]);
        updateSavings();
      });
      const boxCell = el('td');
      boxCell.append(box);
      tr.append(boxCell);
      tbody.append(tr);
    }
    table.append(tbody);
    wrap.append(table);
    sections.append(wrap);
  }
  updateSavings();
}

// Add up the yearly cost of every ticked item.
function updateSavings() {
  if (!results) return;
  const ticked = cancelIds();
  let cents = 0;
  for (const b of results.buckets) for (const i of b.items) if (ticked.has(i.id)) cents += i.yearlyCents;
  $('total-save').textContent = money(cents);
}

$('status-filter').addEventListener('change', renderResults);
$('show-stores').addEventListener('change', renderResults);

$('btn-save').addEventListener('click', async () => {
  try {
    const r = await api('/api/save-report', { cancelIds: [...cancelIds()] });
    say($('results-msg'), `Saved as ${r.fileName} in your ${r.folder} folder on the laptop.`);
  } catch (e) {
    say($('results-msg'), e.message, true);
  }
});

$('btn-clear').addEventListener('click', async () => {
  await api('/api/clear', {});
  results = null;
  renderResults();
  say($('results-msg'), '');
});

// ---------- Quit ----------
$('quit').addEventListener('click', async () => {
  if (!confirm('Stop the app on the laptop? Results in memory will be gone. It starts again next time you log in to the laptop, or when you double-click its icon there.')) return;
  try { await api('/api/quit', {}); } catch { /* it's stopping anyway */ }
  document.querySelector('main').hidden = true;
  document.querySelector('.tabs').hidden = true;
  $('goodbye').hidden = false;
});

// ---------- start-up ----------
(async () => {
  await loadState();
  checkOllama();
  await loadResults();
  // If a scan is still running (e.g. page reloaded), watch it.
  if (appState.job.running) { showTab('scan'); showProgress(appState.job); }
  else showTab(store.get('sf-tab', 'setup'));
})();
