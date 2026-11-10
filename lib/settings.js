// =====================================================================
// settings.js — where the app keeps its settings and saved keys
// ---------------------------------------------------------------------
// Everything personal lives OUTSIDE the project folder, in a hidden
// folder in your home folder:
//     C:\Users\<you>\.subscription-finder\
//         settings.json    server address, Sync ID, months, AI choices
//         saved-keys.dat   (only if you tick "Remember on this laptop")
//         id-salt.txt      random text used to scramble item IDs
// Analogy: the project folder is the recipe book; this hidden folder is
// your personal drawer. Claude (or anyone) reading the recipe book never
// opens your drawer.
//
// The SF_HOME environment variable can point somewhere else instead.
// =====================================================================

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

// Default values for a brand-new setup.
const DEFAULTS = {
  serverURL: '',                         // e.g. https://budget.example.com
  syncId: '',                            // Actual -> Settings -> Show advanced settings -> Sync ID
  months: 15,                            // months of history to scan
  aiEnabled: true,                       // use the local AI for labels
  model: 'qwen3:14b',                    // which Ollama model
  ollamaURL: 'http://127.0.0.1:11434',   // Ollama on this laptop
};

// Which folder holds the personal files?
function homeDir() {
  return process.env.SF_HOME || path.join(os.homedir(), '.subscription-finder');
}

// Make sure the folder exists (only you can read it on Mac/Linux).
function ensureHome() {
  fs.mkdirSync(homeDir(), { recursive: true, mode: 0o700 });
  return homeDir();
}

// Read settings, filling in defaults for anything missing.
function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(homeDir(), 'settings.json'), 'utf8'));
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };              // no file yet: use defaults
  }
}

// Check and save settings. Passwords are NOT accepted here.
function saveSettings(input) {
  const s = { ...loadSettings() };
  if (typeof input.serverURL === 'string') {
    const url = input.serverURL.trim().replace(/\/+$/, '');   // remove trailing slashes
    if (url && !/^https?:\/\/[^\s]+$/i.test(url)) throw Object.assign(new Error('x'), { code: 'bad-server-url' });
    s.serverURL = url;
  }
  if (typeof input.syncId === 'string') s.syncId = input.syncId.trim().slice(0, 100);
  if (input.months != null) s.months = Math.min(60, Math.max(3, Math.round(Number(input.months)) || DEFAULTS.months));
  if (typeof input.aiEnabled === 'boolean') s.aiEnabled = input.aiEnabled;
  if (typeof input.model === 'string') s.model = input.model.trim().slice(0, 100) || DEFAULTS.model;
  if (typeof input.ollamaURL === 'string') s.ollamaURL = input.ollamaURL.trim() || DEFAULTS.ollamaURL;
  ensureHome();
  fs.writeFileSync(path.join(homeDir(), 'settings.json'), JSON.stringify(s, null, 2), { mode: 0o600 });
  return s;
}

// A random secret used to scramble item IDs (made once, then reused).
function idSalt() {
  const file = path.join(ensureHome(), 'id-salt.txt');
  try { return fs.readFileSync(file, 'utf8').trim(); }
  catch {
    const salt = crypto.randomBytes(24).toString('hex');
    fs.writeFileSync(file, salt, { mode: 0o600 });
    return salt;
  }
}

module.exports = { DEFAULTS, homeDir, ensureHome, loadSettings, saveSettings, idSalt };
