#!/usr/bin/env node
/*
 * PROTOTYPE static generator for /pins/<slug>/ pages (see docs/seo-url-plan.md).
 *
 *   node scripts/build-pins.js [--out dist] [--site https://strangepin.com]
 *
 * Reads the inline LOCATIONS array from index.html (the live data source), copies
 * the static site into --out, and writes:
 *   <out>/pins/<slug>/index.html   one crawlable page per pin
 *   <out>/pins/index.html          an HTML index of all pins
 *   <out>/sitemap.xml              home + every pin page
 *   <out>/pins-manifest.json       id -> slug -> url (used for #detail/NNN handling)
 * Uses no dependencies and makes no network calls.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, opt('--out', 'dist'));
const SITE = opt('--site', 'https://strangepin.com').replace(/\/$/, '');

// Static files that are copied as-is (only those that exist).
const STATIC = ['index.html', 'sw.js', 'offline.html', 'manifest.json', 'robots.txt', 'favicon.png',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'og-image.png', '_headers', '_redirects'];

// ── helpers ──────────────────────────────────────────────────────────────────
const escapeHtml = (v) => (v === null || v === undefined ? '' : String(v)).replace(/[&<>"'`]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
const safeHttpsUrl = (v) => { try { const u = new URL(String(v).trim()); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
/** JSON for a <script type="application/ld+json"> block: cannot close the tag. */
const jsonLd = (o) => JSON.stringify(o, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const truncateAtWord = (s, max) => {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1); const i = cut.lastIndexOf(' ');
  return (i > max * 0.6 ? cut.slice(0, i) : cut).replace(/[\s,;:.—-]+$/, '') + '…';
};
/** Slug rule: NFKD, strip diacritics, lowercase, [a-z0-9] runs joined by "-", max 80 chars. */
function slugify(s) {
  return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
}
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function loadLocations() {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const a = src.indexOf('const LOCATIONS = [');
  if (a < 0) throw new Error('LOCATIONS array not found in index.html');
  const b = src.indexOf('\n];', a) + 3;
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(src.slice(a, b).replace('const LOCATIONS', 'this.LOCATIONS') + ';', ctx, { timeout: 2000 });
  return ctx.LOCATIONS;
}

function assignSlugs(locs) {
  const used = new Map();
  return locs.map((l) => {
    let slug = SLUG_RE.test(l.slug || '') ? l.slug : slugify(l.nameEn || l.name);
    if (!slug) slug = 'pin-' + l.id;
    if (used.has(slug)) slug = `${slug}-${l.id}`;           // deterministic collision rule
    used.set(slug, l.id);
    return { loc: l, slug, url: `${SITE}/pins/${slug}/` };
  });
}

const WARN = {
  'Dangerous Location': 'Do not enter dangerous or restricted areas.',
  'Restricted Area': 'Access to this location may be illegal. Respect all posted restrictions.',
  'Tragic Event': 'This location is associated with a tragic event. Please be respectful.',
  'Sensitive': 'This content involves sensitive subject matter.',
  'Legend Only': 'Some details are based on local legends or disputed accounts.',
  'Disputed Claim': 'Some claims about this location are disputed and have not been independently verified.',
};

function pinPage({ loc, slug, url }, all) {
  const name = loc.nameEn || loc.name;
  const place = [loc.city && loc.city !== loc.country ? loc.city : '', loc.country].filter(Boolean).join(', ');
  const title = `${name} — ${loc.category} Mystery${place ? ' in ' + place : ''} | StrangePin`;
  const desc = truncateAtWord(loc.shortPreview || loc.fullStory || `${name}: a ${loc.category} location on StrangePin.`, 160);
  const hero = safeHttpsUrl(loc.media && loc.media.heroImageUrl);
  const ogImage = hero || `${SITE}/og-image.png`;
  const appUrl = `/#detail/${encodeURIComponent(loc.id)}`;
  const flags = (loc.contentFlags || []).filter((f) => WARN[f]);
  const body = [
    loc.theStory ? ['The Story', loc.theStory] : loc.fullStory ? ['About This Place', loc.fullStory] : null,
    loc.whatWeKnow ? ['What We Know', loc.whatWeKnow] : null,
    loc.theMystery ? ['The Mystery', loc.theMystery] : null,
  ].filter(Boolean);
  const timeline = (loc.timeline || []).filter((t) => t && t.event);
  const sources = (loc.sources || []).filter((s) => s && s.title);
  const related = all.filter((o) => o.loc.id !== loc.id && o.loc.category === loc.category).slice(0, 4);
  const geo = loc.coordinates && Number.isFinite(loc.coordinates.lat) && Number.isFinite(loc.coordinates.lng)
    ? { '@type': 'GeoCoordinates', latitude: loc.coordinates.lat, longitude: loc.coordinates.lng } : undefined;

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Place', '@id': url + '#place', name, description: desc, url,
        ...(geo ? { geo } : {}),
        address: { '@type': 'PostalAddress', addressCountry: loc.countryCode || loc.country,
          ...(loc.city && loc.city !== loc.country ? { addressLocality: loc.city } : {}) } },
      { '@type': 'Article', '@id': url + '#article', headline: truncateAtWord(name, 110), description: desc,
        url, mainEntityOfPage: url, image: ogImage, inLanguage: 'en', about: { '@id': url + '#place' },
        ...(loc.dateAdded ? { datePublished: loc.dateAdded } : {}),
        publisher: { '@type': 'Organization', name: 'StrangePin', url: SITE + '/', logo: { '@type': 'ImageObject', url: `${SITE}/icon-512.png` } },
        ...(sources.some((s) => safeHttpsUrl(s.url)) ? { citation: sources.map((s) => safeHttpsUrl(s.url)).filter(Boolean) } : {}) },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'StrangePin', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Pins', item: SITE + '/pins/' },
        { '@type': 'ListItem', position: 3, name, item: url } ] },
    ],
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(desc)}">
  <link rel="canonical" href="${escapeHtml(url)}">
  <meta name="robots" content="index, follow">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="StrangePin">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(desc)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(desc)}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">
  <meta name="theme-color" content="#07070e">
  <link rel="icon" type="image/png" href="/favicon.png">
  <link rel="manifest" href="/manifest.json">
  <script type="application/ld+json">
${jsonLd(ld)}
  </script>
  <style>
    :root{color-scheme:dark}
    body{margin:0;background:#07070e;color:#e8e6f0;font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
    main{max-width:760px;margin:0 auto;padding:24px 20px 64px}
    a{color:#22d3ee}
    nav.crumbs{font-size:.85rem;color:#a09cb5}
    h1{font-size:2rem;line-height:1.2;margin:.4em 0 .2em}
    .meta{color:#a09cb5;font-size:.9rem}
    .warn{border:1px solid #b45309;background:rgba(180,83,9,.15);border-radius:10px;padding:10px 14px;margin:16px 0}
    h2{font-size:1.05rem;letter-spacing:.06em;text-transform:uppercase;color:#fbbf24;margin-top:32px}
    .cta{display:inline-block;margin:20px 0;padding:10px 18px;border-radius:999px;background:#7c3aed;color:#fff;text-decoration:none}
    ol.tl{list-style:none;padding-left:16px;border-left:2px solid #2a2840}
    ol.tl time{display:block;font-family:ui-monospace,monospace;font-size:.8rem;color:#a09cb5}
    footer{margin-top:48px;font-size:.8rem;color:#8a87a0}
  </style>
</head>
<body>
  <main>
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">StrangePin</a> › <a href="/pins/">Pins</a> › ${escapeHtml(name)}</nav>
    <article>
      <h1>${escapeHtml(name)}</h1>
      <p class="meta">${escapeHtml(loc.category)}${place ? ' · ' + escapeHtml(place) : ''}${geo ? ` · <span>${geo.latitude.toFixed(4)}°, ${geo.longitude.toFixed(4)}°</span>` : ''}</p>
      ${flags.length ? `<div class="warn" role="note">${flags.map((f) => `<div>${escapeHtml(WARN[f])}</div>`).join('')}${loc.safetyNote ? `<div>${escapeHtml(loc.safetyNote)}</div>` : ''}</div>` : ''}
      ${body.map(([h, t]) => `<h2>${escapeHtml(h)}</h2>\n      <p>${escapeHtml(t)}</p>`).join('\n      ')}
      ${timeline.length ? `<h2>Timeline</h2>
      <ol class="tl">${timeline.map((t) => `<li><time>${escapeHtml(t.date)}</time>${escapeHtml(t.event)}</li>`).join('')}</ol>` : ''}
      ${sources.length ? `<h2>Sources</h2>
      <ul>${sources.map((s) => { const u = safeHttpsUrl(s.url); return `<li>${u ? `<a href="${escapeHtml(u)}" rel="noopener nofollow">${escapeHtml(s.title)}</a>` : escapeHtml(s.title)}${s.type ? ` (${escapeHtml(s.type)})` : ''}</li>`; }).join('')}</ul>` : ''}
      <a class="cta" href="${escapeHtml(appUrl)}">Open on the interactive map →</a>
    </article>
    ${related.length ? `<h2>More ${escapeHtml(loc.category)} pins</h2>
    <ul>${related.map((r) => `<li><a href="/pins/${escapeHtml(r.slug)}/">${escapeHtml(r.loc.nameEn || r.loc.name)}</a></li>`).join('')}</ul>` : ''}
    <footer>StrangePin presents folklore, history and personal accounts as cultural narratives; it does not claim any paranormal event is proven.</footer>
  </main>
</body>
</html>
`;
}

function pinsIndex(all) {
  const url = `${SITE}/pins/`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>All mystery pins | StrangePin</title>
  <meta name="description" content="Every curated StrangePin location: haunted places, UFO sites, ancient mysteries, urban legends and strange experiences worldwide.">
  <link rel="canonical" href="${url}">
  <link rel="icon" type="image/png" href="/favicon.png">
  <style>body{margin:0;background:#07070e;color:#e8e6f0;font:16px/1.6 system-ui,sans-serif}main{max-width:760px;margin:0 auto;padding:24px 20px}a{color:#22d3ee}</style>
</head>
<body>
  <main>
    <h1>All mystery pins</h1>
    <ul>${all.map((o) => `<li><a href="/pins/${escapeHtml(o.slug)}/">${escapeHtml(o.loc.nameEn || o.loc.name)}</a> · ${escapeHtml(o.loc.category)} · ${escapeHtml(o.loc.country)}</li>`).join('\n    ')}</ul>
  </main>
</body>
</html>
`;
}

function sitemap(all) {
  const x = (s) => escapeHtml(s);
  const urls = [{ loc: SITE + '/' }, { loc: SITE + '/pins/' },
    ...all.map((o) => ({ loc: o.url, lastmod: o.loc.dateAdded }))];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${x(u.loc)}</loc>${u.lastmod ? `<lastmod>${x(u.lastmod)}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
}

function main() {
  const locs = loadLocations();
  const all = assignSlugs(locs);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'pins'), { recursive: true });
  for (const f of STATIC) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
  for (const o of all) {
    const dir = path.join(OUT, 'pins', o.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), pinPage(o, all));
  }
  fs.writeFileSync(path.join(OUT, 'pins', 'index.html'), pinsIndex(all));
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), sitemap(all));
  fs.writeFileSync(path.join(OUT, 'pins-manifest.json'),
    JSON.stringify(Object.fromEntries(all.map((o) => [o.loc.id, { slug: o.slug, path: `/pins/${o.slug}/` }])), null, 1));
  console.log(`Built ${all.length} pin pages into ${path.relative(ROOT, OUT) || OUT} (site ${SITE})`);
}

if (require.main === module) main();
module.exports = { slugify, truncateAtWord, escapeHtml, jsonLd, assignSlugs, loadLocations, pinPage, sitemap };
