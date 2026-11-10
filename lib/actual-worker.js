// =====================================================================
// actual-worker.js — the helper that actually talks to your Actual server
// ---------------------------------------------------------------------
// The main app starts this as a separate little program for each scan,
// gives it the job (including passwords) over a private channel, and
// the helper answers with either counts ("test") or the cleaned list of
// charges ("fetch"). Then it deletes its temporary budget copy and quits.
// Anything it prints is thrown away by the main app.
// =====================================================================

const fs = require('node:fs/promises');  // file tools (make/delete folders)
const os = require('node:os');           // finds the system's temp folder
const path = require('node:path');       // builds file paths safely
const { normalizeTransactions } = require('./get-transactions');

// Format a Date as 'YYYY-MM-DD' (the format Actual uses).
const ymd = (d) => d.toISOString().slice(0, 10);

// Wait for the job from the main app (arrives exactly once).
process.once('message', async (job) => {
  let api = null;                  // the Actual package, loaded below
  let started = false;             // did we connect? (then we must disconnect)
  let cacheDir = null;             // the temporary photocopy folder
  let reply;                       // what we'll send back

  try {
    // 1) Make a brand-new, empty temporary folder for Actual's copy.
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-actual-cache-'));

    // 2) Connect to the server.
    process.send({ type: 'step', step: 'connecting' });
    api = require('@actual-app/api');
    const config = { dataDir: cacheDir, serverURL: job.serverURL, verbose: false };
    if (job.apiKey) config.sessionToken = job.apiKey;  // budget API key (preferred)
    else config.password = job.password;               // or the server password
    await api.init(config);
    started = true;

    // 3) Download (photocopy) the budget.
    process.send({ type: 'step', step: 'downloading' });
    const options = job.encryptionPassword ? { password: job.encryptionPassword } : undefined;
    await api.downloadBudget(job.syncId, options);

    // 4) Work out the date range: N whole months back, up to today.
    const end = new Date();
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - job.months, 1));

    // 5) Read every account (open AND closed) and every payee.
    const accounts = await api.getAccounts();         // includes closed accounts
    const payees = await api.getPayees();
    const transactions = [];
    for (const account of accounts) {
      const list = await api.getTransactions(account.id, ymd(start), ymd(end));
      transactions.push(...list);
    }

    if (job.action === 'test') {
      // Only counts. Nothing else leaves this helper.
      reply = { accounts: accounts.length, transactions: transactions.length };
    } else {
      // Cleaned list of outgoing charges, plus the first date we saw.
      const charges = normalizeTransactions({ payees, transactions });
      const firstDate = transactions.reduce((m, t) => (t.date < m ? t.date : m), ymd(end));
      reply = { charges, firstDate };
    }
  } catch (err) {
    // Only pass back the error's TYPE and CODE. Never its message,
    // because messages can contain addresses or other details.
    const code = typeof err?.code === 'string' && /^[a-z0-9_-]{1,40}$/i.test(err.code) ? err.code : undefined;
    reply = { error: true, code, name: err?.name || 'Error' };
  } finally {
    // 6) Always disconnect and shred the temporary copy.
    if (started) { try { await api.shutdown(); } catch { /* ignore */ } }
    if (cacheDir) { try { await fs.rm(cacheDir, { recursive: true, force: true }); } catch { /* ignore */ } }
  }

  // 7) Send the answer, then quit.
  const msg = reply.error
    ? { type: 'error', code: reply.code, name: reply.name }
    : { type: 'result', data: reply };
  process.send(msg, () => process.exit(0)); // exit once the answer is delivered
});
