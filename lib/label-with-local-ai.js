// =====================================================================
// label-with-local-ai.js — ask the AI on THIS laptop what each shop is
// ---------------------------------------------------------------------
// Ollama is a program on the laptop that runs AI models on the graphics
// card. We send it ONLY shop names (no amounts, no dates), about 25 at a
// time, and ask for a short label like "video streaming".
//
// Safety rules enforced here:
//   * the Ollama address must be 127.0.0.1 or localhost (this laptop),
//   * if anything goes wrong, labels become "unknown" and the scan goes on.
// =====================================================================

const ALLOWED_KINDS = ['subscription', 'bill_or_utility', 'store_or_restaurant', 'person_or_transfer', 'other'];
const BATCH_SIZE = 25;                     // names per question
const TIMEOUT_MS = 120000;                 // give up on one batch after 2 minutes

// Refuse any Ollama address that isn't this very laptop.
function checkLocalOllamaUrl(url) {
  let u;
  try { u = new URL(url); } catch { throw codedError('ollama-url-invalid'); }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== 'http:' || !(host === '127.0.0.1' || host === 'localhost')) {
    throw codedError('ollama-must-be-local');
  }
  return u.origin;                          // e.g. "http://127.0.0.1:11434"
}

// A small error with a safe, fixed code (never contains data).
function codedError(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

// Ask Ollama which models are downloaded, and whether it's running.
// Returns { state: 'running' | 'not-running' | 'model-missing', models: [...] }
async function ollamaStatus(ollamaUrl, wantedModel) {
  const origin = checkLocalOllamaUrl(ollamaUrl);
  try {
    const res = await fetch(origin + '/api/tags', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { state: 'not-running', models: [] };
    const body = await res.json();
    const models = (body.models || []).map((m) => m.name).sort();
    const hasModel = models.some((m) => m === wantedModel || m === wantedModel + ':latest');
    return { state: hasModel ? 'running' : 'model-missing', models };
  } catch {
    return { state: 'not-running', models: [] };
  }
}

// Remove a "thinking" section if a model includes one, then read the JSON.
function parseModelJson(text) {
  const cleaned = String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')  // strip <think>...</think>
    .trim();
  const start = cleaned.indexOf('{');           // find the JSON object
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw codedError('ai-bad-json');
  return JSON.parse(cleaned.slice(start, end + 1));
}

// Ask about one batch of names. Returns an array of {kind, whatItIs} in the same order.
async function labelBatch(origin, model, names) {
  const prompt =
    'You label bank-statement merchant names. For EACH name in the list, reply with ' +
    'its kind (one of: ' + ALLOWED_KINDS.join(', ') + ') and a 2-4 word plain-English ' +
    'label of what it is (for example "video streaming", "grocery store", "water bill"). ' +
    'If unsure, use kind "other" and label "unknown". Reply ONLY with JSON shaped like ' +
    '{"items":[{"i":0,"kind":"...","what_it_is":"..."}]} with one entry per name, using the same i numbers.\n\n' +
    'Names:\n' + names.map((n, i) => `${i}: ${n}`).join('\n');

  // The shape we want back, so Ollama can force valid JSON.
  const schema = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: { i: { type: 'integer' }, kind: { type: 'string', enum: ALLOWED_KINDS }, what_it_is: { type: 'string' } },
          required: ['i', 'kind', 'what_it_is'],
        },
      },
    },
    required: ['items'],
  };

  const ask = async (withThinkFlag) => {
    const body = {
      model,
      stream: false,
      format: schema,                       // JSON output mode
      options: { temperature: 0 },          // same answer every time
      messages: [{ role: 'user', content: prompt }],
    };
    if (withThinkFlag) body.think = false;  // turn "thinking" off for thinking models
    const res = await fetch(origin + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw codedError('ai-http-' + res.status);
    return res.json();
  };

  let reply;
  try { reply = await ask(true); }
  catch { reply = await ask(false); }       // older Ollama may not know "think"

  const parsed = parseModelJson(reply?.message?.content);
  const out = names.map(() => ({ kind: null, whatItIs: null }));
  for (const item of parsed.items || []) {
    const i = Number(item.i);
    if (!Number.isInteger(i) || i < 0 || i >= names.length) continue;
    const kind = ALLOWED_KINDS.includes(item.kind) ? item.kind : 'other';
    const label = String(item.what_it_is || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    out[i] = { kind, whatItIs: label && label.toLowerCase() !== 'unknown' ? label : null };
  }
  return out;
}

// Label every item in a results object (changes it in place).
// Never throws: on any problem, labels stay empty ("unknown").
//   onProgress(done, total) is called after each batch.
async function labelResults(results, { ollamaURL, model, onProgress = () => {} }) {
  let origin;
  try { origin = checkLocalOllamaUrl(ollamaURL); }
  catch (e) { return { ok: false, code: e.code }; }   // refuse non-local addresses

  // Collect each distinct name once.
  const items = results.buckets.flatMap((b) => b.items);
  const names = [...new Set(items.map((i) => i.name))];
  const labels = new Map();
  let failures = 0;

  for (let start = 0; start < names.length; start += BATCH_SIZE) {
    const batch = names.slice(start, start + BATCH_SIZE);
    try {
      const got = await labelBatch(origin, model, batch);
      batch.forEach((n, i) => labels.set(n, got[i]));
    } catch {
      failures++;                                       // skip this batch, keep going
    }
    onProgress(Math.min(start + BATCH_SIZE, names.length), names.length);
  }

  for (const item of items) {
    const l = labels.get(item.name);
    if (l) { item.kind = l.kind; item.whatItIs = l.whatItIs; }
  }
  results.aiLabeled = labels.size > 0;
  return { ok: failures === 0, labeled: labels.size, total: names.length, failedBatches: failures };
}

module.exports = { labelResults, ollamaStatus, checkLocalOllamaUrl, parseModelJson, ALLOWED_KINDS };
