// =====================================================================
// saved-keys.js — optionally remember your Actual login ON THE LAPTOP
// ---------------------------------------------------------------------
// If you tick "Remember on this laptop", your API key (or password) and
// encryption password are saved in your personal drawer folder
// (see settings.js), so you can scan from your Mac or anywhere without
// typing them each time.
//
// On Windows they are locked with Windows' built-in safe ("DPAPI",
// machine scope). Analogy: the key goes in a lockbox bolted to THIS
// laptop. If someone copies the file to another computer, it's just
// scrambled bytes. Programs running on this laptop can still open the
// box, so this protects against stolen backups and copied files, not
// against someone already using your laptop.
// (Machine scope is used because Windows' per-user lock doesn't work in
// SSH sessions, which is how the Mac launcher starts the app.)
//
// On Mac/Linux (used only for development) the file is saved readable
// by your user account only, and the app labels it "not encrypted".
// =====================================================================

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { ensureHome, homeDir } = require('./settings');

const FILE = () => path.join(homeDir(), 'saved-keys.dat');
const IS_WINDOWS = process.platform === 'win32';

// Run a short PowerShell script, feeding `input` through its standard
// input (NOT the command line, where other programs could see it).
function powershell(script, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout) => (err ? reject(Object.assign(new Error('x'), { code: 'keys-unavailable' })) : resolve(stdout.trim())),
    );
    child.stdin.end(input);
  });
}

// PowerShell: read text from stdin, lock it with DPAPI, print as base64.
const PROTECT = "Add-Type -AssemblyName System.Security; $t=[Console]::In.ReadToEnd(); " +
  "$b=[Text.Encoding]::UTF8.GetBytes($t); " +
  "$e=[Security.Cryptography.ProtectedData]::Protect($b,$null,'LocalMachine'); [Convert]::ToBase64String($e)";
// PowerShell: read base64 from stdin, unlock with DPAPI, print the text.
const UNPROTECT = "Add-Type -AssemblyName System.Security; $t=[Console]::In.ReadToEnd().Trim(); " +
  "$b=[Convert]::FromBase64String($t); " +
  "$d=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,'LocalMachine'); [Text.Encoding]::UTF8.GetString($d)";

// Save { apiKey?, password?, encryptionPassword? }.
async function saveKeys(keys) {
  const clean = {};
  for (const k of ['apiKey', 'password', 'encryptionPassword']) {
    if (typeof keys[k] === 'string' && keys[k]) clean[k] = keys[k];
  }
  const json = JSON.stringify(clean);
  ensureHome();
  const body = IS_WINDOWS ? 'dpapi:' + (await powershell(PROTECT, json)) : 'plain:' + Buffer.from(json).toString('base64');
  fs.writeFileSync(FILE(), body, { mode: 0o600 });
}

// Load saved keys, or null if none are saved.
async function loadKeys() {
  let body;
  try { body = fs.readFileSync(FILE(), 'utf8').trim(); } catch { return null; }
  if (body.startsWith('dpapi:')) return JSON.parse(await powershell(UNPROTECT, body.slice(6)));
  if (body.startsWith('plain:')) return JSON.parse(Buffer.from(body.slice(6), 'base64').toString('utf8'));
  return null;
}

// What's saved? (Answers yes/no only; never reveals the keys.)
function keysInfo() {
  let body = '';
  try { body = fs.readFileSync(FILE(), 'utf8'); } catch { return { saved: false }; }
  return { saved: true, encrypted: body.startsWith('dpapi:') };
}

// Delete the saved keys file.
function forgetKeys() {
  try { fs.rmSync(FILE(), { force: true }); } catch { /* already gone */ }
}

module.exports = { saveKeys, loadKeys, keysInfo, forgetKeys };
