// =====================================================================
// find-patterns.js — spot the repeating charges (plain math, no AI)
// ---------------------------------------------------------------------
// Analogy: imagine laying every receipt from one shop on the floor in
// date order and measuring the space between them with a ruler. If the
// spaces are mostly about a month, it's a monthly subscription. If
// they're all over the place, it's "pay-as-you-go".
//
// The ruler sizes live in pattern-rules.js so you can adjust them.
// =====================================================================

const crypto = require('node:crypto');              // used to make scrambled IDs
const { BUCKETS, PAY_AS_YOU_GO, RULES } = require('./pattern-rules');

const DAY_MS = 24 * 60 * 60 * 1000;                 // milliseconds in one day

// ---------- small helpers ----------

// 'YYYY-MM-DD' -> a day number we can subtract (days since 1970).
function dayNum(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

// day number -> 'YYYY-MM-DD'
function dayStr(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

// The middle value of a list (half are bigger, half are smaller).
function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Days between each charge and the one before it.
function gapsOf(charges) {
  const g = [];
  for (let i = 1; i < charges.length; i++) g.push(dayNum(charges[i].date) - dayNum(charges[i - 1].date));
  return g;
}

const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

// ---------- does a list of charges fit one bucket? ----------

// Checks one bucket. Returns a score object, or null if it doesn't fit.
//   strict = true means "no suspiciously short gaps allowed"
function fitBucket(charges, rule, strict) {
  if (charges.length < rule.minCharges) return null;          // not enough charges yet
  const gaps = gapsOf(charges);
  if (!gaps.length) return null;

  const inRange = (g, k = 1) =>                                // does gap g fit k times the range?
    g >= k * rule.minGap * (k > 1 ? 1 - RULES.skippedChargeSlack : 1) &&
    g <= k * rule.maxGap * (k > 1 ? 1 + RULES.skippedChargeSlack : 1);

  const ok = new Array(gaps.length).fill(false);               // which gaps are "fine"
  let exact = 0;                                               // gaps squarely in range
  for (let i = 0; i < gaps.length; i++) {
    if (inRange(gaps[i])) { ok[i] = true; exact++; }
    else if (inRange(gaps[i], 2) || inRange(gaps[i], 3)) ok[i] = true; // a skipped charge
  }
  // A late charge makes one long gap followed by one short gap that add up
  // to two normal gaps. Count both as fine.
  for (let i = 0; i + 1 < gaps.length; i++) {
    if (!ok[i] && !ok[i + 1] && inRange(gaps[i] + gaps[i + 1], 2)) { ok[i] = true; ok[i + 1] = true; }
  }

  const fine = ok.filter(Boolean).length;
  if (fine / gaps.length < RULES.matchShare) return null;     // too many odd gaps
  if (exact / gaps.length < 0.5) return null;                  // mostly "skips": wrong bucket

  if (strict && gaps.some((g) => g < rule.minGap * RULES.shortGapShare)) return null; // mixed-up series

  if (rule.maxAmountChange != null) {                          // yearly: amounts must be close
    const cents = charges.map((c) => c.cents);
    if (Math.max(...cents) / Math.min(...cents) - 1 > rule.maxAmountChange) return null;
  }

  const typicalGap = median(gaps.filter((g) => inRange(g))) || (rule.minGap + rule.maxGap) / 2;
  return { rule, score: exact / gaps.length, typicalGap };
}

// Try every bucket and keep the best fit (or null if none fit).
function classify(charges, strict) {
  let best = null;
  for (const rule of BUCKETS) {
    const fit = fitBucket(charges, rule, strict);
    if (fit && (!best || fit.score > best.score)) best = fit;
  }
  return best;
}

// ---------- splitting one shop's charges by amount ----------

// Groups charges with similar amounts (within 15% or $1.50).
// Example: Apple $2.99 charges in one pile, Apple $29.99 in another.
function clusterByAmount(charges) {
  const sorted = [...charges].sort((a, b) => a.cents - b.cents);
  const clusters = [];
  for (const c of sorted) {
    const last = clusters[clusters.length - 1];
    if (last) {
      const mid = median(last.map((x) => x.cents));
      const allowed = Math.max(mid * RULES.sameAmountPercent, RULES.sameAmountCents);
      if (Math.abs(c.cents - mid) <= allowed) { last.push(c); continue; }
    }
    clusters.push([c]);                                         // start a new pile
  }
  return clusters.map((cl) => cl.sort(byDate));                 // each pile in date order
}

// ---------- the main job ----------

// charges: [{ date, cents, name, key }]  (money going out only)
// options: { today: 'YYYY-MM-DD', firstDate: 'YYYY-MM-DD', salt: 'random text' }
function findPatterns(charges, options = {}) {
  const today = dayNum(options.today || new Date().toISOString().slice(0, 10));
  const salt = options.salt || '';

  // 1) Group charges by shop.
  const byShop = new Map();
  for (const c of charges) {
    if (!byShop.has(c.key)) byShop.set(c.key, []);
    byShop.get(c.key).push(c);
  }

  const found = [];                                             // every item we detect
  for (const [key, list] of byShop) {
    list.sort(byDate);
    const name = list[list.length - 1].name;                    // most recent spelling

    // 2a) First try the whole shop as ONE schedule (handles bills whose
    //     amount changes, like water). Must have no suspiciously short gaps.
    const whole = classify(list, true);
    if (whole) { found.push(makeItem(name, key, list, whole, today, salt)); continue; }

    // 2b) Otherwise split by amount and test each pile.
    const piles = clusterByAmount(list).map((p) => ({ charges: p, fit: classify(p, false) }));

    // 2c) A price increase splits one subscription into two piles that
    //     follow each other in time. Glue those back together.
    for (let i = 0; i < piles.length; i++) {
      for (let j = i + 1; j < piles.length; j++) {
        const a = piles[i], b = piles[j];
        if (!a.fit || !b.fit || a.fit.rule.id !== b.fit.rule.id) continue;
        const aEnd = a.charges[a.charges.length - 1].date, bEnd = b.charges[b.charges.length - 1].date;
        const separate = aEnd < b.charges[0].date || bEnd < a.charges[0].date; // no overlap in time
        if (!separate) continue;
        const merged = [...a.charges, ...b.charges].sort(byDate);
        const fit = classify(merged, false);
        if (fit && fit.rule.id === a.fit.rule.id) {
          a.charges = merged; a.fit = fit;                       // keep the glued pile
          piles.splice(j, 1); j = i;                             // remove b and re-check
        }
      }
    }

    // 2d) Piles that fit a schedule become items.
    const leftovers = [];
    for (const p of piles) {
      if (p.fit) found.push(makeItem(name, key, p.charges, p.fit, today, salt));
      else leftovers.push(...p.charges);
    }

    // 2e) Leftovers together might still be one schedule with a varying amount.
    leftovers.sort(byDate);
    const pooled = leftovers.length >= 2 ? classify(leftovers, true) : null;
    if (pooled) { found.push(makeItem(name, key, leftovers, pooled, today, salt)); continue; }

    // 3) Pay-as-you-go: 3+ charges in the last 12 months, no schedule.
    const recent = leftovers.filter((c) => today - dayNum(c.date) <= 365);
    if (recent.length >= PAY_AS_YOU_GO.minChargesLast12Months) {
      found.push(makePaygItem(name, key, recent, today, salt));
    }
  }

  return summarize(found, options, today);
}

// ---------- building the rows you see on screen ----------

// A scrambled ID for an item, so the page can remember your "Cancel?"
// ticks without storing any shop names. The "salt" is a random secret
// kept on the laptop, so nobody can guess names from the scrambles.
function makeId(salt, key, bucketId, cents) {
  const band = Math.round(Math.log(Math.max(cents, 1)) * 4);   // rough price band
  return crypto.createHash('sha256').update(`${salt}|${key}|${bucketId}|${band}`).digest('hex').slice(0, 20);
}

// A scheduled item (weekly, monthly, ...).
function makeItem(name, key, charges, fit, today, salt) {
  const last3 = charges.slice(-3).map((c) => c.cents);
  const typicalCents = Math.round(median(last3));               // typical charge = median of last 3
  const lastDay = dayNum(charges[charges.length - 1].date);
  const gap = Math.round(fit.typicalGap);
  const status = today - lastDay > RULES.cancelledAfterGaps * gap ? 'maybe-cancelled' : 'active';
  return {
    id: makeId(salt, key, fit.rule.id, typicalCents),
    name,
    bucket: fit.rule.id,
    typicalCents,
    gapDays: gap,                                               // "how often", in days
    chargeCount: charges.length,
    lastDate: dayStr(lastDay),
    nextDate: dayStr(lastDay + gap),
    yearlyCents: typicalCents * fit.rule.perYear,               // typical x charges per year
    status,
    kind: null,                                                 // filled in by the AI (optional)
    whatItIs: null,
  };
}

// A pay-as-you-go item: yearly cost = what you really spent in 12 months.
function makePaygItem(name, key, recent, today, salt) {
  const gaps = gapsOf(recent);
  const gap = Math.round(median(gaps)) || 0;
  const lastDay = dayNum(recent[recent.length - 1].date);
  const quietLimit = Math.max(RULES.cancelledAfterGaps * gap, 60); // at least 2 months quiet
  const total = recent.reduce((s, c) => s + c.cents, 0);
  return {
    id: makeId(salt, key, PAY_AS_YOU_GO.id, 1),
    name,
    bucket: PAY_AS_YOU_GO.id,
    typicalCents: Math.round(median(recent.map((c) => c.cents))),
    gapDays: gap,
    chargeCount: recent.length,
    lastDate: dayStr(lastDay),
    nextDate: null,                                             // no schedule, so no guess
    yearlyCents: total,
    status: today - lastDay > quietLimit ? 'maybe-cancelled' : 'active',
    kind: null,
    whatItIs: null,
  };
}

// Sort items into buckets and add up the totals.
function summarize(items, options, today) {
  const all = [...BUCKETS, PAY_AS_YOU_GO];
  const buckets = all.map((b) => ({
    id: b.id,
    label: b.label,
    items: items.filter((i) => i.bucket === b.id).sort((x, y) => y.yearlyCents - x.yearlyCents),
  }));
  const firstDay = options.firstDate ? dayNum(options.firstDate) : today;
  const historyMonths = Math.round(((today - firstDay) / 30.44) * 10) / 10;
  const active = items.filter((i) => i.status === 'active');
  return {
    today: dayStr(today),
    historyMonths,
    shortHistory: historyMonths < RULES.monthsNeededForYearly,
    buckets,
    totals: {
      activeYearlyCents: active.reduce((s, i) => s + i.yearlyCents, 0),
      scheduledYearlyCents: active.filter((i) => i.bucket !== 'payg').reduce((s, i) => s + i.yearlyCents, 0),
      itemCount: items.length,
    },
  };
}

module.exports = { findPatterns, classify, clusterByAmount, median, dayNum, dayStr };
