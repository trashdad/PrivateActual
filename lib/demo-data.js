// =====================================================================
// demo-data.js — 15 months of FAKE transactions for practice and tests
// ---------------------------------------------------------------------
// Every shop, amount and date here is made up. The data is shaped
// exactly like what the Actual package returns (accounts, payees,
// transactions with transfers and split purchases), so "Try with fake
// data" goes through the same steps as a real scan.
//
// ANSWER KEY — where each fake item should land:
//   EXPECTED below lists every one. The tests check them all.
// =====================================================================

// A tiny "random number" maker that gives the SAME numbers every time
// (so tests are repeatable). Like shuffling a deck in a fixed way.
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_MS = 86400000;
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

// ---------------------------------------------------------------------
// The answer key. name = the cleaned-up name the app should show.
// ---------------------------------------------------------------------
const EXPECTED = [
  { name: 'Meal Kit Club',      bucket: 'weekly',     status: 'active' },
  { name: 'Sparkle Cleaners',   bucket: 'biweekly',   status: 'active' },
  { name: 'Streamflix.com',     bucket: 'monthly',    status: 'active', note: 'price went up halfway; still ONE item' },
  { name: 'Apple',              bucket: 'monthly',    status: 'active', note: 'same payee as the yearly Apple item' },
  { name: 'Apple',              bucket: 'yearly',     status: 'active', note: 'same payee as the monthly Apple item' },
  { name: 'Iron Gym',           bucket: 'monthly',    status: 'maybe-cancelled', note: 'stopped 4 months ago' },
  { name: 'Cloudbox Storage',   bucket: 'monthly',    status: 'active', note: 'amount varies every month' },
  { name: 'Pest Guard',         bucket: 'bimonthly',  status: 'active' },
  { name: 'City Water Utility', bucket: 'quarterly',  status: 'active', note: 'amount varies' },
  { name: 'Safe Auto Insurance', bucket: 'semiannual', status: 'active' },
  { name: 'Domain Registrar',   bucket: 'yearly',     status: 'active' },
  { name: 'Freshmart Grocery',  bucket: 'payg',       status: 'active' },
  { name: 'Bean There Coffee',  bucket: 'payg',       status: 'active', note: 'bank adds store numbers' },
  { name: 'ZoomRide',           bucket: 'payg',       status: 'active' },
];
// Things that must NOT appear anywhere: transfers and refunds.
const MUST_NOT_APPEAR = ['Transfer: Savings', 'Payroll'];

// ---------------------------------------------------------------------
// Build the fake budget. `today` is 'YYYY-MM-DD' (defaults to real today).
// ---------------------------------------------------------------------
function makeDemoBudget(today = new Date().toISOString().slice(0, 10)) {
  const rand = seededRandom(42);
  const end = Date.parse(today + 'T00:00:00Z');                // today, in milliseconds
  const start = end - 15 * 30.44 * DAY_MS;                      // about 15 months ago

  const accounts = [
    { id: 'acct-checking', name: 'Demo Checking', closed: false },
    { id: 'acct-credit', name: 'Demo Credit Card', closed: false },
    { id: 'acct-oldcard', name: 'Demo Old Card', closed: true },  // closed accounts count too
    { id: 'acct-savings', name: 'Demo Savings', closed: false },
  ];
  const payees = [];
  const transactions = [];
  let n = 0;                                                    // running id counter

  // Add a payee once and remember its id.
  const payeeIds = new Map();
  const payee = (name, extra = {}) => {
    if (!payeeIds.has(name)) {
      const id = 'payee-' + payeeIds.size;
      payeeIds.set(name, id);
      payees.push({ id, name, ...extra });
    }
    return payeeIds.get(name);
  };

  // Add one spending transaction (dollars -> negative cents, like Actual).
  const spend = (ms, payeeName, dollars, opts = {}) => {
    if (ms < start || ms > end) return;                         // keep inside the window
    transactions.push({
      id: 'tx-' + n++,
      account: opts.account || 'acct-credit',
      date: ymd(ms),
      amount: -Math.round(dollars * 100),
      payee: payeeName ? payee(payeeName) : null,
      imported_payee: opts.bank || (payeeName || '').toUpperCase(),
    });
  };

  // Repeat every `days` days going back from `lastMs`.
  const everyDays = (lastMs, days, fn) => {
    for (let ms = lastMs; ms >= start; ms -= days * DAY_MS) fn(ms);
  };
  // Repeat on the same day of every month (calendar months, like real bills).
  const everyMonths = (months, dayOfMonth, stopMonthsAgo, fn) => {
    const t = new Date(end);
    for (let k = stopMonthsAgo; k < 17; k += months) {
      const ms = Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - k, dayOfMonth);
      if (ms <= end) fn(ms, k);
    }
  };

  // ---- weekly: meal kit ----
  everyDays(end - 3 * DAY_MS, 7, (ms) => spend(ms, 'Meal Kit Club', 59.99));
  // ---- every 2 weeks: house cleaning ----
  everyDays(end - 5 * DAY_MS, 14, (ms) => spend(ms, 'Sparkle Cleaners', 120, { account: 'acct-checking' }));
  // ---- monthly streaming with a price rise 7 months ago, messy bank name ----
  everyMonths(1, 9, 0, (ms, k) => spend(ms, null, k >= 7 ? 15.49 : 17.99, { bank: 'STREAMFLIX.COM*AB12CD' }));
  // ---- one payee, two subscriptions: Apple $2.99 monthly + $29.99 yearly ----
  everyMonths(1, 5, 0, (ms) => spend(ms, 'Apple', 2.99, { bank: 'APPLE.COM/BILL' }));
  everyMonths(12, 20, 1, (ms) => spend(ms, 'Apple', 29.99, { bank: 'APPLE.COM/BILL' }));
  // ---- monthly gym that stopped 4 months ago (old card, now closed) ----
  everyMonths(1, 2, 4, (ms) => spend(ms, 'Iron Gym', 39.99, { account: 'acct-oldcard' }));
  // ---- monthly cloud service, amount varies with usage ----
  everyMonths(1, 14, 0, (ms) => spend(ms, 'Cloudbox Storage', 8 + Math.round(rand() * 600) / 100));
  // ---- every 2 months: pest control ----
  everyMonths(2, 17, 1, (ms) => spend(ms, 'Pest Guard', 65));
  // ---- quarterly water bill, amount varies ----
  everyMonths(3, 22, 1, (ms) => spend(ms, 'City Water Utility', 45 + Math.round(rand() * 4500) / 100, { account: 'acct-checking' }));
  // ---- twice a year: car insurance ----
  everyMonths(6, 11, 2, (ms) => spend(ms, 'Safe Auto Insurance', 612, { account: 'acct-checking' }));
  // ---- yearly: domain name ----
  everyMonths(12, 3, 2, (ms) => spend(ms, 'Domain Registrar', 18.0));

  // ---- irregular: groceries, coffee, ride-share ----
  for (let ms = start; ms < end; ms += (3 + Math.floor(rand() * 10)) * DAY_MS) {
    spend(ms, 'Freshmart Grocery', 40 + Math.round(rand() * 9000) / 100, { account: 'acct-checking' });
  }
  for (let ms = start; ms < end; ms += (1 + Math.floor(rand() * 20)) * DAY_MS) {
    const store = 100 + Math.floor(rand() * 900);              // the bank adds a store number
    spend(ms, null, 3 + Math.round(rand() * 500) / 100, { bank: `BEAN THERE COFFEE #0${store}` });
  }
  for (let ms = start; ms < end; ms += (2 + Math.floor(rand() * 29)) * DAY_MS) {
    spend(ms, 'ZoomRide', 9 + Math.round(rand() * 2500) / 100);
  }

  // ---- a split purchase at the grocery store: must count ONCE ($70 total) ----
  transactions.push({
    id: 'tx-split', account: 'acct-checking', date: ymd(end - 40 * DAY_MS), amount: -7000,
    payee: payee('Freshmart Grocery'), is_parent: true,
    subtransactions: [
      { id: 'tx-split-a', parent_id: 'tx-split', is_child: true, amount: -4500, date: ymd(end - 40 * DAY_MS), account: 'acct-checking' },
      { id: 'tx-split-b', parent_id: 'tx-split', is_child: true, amount: -2500, date: ymd(end - 40 * DAY_MS), account: 'acct-checking' },
    ],
  });

  // ---- refunds (money coming back): must be ignored ----
  spend(end - 70 * DAY_MS, null, -15.49, { bank: 'STREAMFLIX.COM*AB12CD' }); // negative spend = refund
  spend(end - 20 * DAY_MS, 'ZoomRide', -12.5);

  // ---- paychecks (income): must be ignored ----
  everyDays(end - 6 * DAY_MS, 14, (ms) => transactions.push({
    id: 'tx-' + n++, account: 'acct-checking', date: ymd(ms), amount: 180000, payee: payee('Payroll'),
  }));

  // ---- monthly transfer to savings: must be ignored (both sides) ----
  const transferPayee = payee('Transfer: Savings', { transfer_acct: 'acct-savings' });
  everyMonths(1, 1, 0, (ms) => {
    const a = 'tx-' + n++, b = 'tx-' + n++;
    transactions.push({ id: a, account: 'acct-checking', date: ymd(ms), amount: -50000, payee: transferPayee, transfer_id: b });
    transactions.push({ id: b, account: 'acct-savings', date: ymd(ms), amount: 50000, payee: payee('Transfer: Checking', { transfer_acct: 'acct-checking' }), transfer_id: a });
  });

  return { accounts, payees, transactions, firstDate: ymd(start) };
}

module.exports = { makeDemoBudget, EXPECTED, MUST_NOT_APPEAR };
