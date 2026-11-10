// =====================================================================
// find-patterns.test.js — does every FAKE item land in the right bucket?
// Run all tests with:  npm test
// =====================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDemoBudget, EXPECTED, MUST_NOT_APPEAR } = require('../lib/demo-data');
const { normalizeTransactions } = require('../lib/get-transactions');
const { findPatterns } = require('../lib/find-patterns');
const { cleanName } = require('../lib/clean-names');

// Run the whole pipeline on fake data for a given "today".
function run(today) {
  const budget = makeDemoBudget(today);
  const charges = normalizeTransactions(budget);
  const results = findPatterns(charges, { today, firstDate: budget.firstDate, salt: 'test' });
  const items = results.buckets.flatMap((b) => b.items);
  return { budget, charges, results, items };
}

// Try several different "todays" so we aren't lucky with one calendar.
for (const today of ['2026-11-10', '2026-03-01', '2027-07-31']) {
  test(`every fake item lands in its expected bucket (today = ${today})`, () => {
    const { items } = run(today);
    for (const exp of EXPECTED) {
      const match = items.find((i) => i.name === exp.name && i.bucket === exp.bucket);
      assert.ok(match, `${exp.name} should be ${exp.bucket}; got ${items.filter((i) => i.name === exp.name).map((i) => i.bucket).join(', ') || 'nothing'}`);
      assert.equal(match.status, exp.status, `${exp.name} status`);
    }
    // ...and nothing extra was found.
    assert.equal(items.length, EXPECTED.length, 'no unexpected items: ' + items.map((i) => `${i.name}/${i.bucket}`).join(', '));
  });
}

test('refunds, paychecks and transfers are ignored', () => {
  const { charges, items } = run('2026-11-10');
  for (const name of MUST_NOT_APPEAR) {
    assert.ok(!items.some((i) => i.name === name), `${name} must not be an item`);
    assert.ok(!charges.some((c) => c.name === name), `${name} must not be a charge`);
  }
  assert.ok(charges.every((c) => c.cents > 0), 'only money going out');
});

test('a split purchase is counted once, at its full amount', () => {
  const { budget, charges } = run('2026-11-10');
  const split = budget.transactions.find((t) => t.id === 'tx-split');
  const hits = charges.filter((c) => c.date === split.date && c.name === 'Freshmart Grocery' && c.cents === 7000);
  assert.equal(hits.length, 1);
  assert.ok(!charges.some((c) => c.cents === 4500 && c.date === split.date), 'split pieces not counted separately');
});

test('price increase keeps ONE monthly item, using the newest price', () => {
  const { items } = run('2026-11-10');
  const stream = items.filter((i) => i.name === 'Streamflix.com');
  assert.equal(stream.length, 1);
  assert.equal(stream[0].typicalCents, 1799);
  assert.equal(stream[0].yearlyCents, 1799 * 12);
});

test('yearly cost math', () => {
  const { items } = run('2026-11-10');
  const apple = items.find((i) => i.name === 'Apple' && i.bucket === 'monthly');
  assert.equal(apple.yearlyCents, 299 * 12);
  const kit = items.find((i) => i.name === 'Meal Kit Club');
  assert.equal(kit.yearlyCents, 5999 * 52);
  const payg = items.find((i) => i.bucket === 'payg');
  assert.equal(payg.nextDate, null, 'pay-as-you-go has no next date');
});

test('short history shows a warning', () => {
  const { budget } = run('2026-11-10');
  const charges = normalizeTransactions(budget);
  const r = findPatterns(charges, { today: '2026-11-10', firstDate: '2026-05-01' });
  assert.equal(r.shortHistory, true);
  const r2 = findPatterns(charges, { today: '2026-11-10', firstDate: budget.firstDate });
  assert.equal(r2.shortHistory, false);
});

test('messy bank names get cleaned up', () => {
  assert.equal(cleanName('STREAMFLIX.COM*AB12CD'), 'Streamflix.com');
  assert.equal(cleanName('BEAN THERE COFFEE #0423'), 'Bean There Coffee');
  assert.equal(cleanName('SQ *CORNER BAKERY'), 'Corner Bakery');
  assert.equal(cleanName('SHELL OIL 57444'), 'Shell Oil');
  assert.equal(cleanName(''), 'Unknown');
});

test('item IDs are scrambled (contain no names)', () => {
  const { items } = run('2026-11-10');
  for (const i of items) {
    assert.match(i.id, /^[0-9a-f]{20}$/);
    assert.ok(!i.id.includes(i.name.toLowerCase()));
  }
});
