// Nickname rules shared by the owner's admin scripts. Mirrors the client helpers in
// index.html (spNicknameProblem / spDefaultNickname) and validNickname in firestore.rules.
// Keep the three in sync; tests/helpers.test.js checks client == scripts.
'use strict';

const RESERVED_PART  = /(strangepin|admin|moderator|official|support|staff|firebase)/;
const RESERVED_EXACT = /^(mod|mods|team|system|root|owner|help|security|google|anonymous|null|undefined)$/;

function nicknameKey(nick, one) {
  return String(nick || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    .replace(/0/g, 'o').replace(/3/g, 'e').replace(/4/g, 'a')
    .replace(/5/g, 's').replace(/7/g, 't').replace(/1/g, one || 'i');
}

function nicknameProblem(nick) {
  if (typeof nick !== 'string') return 'not a string';
  if (nick.length < 3 || nick.length > 24) return 'length';
  if (!/^[A-Za-z0-9]([A-Za-z0-9]|[ ._-][A-Za-z0-9])*$/.test(nick)) return 'characters';
  for (const one of ['i', 'l']) {
    const k = nicknameKey(nick, one);
    if (RESERVED_PART.test(k) || RESERVED_EXACT.test(k)) return 'reserved';
  }
  return '';
}

/** Deterministic default nickname from the uid (FNV-1a 32-bit), e.g. "Explorer-K3F9". */
function defaultNickname(uid) {
  let h = 0x811c9dc5;
  for (const ch of String(uid || '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'Explorer-' + h.toString(36).toUpperCase().padStart(4, '0').slice(-4);
}

module.exports = { nicknameKey, nicknameProblem, defaultNickname };
