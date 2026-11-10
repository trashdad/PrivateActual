// =====================================================================
// safe-errors.js — friendly error messages that are safe to share
// ---------------------------------------------------------------------
// Error messages from other programs can contain addresses, names or
// numbers. So we NEVER show the original message. We show a friendly
// sentence chosen from this list, plus a short code like
// "invalid-password" that you can paste to anyone for help.
// =====================================================================

const FRIENDLY = {
  // Codes from the Actual package (see Actual's "Handling Errors" docs)
  'network-failure': "Couldn't reach your Actual server. Check the server address on the Setup screen, and that the server is on.",
  network: "Couldn't reach your Actual server. Check the server address on the Setup screen, and that the server is on.",
  'invalid-password': 'The Actual server password was not accepted.',
  'token-expired': 'The Actual API key was not accepted (it may have been deleted or expired). Make a new one in Actual.',
  unauthorized: 'Actual says this app is not logged in. Check your password or API key.',
  'budget-not-found': 'No budget matches that Sync ID. Check the Sync ID on the Setup screen.',
  'missing-key': 'This budget is encrypted. Type your encryption password and try again.',
  'decrypt-failure': 'The encryption password was not accepted.',
  'old-key-style': 'This budget uses an old encryption style the app cannot open. Re-encrypt it in Actual.',
  'out-of-sync-migrations': 'The budget file could not be opened by this version of the app. The Actual package may need to match your server version (see README, "Version mismatch").',
  // Codes from this app
  'self-signed-cert': "Your Actual server's security certificate isn't trusted yet. See README, \"HTTPS certificate\".",
  'missing-settings': 'Fill in the server address and Sync ID on the Setup screen first.',
  'missing-login': 'Type your Actual password or API key (or save one on this laptop) first.',
  busy: 'A scan is already running. Wait for it to finish.',
  'demo-only': 'This copy of the app was started in fake-data-only mode, so real scans are switched off.',
  'ollama-must-be-local': 'For privacy, the AI address must be on this laptop (127.0.0.1 or localhost).',
  'ollama-url-invalid': "The AI address doesn't look like a web address.",
  'bad-request': 'The app got a request it did not understand.',
  'bad-server-url': 'The server address should start with http:// or https://',
  'keys-unavailable': 'Saved keys could not be read on this laptop. Type your password or API key instead, then tick "Remember" to save it again.',
};

// Turn any error into { message, code } that is safe to show and paste.
function safeError(err) {
  // Only trust codes made of plain letters, numbers and dashes.
  let code = typeof err?.code === 'string' && /^[a-z0-9_-]{1,40}$/i.test(err.code) ? err.code : null;

  // Certificate problems come with long Node codes; group them under one.
  if (code && /CERT|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(code)) code = 'self-signed-cert';

  if (code && FRIENDLY[code]) return { message: FRIENDLY[code], code };
  const type = typeof err?.name === 'string' && /^[A-Za-z]{1,40}$/.test(err.name) ? err.name : 'Error';
  return {
    message: 'Something went wrong. You can paste the code below to Claude for help. It contains no personal data.',
    code: code || type,
  };
}

module.exports = { safeError, FRIENDLY };
