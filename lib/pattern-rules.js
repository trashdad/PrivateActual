// =====================================================================
// pattern-rules.js — THE KNOBS YOU CAN TURN
// ---------------------------------------------------------------------
// Think of this file as the settings dial on a coin-sorting machine.
// Each "bucket" below says: "if the days between charges are usually
// between MIN and MAX, drop it in this bucket."
// You can change any number here, then restart the app.
// =====================================================================

// One entry per bucket, in order from most frequent to least frequent.
const BUCKETS = [
  {
    id: 'weekly',            // short internal name (don't change these ids)
    label: 'Weekly',         // the name you see on screen
    minGap: 6,               // shortest normal gap between charges, in days
    maxGap: 8,               // longest normal gap between charges, in days
    minCharges: 4,           // need at least this many charges to be sure
    perYear: 52,             // how many charges that makes in one year
  },
  { id: 'biweekly',   label: 'Every 2 weeks',  minGap: 12,  maxGap: 16,  minCharges: 3, perYear: 26 },
  { id: 'monthly',    label: 'Monthly',        minGap: 26,  maxGap: 35,  minCharges: 3, perYear: 12 },
  { id: 'bimonthly',  label: 'Every 2 months', minGap: 55,  maxGap: 66,  minCharges: 3, perYear: 6 },
  { id: 'quarterly',  label: 'Quarterly',      minGap: 84,  maxGap: 98,  minCharges: 3, perYear: 4 },
  { id: 'semiannual', label: 'Twice a year',   minGap: 170, maxGap: 195, minCharges: 2, perYear: 2 },
  {
    id: 'yearly', label: 'Yearly', minGap: 350, maxGap: 380, minCharges: 2, perYear: 1,
    maxAmountChange: 0.10,   // yearly charges must be within 10% of each other
  },
];

// The catch-all bucket for "you keep paying them, but not on a schedule".
const PAY_AS_YOU_GO = {
  id: 'payg',
  label: 'Pay-as-you-go',
  minChargesLast12Months: 3, // at least this many charges in the last year
};

const RULES = {
  // What share of the gaps must fit the bucket's range (0.75 = 75%).
  matchShare: 0.75,

  // Two charges from the same shop count as "the same subscription" if their
  // amounts are within 15% of each other OR within $1.50 (150 cents).
  sameAmountPercent: 0.15,
  sameAmountCents: 150,

  // A gap that is roughly 2x or 3x the normal gap is treated as a
  // "skipped charge" instead of a mismatch (for example, one month you
  // weren't billed). This is how much wiggle room that check allows.
  skippedChargeSlack: 0.12,

  // A gap shorter than this share of the bucket's minimum is "suspiciously
  // short". When a whole shop's charges have one, they are probably two
  // different subscriptions mixed together, so we split them by amount.
  shortGapShare: 0.6,

  // An item is "maybe already cancelled" if the last charge was more than
  // this many normal gaps ago (1.5 gaps = a month and a half for monthly).
  cancelledAfterGaps: 1.5,

  // Show a warning if we have less than this many months of history,
  // because a yearly charge only shows up twice in a bit more than 12 months.
  monthsNeededForYearly: 13,
};

// Make the lists available to the other files.
module.exports = { BUCKETS, PAY_AS_YOU_GO, RULES };
