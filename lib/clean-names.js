// =====================================================================
// clean-names.js — tidy up messy bank descriptions
// ---------------------------------------------------------------------
// Banks write shop names like "STREAMFLIX.COM*AB12CD 866-555" or
// "BEAN THERE COFFEE #0423". This file turns them into "Streamflix.com"
// and "Bean There Coffee" so charges from the same shop line up together.
// =====================================================================

// Payment-processor prefixes that come BEFORE the real shop name.
// Example: "SQ *BEAN THERE" means "paid through Square at Bean There".
const PREFIXES = [/^sq\s*\*\s*/i, /^tst\s*\*\s*/i, /^pp\s*\*\s*/i, /^paypal\s*\*\s*/i, /^sp\s*\*?\s+/i];

// Turn a messy name into a clean, readable one.
function cleanName(raw) {
  let name = String(raw || '').trim();                 // make sure it's text, remove edge spaces
  if (!name) return 'Unknown';                         // nothing to work with

  for (const p of PREFIXES) name = name.replace(p, ''); // drop "SQ *", "PAYPAL *", etc.

  name = name.replace(/\*\s*[a-z0-9]{3,}\s*$/i, '');   // drop a trailing "*AB12CD" reference code
  name = name.replace(/\*.*$/, '');                    // drop anything else after a "*"
  name = name.replace(/\s+\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\s*$/, ''); // drop a trailing phone number
  name = name.replace(/\s+#\s*\d+\s*$/, '');           // drop a trailing store number like "#0423"
  name = name.replace(/\s+(store\s*)?\d{3,}\s*$/i, ''); // drop a trailing store number like "0423"
  name = name.replace(/\s{2,}/g, ' ').trim();          // squash double spaces

  // If the whole thing is SHOUTING IN CAPITALS, turn it into Title Case.
  if (name === name.toUpperCase()) {
    name = name.toLowerCase().replace(/(^|\s)([a-z])/g, (m) => m.toUpperCase()); // capitalise each word
  }
  return name || 'Unknown';                            // never return an empty name
}

// A simplified "matching key" so "Bean There Coffee" and
// "BEAN-THERE COFFEE" are treated as the same shop.
function nameKey(cleaned) {
  return String(cleaned).toLowerCase().replace(/[^a-z0-9]/g, '');
}

module.exports = { cleanName, nameKey };
