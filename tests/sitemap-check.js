#!/usr/bin/env node
// Verifies that <out>/sitemap.xml lists ONLY URLs that exist in the build output, and that
// every generated pin page is listed. Used by netlify.toml (fails the build) and CI.
//   node tests/sitemap-check.js [outDir=dist] [site=https://strangepin.com]
'use strict';
const fs = require('fs'), path = require('path');
const OUT = path.resolve(process.argv[2] || 'dist');
const SITE = (process.argv[3] || 'https://strangepin.com').replace(/\/$/, '');
const fail = []; const ok = (c, m) => { if (!c) fail.push(m); };
const xml = fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8');
const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'));
ok(locs.length > 0, 'sitemap has no <loc> entries');
ok(new Set(locs).size === locs.length, 'duplicate <loc> entries');
for (const u of locs) {
  ok(u.startsWith(SITE + '/'), `URL not on ${SITE}: ${u}`);
  const p = u.slice(SITE.length);
  ok(!p.includes('#') && !p.includes('?'), `URL with fragment/query: ${u}`);
  const file = p.endsWith('/') ? path.join(OUT, p, 'index.html') : path.join(OUT, p);
  ok(fs.existsSync(file), `listed but not in build output: ${u} -> ${path.relative(OUT, file)}`);
}
const pinsDir = path.join(OUT, 'pins');
const pages = fs.readdirSync(pinsDir).filter(d => fs.existsSync(path.join(pinsDir, d, 'index.html')));
for (const d of pages) ok(locs.includes(`${SITE}/pins/${d}/`), `built but not in sitemap: /pins/${d}/`);
const robots = fs.existsSync(path.join(OUT, 'robots.txt')) ? fs.readFileSync(path.join(OUT, 'robots.txt'), 'utf8') : '';
const sm = (robots.match(/^Sitemap:\s*(\S+)/mi) || [])[1];
if (sm) ok(sm === 'https://strangepin.com/sitemap.xml' || sm === SITE + '/sitemap.xml', `robots.txt Sitemap points elsewhere: ${sm}`);
if (fail.length) { console.error('SITEMAP CHECK FAILED:\n  ' + fail.join('\n  ')); process.exit(1); }
console.log(`sitemap check passed: ${locs.length} URLs, all present in ${path.relative(process.cwd(), OUT) || OUT}; ${pages.length} pin pages, all listed`);
