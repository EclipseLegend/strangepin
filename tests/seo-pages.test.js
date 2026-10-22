// Tests for scripts/build-pins.js output. Run after: node scripts/build-pins.js
// Optional: HTMLVALIDATE=/path/to/node_modules/.bin/html-validate for markup validation.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const gen = require('../scripts/build-pins.js');
const DIST = path.join(__dirname, '..', 'dist');
let pass = 0, fail = 0;
const check = (ok, n, x) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} - ${n}${x ? ' ' + x : ''}`); };

// 1. Slug rules
check(gen.slugify('Café Ghost  — São Paulo & Co.') === 'cafe-ghost-sao-paulo-and-co', 'slugify strips diacritics/punctuation', gen.slugify('Café Ghost  — São Paulo & Co.'));
check(gen.slugify('x'.repeat(120)).length === 80, 'slugify caps at 80 chars');
const dup = gen.assignSlugs([{ id: '001', slug: 'same' }, { id: '002', slug: 'same' }, { id: '003', slug: 'Bad Slug!', name: 'Ok Name' }]);
check(dup[1].slug === 'same-002' && dup[2].slug === 'ok-name', 'collisions get -<id>; invalid slugs are re-derived', dup.map(d => d.slug).join(','));

// 2. Every generated page
const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'pins-manifest.json'), 'utf8'));
const ids = Object.keys(manifest);
check(ids.length === 99, '99 pins in pins-manifest.json', ids.length);
const titles = new Set(); let ldOk = 0, canonOk = 0, descOk = 0, ogOk = 0, geoOk = 0, noRating = 0;
for (const id of ids) {
  const { slug } = manifest[id];
  const html = fs.readFileSync(path.join(DIST, 'pins', slug, 'index.html'), 'utf8');
  const url = `https://strangepin.com/pins/${slug}/`;
  titles.add((html.match(/<title>([^<]*)<\/title>/) || [])[1]);
  if ((html.match(/<link rel="canonical" href="([^"]*)">/) || [])[1] === url) canonOk++;
  const d = (html.match(/<meta name="description" content="([^"]*)">/) || [])[1] || '';
  if (d.length >= 50 && d.replace(/&[a-z#0-9]+;/g, 'x').length <= 160) descOk++;
  if (/property="og:image" content="https:\/\//.test(html) && html.includes(`property="og:url" content="${url}"`)) ogOk++;
  try {
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const types = ld['@graph'].map(n => n['@type']);
    if (types.includes('Place') && types.includes('Article') && types.includes('BreadcrumbList')) ldOk++;
    const place = ld['@graph'].find(n => n['@type'] === 'Place');
    if (place.geo && Number.isFinite(place.geo.latitude)) geoOk++;
    if (!JSON.stringify(ld).includes('aggregateRating')) noRating++;
  } catch (e) { /* counted as failure */ }
}
check(titles.size === 99, 'all 99 titles unique', titles.size);
check(canonOk === 99, 'canonical = https://strangepin.com/pins/<slug>/ on all pages', canonOk);
check(descOk === 99, 'meta description 50–160 chars on all pages', descOk);
check(ogOk === 99, 'og:url + https og:image on all pages', ogOk);
check(ldOk === 99, 'JSON-LD parses with Place + Article + BreadcrumbList on all pages', ldOk);
check(geoOk === 99, 'Place.geo present on all pages', geoOk);
check(noRating === 99, 'no aggregateRating (placeholder metrics never exported)', noRating);

// 3. Hostile data stays inert
const all = gen.assignSlugs([{ id: '999', slug: 'evil', name: '</title><script>alert(1)</script>', category: 'UFO', country: 'X',
  fullStory: '<img src=x onerror=alert(1)>', contentFlags: [], coordinates: { lat: 1, lng: 2 },
  timeline: [{ date: '"><b>', event: '</script><script>alert(2)</script>' }],
  sources: [{ title: 'js', url: 'javascript:alert(3)' }, { title: 'ok', url: 'https://example.com/"onclick="x' }] }]);
const evil = gen.pinPage(all[0], all);
const ldEvil = evil.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
check(!/<script>alert|<img src=x|<b>|javascript:/i.test(evil.replace(ldEvil, '')), 'hostile markup escaped in HTML');
check(!/<\/script/i.test(ldEvil) && JSON.parse(ldEvil)['@graph'][0].name.includes('</title>'), 'JSON-LD cannot close its script tag and still round-trips');
check(evil.includes('href="https://example.com/%22onclick=%22x"'), 'https link attribute cannot break out');

// 4. sitemap.xml is well-formed with 101 URLs
const sm = cp.execFileSync('python3', ['-c', 'import sys,xml.etree.ElementTree as E;r=E.parse(sys.argv[1]).getroot();print(len(r))', path.join(DIST, 'sitemap.xml')]).toString().trim();
check(sm === '101', 'sitemap.xml parses as XML with 101 <url> entries (home, /pins/, 99 pins)', sm);

// 5. Optional HTML validation (sample)
if (process.env.HTMLVALIDATE) {
  const sample = ['pins/index.html', ...ids.slice(0, 5).concat(ids.slice(-3)).map(id => `pins/${manifest[id].slug}/index.html`)];
  const cfg = path.join(require('os').tmpdir(), 'hv.json');
  fs.writeFileSync(cfg, JSON.stringify({ extends: ['html-validate:standard'], rules: { 'no-inline-style': 'off', 'long-title': 'off' } }));
  let out = '', ok = true;
  try { out = cp.execFileSync(process.env.HTMLVALIDATE, ['-c', cfg, ...sample.map(f => path.join(DIST, f))], { encoding: 'utf8' }); }
  catch (e) { ok = false; out = (e.stdout || '') + (e.stderr || ''); }
  check(ok, `html-validate (standard preset) on ${sample.length} sample pages`, ok ? '' : '\n' + out.slice(0, 1500));
}

console.log(`\n${pass}/${pass + fail} SEO generator checks passed`);
process.exit(fail ? 1 : 0);
