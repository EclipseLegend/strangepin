// Unit tests for the security/text helpers in index.html.
// Run: node tests/helpers.test.js   (no dependencies)
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('// ── SECURITY HELPERS');
const end = html.indexOf('// ── DATA ──');
assert(start > 0 && end > start, 'helper block not found');
const helpers = new Function(html.slice(start, end) +
  '; return { escapeHtml, safeHttpsUrl, avatarInitial, safeDocId, avatarHtml, truncateAtWord, previewText,' +
  ' spNicknameProblem, spDefaultNickname, spImageProblem, spFriendlyError };')();
const { escapeHtml, safeHttpsUrl, avatarInitial, safeDocId, avatarHtml, truncateAtWord, previewText,
        spNicknameProblem, spDefaultNickname, spImageProblem, spFriendlyError } = helpers;
const serverNick = require('../scripts/lib/nickname.js');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok -', name); }

const XSS = '<img src=x onerror=alert(1)>';

test('escapeHtml neutralises markup', () => {
  assert.strictEqual(escapeHtml(XSS), '&lt;img src=x onerror=alert(1)&gt;');
  assert.strictEqual(escapeHtml(`"'\`&`), '&quot;&#39;&#96;&amp;');
  assert.strictEqual(escapeHtml(null), '');
  assert.strictEqual(escapeHtml(undefined), '');
  assert.strictEqual(escapeHtml(42), '42');
});

test('safeHttpsUrl accepts only https', () => {
  assert.strictEqual(safeHttpsUrl('https://lh3.googleusercontent.com/a/x.jpg'), 'https://lh3.googleusercontent.com/a/x.jpg');
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>',
                     'http://example.com/a.png', '//evil.example/x', 'x" onerror="alert(1)', '', null, 42]) {
    assert.strictEqual(safeHttpsUrl(bad), '', String(bad));
  }
  // Quotes and angle brackets cannot break out of a double-quoted attribute.
  const u = safeHttpsUrl('https://a.example/"><script>');
  assert(!/["<>]/.test(u), u);
});

test('avatarInitial escapes and handles empty names', () => {
  assert.strictEqual(avatarInitial('<b>'), '&lt;');
  assert.strictEqual(avatarInitial(''), '?');
  assert.strictEqual(avatarInitial(undefined), '?');
  assert.strictEqual(avatarInitial('élise'), 'É');
});

test('safeDocId only allows plain tokens', () => {
  assert.strictEqual(safeDocId('aB3_x-9'), 'aB3_x-9');
  assert.strictEqual(safeDocId("x');alert(1);//"), '');
  assert.strictEqual(safeDocId(''), '');
});

test('avatarHtml never puts user data in the onerror handler', () => {
  const out = avatarHtml('javascript:alert(1)', XSS, 'color:white;');
  assert(!out.includes('<img'), 'non-https URL must not produce <img>');
  assert(!out.includes('<img src=x'), out);
  const ok = avatarHtml('https://a.example/p.png', "'); alert(1); //", '');
  assert(ok.includes('onerror="spAvatarFallback(this)"'), ok);
  assert(!/alert\(1\)/.test(ok.split('onerror=')[1].split('"')[1]), ok);
});

test('truncateAtWord cuts on word boundaries', () => {
  assert.strictEqual(truncateAtWord('short text', 200), 'short text');
  const t = truncateAtWord('alpha beta gamma delta', 13);
  assert.strictEqual(t, 'alpha beta…');
});

test('previewText re-derives truncated previews from fullStory', () => {
  const loc = { shortPreview: 'Visitors consist', fullStory: 'Visitors consistently report an uncanny silence.' };
  assert.strictEqual(previewText(loc, 200), 'Visitors consistently report an uncanny silence.');
  assert.strictEqual(previewText({ shortPreview: 'Same.', fullStory: 'Same.' }), 'Same.');
});

const RESERVED = ['StrangePin', 'strangepin team', 'Strange-Pin', 'STRANGE.PIN', 'Str4ngeP1n', 'admin', 'Administrator',
  'Adm1n', 'moderator', 'M0derator', 'official', 'Support', 'Supp0rt', 'staff', 'Firebase', 'mod', 'Mods', 'team',
  'system', 'root', 'owner', 'help', 'security', 'Google', 'anonymous', 'null', 'undefined', 'The Admin 1',
  'strange pin official', 'adm.in', 'a_d_m_i_n', 'SUPPORT-desk'];
const VALID = ['Ghost Hunter', 'night_owl', 'Mira.K', 'Explorer-4F2A', 'abc', 'Lisboa-1987', 'x'.repeat(24), 'Modern Ghost'];
const BAD_SHAPE = ['ab', 'x'.repeat(25), ' lead', 'trail ', 'two  spaces', 'a..b', '-dash', 'émile', 'a<b>', 'tab\tname', '', null, 42];

test('spNicknameProblem: reserved names are refused (case, space, punctuation, look-alike insensitive)', () => {
  for (const n of RESERVED) assert.match(spNicknameProblem(n), /reserved/, n);
});
test('spNicknameProblem: shape rules', () => {
  for (const n of VALID) assert.strictEqual(spNicknameProblem(n), '', n);
  for (const n of BAD_SHAPE) assert.notStrictEqual(spNicknameProblem(n), '', String(n));
});
test('client and scripts/lib/nickname.js agree', () => {
  for (const n of [...RESERVED, ...VALID, ...BAD_SHAPE.filter(x => typeof x === 'string')]) {
    assert.strictEqual(serverNick.nicknameProblem(n) === '', spNicknameProblem(n) === '', n);
  }
  for (const uid of ['a', 'uid-legacy-owner', 'Zx9QpL0mN2', '']) assert.strictEqual(serverNick.defaultNickname(uid), spDefaultNickname(uid));
});
test('spDefaultNickname is stable, valid and contains no personal data', () => {
  const a = spDefaultNickname('uid-legacy-owner');
  assert.match(a, /^Explorer-[0-9A-Z]{4}$/);
  assert.strictEqual(a, spDefaultNickname('uid-legacy-owner'));
  assert.notStrictEqual(a, spDefaultNickname('uid-other'));
  for (let i = 0; i < 2000; i++) assert.strictEqual(spNicknameProblem(spDefaultNickname('u' + i)), '', 'u' + i);
});
test('spImageProblem: only JPG/PNG/WEBP up to 10 MB', () => {
  assert.strictEqual(spImageProblem(null), '');
  assert.strictEqual(spImageProblem({ type: 'image/jpeg', size: 1000 }), '');
  assert.strictEqual(spImageProblem({ type: 'image/webp', size: 10 * 1024 * 1024 }), '');
  assert.notStrictEqual(spImageProblem({ type: 'image/png', size: 10 * 1024 * 1024 + 1 }), '');
  assert.notStrictEqual(spImageProblem({ type: 'image/svg+xml', size: 100 }), '');
  assert.notStrictEqual(spImageProblem({ type: 'image/gif', size: 100 }), '');
  assert.notStrictEqual(spImageProblem({ type: 'image/png', size: 0 }), '');
});
test('spFriendlyError never leaks raw error text', () => {
  const m = spFriendlyError({ code: 'permission-denied', message: 'Missing or insufficient permissions. secret' }, 'post your comment');
  assert(!/secret|insufficient/.test(m), m);
  assert.match(spFriendlyError({ code: 'timeout' }, 'load the rankings'), /offline/);
});

// EmailJS recipient: a hard-coded constant; nothing from the page (form fields, URL params,
// storage, user input) can reach to_email. Static check of index.html; the behaviour is also
// tested in tests/e2e-emulator.js (hostile URL params / form field / storage are ignored).
test('EmailJS to_email is a hard-coded constant that no user input can change', () => {
  const decl = html.match(/const EMAILJS_TO_EMAIL\s*=\s*'([^']*)';/g) || [];
  assert.strictEqual(decl.length, 1, 'exactly one EMAILJS_TO_EMAIL declaration');
  assert.match(decl[0], /'thestrangepin@gmail\.com'/);
  const uses = html.match(/\bEMAILJS_TO_EMAIL\b/g) || [];
  assert.strictEqual(uses.length, 2, 'EMAILJS_TO_EMAIL is only declared and used once (never reassigned)');
  const keys = html.match(/\bto_email\s*:[^\n]*/g) || [];
  assert.deepStrictEqual(keys.map(k => k.replace(/\s+/g, ' ').trim()), ['to_email: EMAILJS_TO_EMAIL,'], 'to_email is only ever set from the constant');
  assert(!/\bto_email\s*[=\]]|\[['"]to_email['"]\]/.test(html), 'to_email is never assigned or set by key');
  assert(!/templateParams\s*(\.\w+|\[[^\]]*\])\s*=|Object\.assign\(\s*templateParams/.test(html), 'templateParams is never modified after it is built');
  const sends = html.match(/emailjs\.send\w*\([^)]*\)/g) || [];
  assert.deepStrictEqual(sends, ['emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams)'], 'one send call, with the fixed params object (no sendForm)');
  assert(!/(id|name)\s*=\s*["'][^"']*(to_email|recipient)/i.test(html), 'no form field named like a recipient');
});

console.log(`\n${passed} helper tests passed`);
