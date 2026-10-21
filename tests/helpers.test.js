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
  '; return { escapeHtml, safeHttpsUrl, avatarInitial, safeDocId, avatarHtml, truncateAtWord, previewText };')();
const { escapeHtml, safeHttpsUrl, avatarInitial, safeDocId, avatarHtml, truncateAtWord, previewText } = helpers;

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

console.log(`\n${passed} helper tests passed`);
