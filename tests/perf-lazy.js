// perf/lcp behaviour: early first render, lazy Google Translate, deferred Leaflet still works.
// Requires a static server on http://localhost:8080 serving the repo root.
const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://localhost:8080';
let pass = 0, fail = 0, info = [];
const check = (ok, n, x) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} - ${n}${x ? ' ' + x : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function open(b, hash, { delayCdnMs = 0, preset } = {}) {
  const pg = await b.newPage();
  const reqs = []; const errors = [];
  pg.on('pageerror', e => errors.push(e.message));
  await pg.evaluateOnNewDocument((preset) => {
    if (preset) for (const [k, v] of Object.entries(preset)) localStorage.setItem(k, v);
    window.__t = {};
    document.addEventListener('DOMContentLoaded', () => { window.__t.dcl = performance.now(); });
    new MutationObserver((m, obs) => {
      const el = document.getElementById('mainContent');
      if (el && el.children.length && !window.__t.render) { window.__t.render = performance.now(); obs.disconnect(); }
    }).observe(document, { childList: true, subtree: true });
  }, preset);
  await pg.setRequestInterception(true);
  pg.on('request', async q => {
    const u = q.url(); reqs.push(u);
    if (/^https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com/.test(u)) return q.abort();
    // Optionally slow the deferred CDN scripts to prove first render does not wait for them.
    if (delayCdnMs && /gstatic\.com\/firebasejs|unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.js|cdn\.jsdelivr\.net/.test(u)) await sleep(delayCdnMs);
    q.continue();
  });
  await pg.goto(BASE + '/?nosw=1' + hash, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return { pg, reqs, errors };
}
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });

  // 1. First render does not wait for the CDN scripts, which are requested only AFTER the first
  //    contentful paint (spLoadDeferredAssets) and then initialise Firebase.
  let { pg, reqs, errors } = await open(b, '#home', { delayCdnMs: 3000 });
  await sleep(4500);
  let t = await pg.evaluate(() => {
    const fcp = (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime;
    const cdn = performance.getEntriesByType('resource').filter(e => /leaflet\.js|email\.min\.js|firebase-app-compat/.test(e.name)).map(e => e.startTime);
    return { ...window.__t, fcp, cdnFirst: cdn.length ? Math.min(...cdn) : null, cdnCount: cdn.length, fb: !!window._spFirebaseInitialised,
      once: window._spAppInitDone, stats: document.getElementById('statPins')?.textContent, countries: document.getElementById('statCountries')?.textContent };
  });
  check(t.render && t.render < 1000 && t.fcp && t.fcp < 1500, 'home renders and paints without waiting for the (3 s delayed) CDN scripts', `render=${Math.round(t.render)}ms fcp=${Math.round(t.fcp)}ms`);
  check(t.cdnCount === 3 && t.cdnFirst >= t.fcp - 1, 'CDN scripts are requested only after the first contentful paint', `fcp=${Math.round(t.fcp)} firstCdnRequest=${Math.round(t.cdnFirst)}`);
  check(t.fb === true, 'Firebase initialises once the delayed SDK scripts arrive (spCdnReady)');
  check(t.once === true, 'initApp ran exactly once (guard set)');
  check(t.stats === '99' && /^\d+$/.test(t.countries || ''), 'stats bar shows local pin/country counts immediately', `${t.stats} pins, ${t.countries} countries`);
  check(!reqs.some(u => u.includes('translate.google.com')), 'Google Translate NOT requested on a plain page load');
  check(errors.length === 0, 'no page errors (home, slow CDN)', errors.join(' | '));
  await pg.close();

  // 2. Map deep link still initialises once Leaflet (deferred) + CSS (non-blocking) arrive.
  ({ pg, reqs, errors } = await open(b, '#map', { delayCdnMs: 2500 }));
  await sleep(7000);
  const map = await pg.evaluate(() => ({ markers: document.querySelectorAll('#leafletMap .leaflet-marker-icon').length,
    css: !!(document.getElementById('leafletCss') || {}).sheet, pane: !!document.querySelector('#leafletMap .leaflet-pane') }));
  check(map.markers === 99 && map.pane && map.css === true, 'map deep link: 99 markers after slow Leaflet; Leaflet CSS applied', JSON.stringify(map));
  check(errors.length === 0, 'no page errors (map, slow CDN)', errors.join(' | '));
  await pg.close();

  // 3. Submit page mini-map.
  ({ pg, errors } = await open(b, '#submit', { delayCdnMs: 2000 }));
  await sleep(5000);
  const sub = await pg.evaluate(() => !!document.querySelector('#submitMap .leaflet-pane'));
  check(sub && errors.length === 0, 'submit mini-map initialises after slow Leaflet, no errors', errors.join(' | '));
  await pg.close();

  // 4. Opening the language menu loads Translate on demand.
  ({ pg, reqs } = await open(b, '#home'));
  await sleep(1500);
  const before = reqs.filter(u => u.includes('translate.google.com')).length;
  await pg.evaluate(() => toggleLang());
  await sleep(4000);
  const after = reqs.filter(u => u.includes('translate.google.com')).length;
  const combo = await pg.evaluate(() => !!document.querySelector('.goog-te-combo, #google_translate_element .goog-te-gadget'));
  check(before === 0 && after >= 1, 'language menu interaction triggers the Translate script', `before=${before} after=${after}`);
  const limited = reqs.some(u => u.includes('google.com/sorry'));
  if (limited) info.push('Google returned its /sorry rate-limit page; widget checks skipped');
  else check(combo, 'Translate widget initialises after menu open');
  // End-to-end: choosing Spanish reloads (cookie path, same as before) and the page is translated.
  if (!limited) {
    await Promise.all([pg.waitForNavigation({ timeout: 30000 }).catch(() => null), pg.evaluate(() => translatePage('es', '🇪🇸', 'Español'))]);
    await sleep(9000);
    const tr = await pg.evaluate(() => ({ cls: document.documentElement.className, lang: document.documentElement.lang }));
    if (reqs.some(u => u.includes('google.com/sorry'))) info.push('rate-limited during translation check; skipped');
    else check(/translated-ltr/.test(tr.cls) && tr.lang === 'es', 'choosing Español translates the page (html.translated-ltr, lang=es)', JSON.stringify(tr));
  }
  await pg.close();

  // 5. A saved non-English preference loads Translate at startup.
  ({ pg, reqs } = await open(b, '#home', { preset: { sp_lang_gt: 'es', sp_lang_flag: '🇪🇸', sp_lang_name: 'Español' } }));
  await sleep(2500);
  check(reqs.some(u => u.includes('translate.google.com/translate_a/element.js')), 'saved language preference loads Translate without interaction');
  await pg.close();

  await b.close();
  for (const i of info) console.log('INFO - ' + i);
  console.log(`\n${pass}/${pass + fail} perf/lazy-load checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
