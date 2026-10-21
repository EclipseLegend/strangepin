#!/usr/bin/env node
/*
 * Writes the static first-paint copy of the home hero into index.html, between
 *   <!-- SP-STATIC-HERO:BEGIN --> ... <!-- SP-STATIC-HERO:END -->
 * by evaluating renderHomeHero() (and the LOCATIONS array it reads) from index.html.
 *   node scripts/sync-static-hero.js          rewrite index.html
 *   node scripts/sync-static-hero.js --check  exit 1 if the static copy is out of date
 * No dependencies, no network.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const FILE = path.resolve(__dirname, '..', 'index.html');
const BEGIN = '<!-- SP-STATIC-HERO:BEGIN -->', END = '<!-- SP-STATIC-HERO:END -->';

function sourceOf(html, startToken, endToken) {
  const a = html.indexOf(startToken); if (a < 0) throw new Error('not found: ' + startToken);
  const b = html.indexOf(endToken, a); if (b < 0) throw new Error('end not found for: ' + startToken);
  return html.slice(a, b + endToken.length);
}

function expectedHero(html) {
  const locs = sourceOf(html, 'const LOCATIONS = [', '\n];');
  const fn = sourceOf(html, 'function renderHomeHero() {', '\n}');
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(locs.replace('const LOCATIONS', 'var LOCATIONS') + '\n' + fn + '\nvar __out = renderHomeHero();', ctx);
  return ctx.__out.trim();
}

const html = fs.readFileSync(FILE, 'utf8');
const want = expectedHero(html);
const a = html.indexOf(BEGIN), b = html.indexOf(END);
if (a < 0 || b < 0) throw new Error('SP-STATIC-HERO markers missing in index.html');
const have = html.slice(a + BEGIN.length, b).trim();
if (process.argv.includes('--check')) {
  if (have !== want) { console.error('static hero is OUT OF DATE: run node scripts/sync-static-hero.js'); process.exit(1); }
  console.log('static hero is up to date'); process.exit(0);
}
fs.writeFileSync(FILE, html.slice(0, a + BEGIN.length) + '\n' + want + '\n' + html.slice(b));
console.log(have === want ? 'static hero already up to date' : 'static hero updated');
