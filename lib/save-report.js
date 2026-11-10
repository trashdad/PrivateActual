// =====================================================================
// save-report.js — "Save a copy" as one self-contained HTML file
// ---------------------------------------------------------------------
// The saved file is like a printed photo of your results: it can't
// phone home. Its Content-Security-Policy ("default-src 'none'") tells
// the browser to block ALL network requests from it. Only the styles
// and the small "Cancel?" calculator inside the file itself are allowed.
//
// Files are saved OUTSIDE the project folder, in
//     Documents\subscription-reports\
// so a future Claude Code session in the project folder never sees them.
// =====================================================================

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Where saved copies go (SF_REPORTS_DIR can point somewhere else).
function reportsDir() {
  return process.env.SF_REPORTS_DIR || path.join(os.homedir(), 'Documents', 'subscription-reports');
}

// Make text safe to put inside HTML (so "<" in a name can't break the page).
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 1549 -> "$15.49"
const money = (cents) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Build the HTML text for the report.
function buildReportHtml(results, cancelIds = []) {
  const ticked = new Set(cancelIds);
  const sections = results.buckets.filter((b) => b.items.length).map((b) => `
    <h2>${esc(b.label)} <small>(${b.items.length})</small></h2>
    <table>
      <thead><tr><th>Name</th><th>What it is</th><th>Typical charge</th><th>How often</th><th>Last charged</th><th>Next expected</th><th>Cost per year</th><th>Status</th><th>Cancel?</th></tr></thead>
      <tbody>${b.items.map((i) => `
        <tr>
          <td>${esc(i.name)}</td>
          <td>${esc(i.whatItIs || 'unknown')}</td>
          <td>${money(i.typicalCents)}</td>
          <td>${i.bucket === 'payg' ? 'no schedule' : 'every ~' + i.gapDays + ' days'}</td>
          <td>${esc(i.lastDate)}</td>
          <td>${esc(i.nextDate || '—')}</td>
          <td>${money(i.yearlyCents)}</td>
          <td>${i.status === 'active' ? 'Active' : 'Maybe already cancelled'}</td>
          <td><input type="checkbox" data-cents="${i.yearlyCents}" ${ticked.has(i.id) ? 'checked' : ''}></td>
        </tr>`).join('')}
      </tbody>
    </table>`).join('');

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>Subscription report ${esc(results.today)}</title>
<style>
  :root { color-scheme: light dark; --bg:#fbfaf7; --fg:#222; --muted:#666; --line:#ddd; }
  @media (prefers-color-scheme: dark) { :root { --bg:#17181a; --fg:#eee; --muted:#aaa; --line:#333; } }
  body { background:var(--bg); color:var(--fg); font:16px/1.5 system-ui, sans-serif; margin:0 auto; padding:16px; max-width:1100px; }
  table { width:100%; border-collapse:collapse; margin-bottom:24px; font-size:14px; }
  th, td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--line); }
  th { color:var(--muted); font-weight:600; }
  .save { font-size:20px; font-weight:700; }
  .wrap { overflow-x:auto; }
</style></head>
<body>
  <h1>Subscription report</h1>
  <p>Made ${esc(results.today)} from ${results.historyMonths} months of history.
     Estimated yearly cost of active recurring charges: <b>${money(results.totals.activeYearlyCents)}</b>.</p>
  ${results.shortHistory ? '<p><b>Note:</b> less than 13 months of history, so yearly charges may be missing.</p>' : ''}
  <p class="save">You'd save <span id="save">$0.00</span> per year</p>
  <div class="wrap">${sections}</div>
  <script>
    // Add up the yearly cost of every ticked "Cancel?" box.
    function total() {
      let cents = 0;
      document.querySelectorAll('input[type=checkbox]:checked').forEach(function (b) { cents += Number(b.dataset.cents); });
      document.getElementById('save').textContent = '$' + (cents / 100).toFixed(2);
    }
    document.addEventListener('change', total);
    total();
  </script>
</body></html>`;
}

// Write the report file. Returns just the file name (no folder path).
function saveReport(results, cancelIds) {
  const dir = reportsDir();
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');  // 2026-11-10-14-03
  const fileName = `subscriptions-${stamp}.html`;
  fs.writeFileSync(path.join(dir, fileName), buildReportHtml(results, cancelIds), { mode: 0o600 });
  return fileName;
}

module.exports = { saveReport, buildReportHtml, reportsDir, esc };
