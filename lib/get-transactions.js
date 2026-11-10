// =====================================================================
// get-transactions.js — fetch spending from your Actual server
// ---------------------------------------------------------------------
// Analogy: Actual's server is a filing cabinet in another room. The
// Actual package doesn't ask the cabinet questions; it photocopies the
// whole budget into a temporary folder here and reads the copy.
// We shred that copy (delete the folder) as soon as we're done, even if
// something went wrong.
//
// The actual talking-to-Actual happens in a separate helper program
// (actual-worker.js). That keeps the main app tidy and lets us mute
// anything the Actual package might print, so the terminal stays safe
// to paste.
// =====================================================================

const { fork } = require('node:child_process'); // starts the helper program
const path = require('node:path');               // builds file paths safely
const { cleanName, nameKey } = require('./clean-names');

// ---------------------------------------------------------------------
// Turn Actual's raw data into a simple list of "money going out" charges.
// Used for BOTH real data and fake demo data, so tests cover the real path.
//   accounts:     [{ id, name, closed }]
//   payees:       [{ id, name, transfer_acct }]
//   transactions: Actual transactions (split purchases arrive "grouped":
//                 one parent with its pieces inside `subtransactions`)
// Returns: [{ date: 'YYYY-MM-DD', cents: 1549, name, key }]
// ---------------------------------------------------------------------
function normalizeTransactions({ payees, transactions }) {
  // Make a quick lookup table: payee id -> payee details.
  const payeeById = new Map((payees || []).map((p) => [p.id, p]));

  // Is this transaction a move between my own accounts?
  const isTransfer = (t) => {
    if (t.transfer_id) return true;                    // Actual links both sides of a transfer
    const payee = payeeById.get(t.payee);
    return Boolean(payee && payee.transfer_acct);      // "transfer payees" point at an account
  };

  const out = [];                                      // the cleaned-up list we'll return
  for (const t of transactions || []) {
    if (t.tombstone) continue;                         // deleted transaction: skip
    if (t.is_child) continue;                          // a split piece on its own: parent covers it
    if (t.starting_balance_flag) continue;             // opening balance, not a purchase
    if (isTransfer(t)) continue;                       // money moving between my accounts

    // Work out how much actually left the house.
    let amount = t.amount;                             // whole cents; spending is negative
    if (Array.isArray(t.subtransactions) && t.subtransactions.length) {
      // A split purchase: add up the pieces, but leave out any piece that
      // is itself a transfer (e.g. part of a payment moved to savings).
      amount = t.subtransactions
        .filter((s) => !s.tombstone && !isTransfer(s))
        .reduce((sum, s) => sum + s.amount, 0);
    }
    if (!(amount < 0)) continue;                       // refunds and income: skip

    // Pick the best name: the payee name, else the original bank description.
    const payee = payeeById.get(t.payee);
    const name = cleanName((payee && payee.name) || t.imported_payee || '');
    out.push({ date: t.date, cents: -amount, name, key: nameKey(name) });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)); // oldest first
  return out;
}

// ---------------------------------------------------------------------
// Ask the helper program to fetch data from Actual.
//   job: { action: 'test' | 'fetch', serverURL, syncId, months,
//          password | apiKey, encryptionPassword }
//   onStep: called with 'connecting' / 'downloading' as it goes
// Passwords travel to the helper over a private in-memory channel
// (not the command line, not a file).
// ---------------------------------------------------------------------
function runActualJob(job, onStep = () => {}) {
  return new Promise((resolve, reject) => {
    const worker = fork(path.join(__dirname, 'actual-worker.js'), [], {
      silent: true,                                    // capture its printing...
      env: { ...process.env, NODE_OPTIONS: '' },       // (don't inherit test/debug flags)
    });
    worker.stdout.resume();                            // ...and throw it away unread
    worker.stderr.resume();                            // (same for error printing)

    let finished = false;                              // so we only answer once
    const done = (fn, value) => { if (!finished) { finished = true; fn(value); } };

    worker.on('message', (msg) => {
      if (msg.type === 'step') onStep(msg.step);       // progress update
      if (msg.type === 'result') done(resolve, msg.data);
      if (msg.type === 'error') {
        const err = new Error('actual-failed');        // generic text on purpose
        err.code = msg.code;                           // e.g. 'invalid-password'
        err.name = msg.name || 'Error';                // e.g. 'TypeError'
        done(reject, err);
      }
    });
    worker.on('exit', (code) => {                      // helper quit before answering
      const err = new Error('actual-worker-exited');
      err.code = 'worker-exited-' + code;
      done(reject, err);
    });

    worker.send(job);                                  // hand over the job
  });
}

module.exports = { normalizeTransactions, runActualJob };
