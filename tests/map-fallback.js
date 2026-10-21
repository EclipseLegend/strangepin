// Basemap fallback chain (index.html BASEMAP CONFIG): each failure mode is forced by
// blocking hosts or disabling WebGL, and the basemap actually used is read from
// #leafletMap[data-basemap]. Requires a static server on http://localhost:8080.
// OpenStreetMap and CARTO tiles are MOCKED (served locally) so the tests never send
// automated traffic to tile.openstreetmap.org (OSMF policy) or need a CARTO key.
// OpenFreeMap is reached read-only in the scenarios that expect it to work.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8080';
const PNG = fs.readFileSync(__dirname + '/../icon-192.png');
let pass = 0, fail = 0;
const check = (ok, n, x) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} - ${n}${x ? ' :: ' + x : ''}`); };

async function run({ name, webgl = true, block = [], cartoKey = '', expect, hash = '#map', container = '#leafletMap' }) {
  const args = ['--no-sandbox'];
  if (webgl) args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader'); else args.push('--disable-webgl', '--disable-3d-apis');
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args });
  const pg = await b.newPage(); const errors = []; const hosts = new Set();
  pg.on('pageerror', e => errors.push(e.message));
  await pg.setRequestInterception(true);
  pg.on('request', async q => {
    const u = q.url(); try { hosts.add(new URL(u).host); } catch (_) {}
    if (/^https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com|firebaseapp\.com\/__\/auth|apis\.google\.com/.test(u)) return q.abort();
    if (block.some(re => re.test(u))) return q.abort('connectionrefused');
    if (/^https:\/\/tile\.openstreetmap\.org\//.test(u) || /^https:\/\/basemaps\.cartocdn\.com\/rastertiles\//.test(u))
      return q.respond({ status: 200, contentType: 'image/png', body: PNG });
    if (cartoKey && q.resourceType() === 'document' && u.startsWith(BASE)) {
      const r = await fetch(u); let html = await r.text();
      html = html.replace("const SP_CARTO_KEY = '';", `const SP_CARTO_KEY = '${cartoKey}';`);
      return q.respond({ status: 200, contentType: 'text/html', body: html });
    }
    q.continue();
  });
  await pg.goto(BASE + '/?nosw=1' + hash, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.waitForFunction(c => document.querySelector(c) && document.querySelector(c).dataset.basemap, { timeout: 45000 }, container).catch(() => null);
  const r = await pg.evaluate(c => {
    const el = document.querySelector(c); const ov = el && el.querySelector('.sp-map-error');
    return { used: el && el.dataset.basemap, markers: el ? el.querySelectorAll('.leaflet-marker-icon').length : -1,
      overlay: ov ? ov.textContent.trim().slice(0, 60) : null, attr: (el && el.querySelector('.leaflet-control-attribution') || {}).textContent || '',
      osmDark: !!(el && el.querySelector('.sp-osm-dark')) };
  }, container);
  check(r.used === expect, `${name}: basemap = ${expect}`, JSON.stringify(r));
  if (hash === '#map') check(r.markers === 99, `${name}: 99 markers`, r.markers);
  if (expect === 'none') check(!!r.overlay && /Map tiles are unavailable/.test(r.overlay), `${name}: friendly English error overlay shown`, r.overlay);
  else check(!r.overlay && /OpenStreetMap/.test(r.attr), `${name}: no error overlay; OpenStreetMap attribution visible`, r.attr.slice(0, 80));
  if (expect === 'osm-dark') check(r.osmDark, `${name}: OSM raster has the dark filter class`);
  check(errors.length === 0, `${name}: no uncaught page errors`, errors.join(' | '));
  await b.close();
}

(async () => {
  await run({ name: 'default (WebGL, all hosts up)', expect: 'openfreemap-dark' });
  await run({ name: 'MapLibre CDN blocked', block: [/unpkg\.com\/(maplibre-gl|@maplibre)/], expect: 'osm-dark' });
  await run({ name: 'OpenFreeMap style/tiles blocked', block: [/tiles\.openfreemap\.org/], expect: 'osm-dark' });
  await run({ name: 'no WebGL', webgl: false, expect: 'osm-dark' });
  await run({ name: 'OFM blocked + CARTO key configured', block: [/tiles\.openfreemap\.org/], cartoKey: 'TEST-KEY', expect: 'carto-key' });
  await run({ name: 'all providers blocked', block: [/tiles\.openfreemap\.org/, /tile\.openstreetmap\.org/], expect: 'none' });
  await run({ name: 'submit mini-map, all providers blocked', block: [/tiles\.openfreemap\.org/, /tile\.openstreetmap\.org/], expect: 'none', hash: '#submit', container: '#submitMap' });
  console.log(`\n${pass}/${pass + fail} map fallback checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
