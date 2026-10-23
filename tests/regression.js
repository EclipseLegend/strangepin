// Site regression on the v3 client: 99 pins, every route, map, search, and NO console errors.
// Runs inside the emulators (project demo-strangepin) so the Firebase SDK has a back end to
// talk to; production Firebase / EmailJS / Cloudinary hosts are blocked and counted (must be 0).
//   firebase emulators:exec --only auth,firestore --project demo-strangepin "node tests/regression.js"
//   (static server on :8080 from the repo root)
'use strict';
const puppeteer = require('puppeteer-core');
const guard = require('./lib/prod-guard');
const BASE = process.env.BASE || 'http://localhost:8080';
let pass = 0, fail = 0;
const check = (ok, n, x) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} - ${n}${x ? ' :: ' + x : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROUTES = [['#home', 'home'], ['#map', 'map'], ['#nearby', 'nearby'], ['#submit', 'submit'], ['#leaderboard', 'leaderboard'],
  ['#about', 'about'], ['#profile', 'profile'], ['#detail/001', 'detail'], ['#detail/area-51', 'detail'], ['#map?q=japan', 'map']];

(async () => {
  await fetch('http://127.0.0.1:8085/emulator/v1/projects/demo-strangepin/databases/(default)/documents', { method: 'DELETE' }).catch(() => {});
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new',
    args: [...guard.chromeArgs(), '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const consoleErrors = [], pageErrors = [];
  for (const [hash, expectPage] of ROUTES) {
    const pg = await b.newPage(); guard.watch(pg);
    pg.on('pageerror', e => pageErrors.push(hash + ': ' + e.message));
    pg.on('console', m => { if (m.type() === 'error') consoleErrors.push(hash + ': ' + m.text().slice(0, 180)); });
    pg.on('dialog', d => { pageErrors.push(hash + ': dialog ' + d.message()); d.dismiss(); });
    await pg.setRequestInterception(true);
    // http://translate.google.com is protocol-relative on this http origin and port 80 hangs here.
    pg.on('request', r => (/^http:\/\/translate\.google/.test(r.url()) ? r.abort() : r.continue()));
    await pg.goto(BASE + '/?emulator=1' + hash, { waitUntil: 'load', timeout: 60000 });
    await pg.waitForFunction(() => window._db && window._spEmulator, { timeout: 15000 });
    await sleep(hash.startsWith('#map') ? 6000 : 2500);
    const st = await pg.evaluate(() => ({ page: window.currentPage, len: (document.getElementById('mainContent') || {}).textContent.length, n: LOCATIONS.length, signInPrompt: /sign in/i.test((document.getElementById('mainContent') || {}).textContent) }));
    // Signed out, #profile is a short sign-in prompt; every other route renders full content.
    const contentOk = hash === '#profile' ? st.signInPrompt : st.len > 200;
    check(st.page === expectPage && contentOk, `route ${hash} renders ${expectPage}`, JSON.stringify(st));
    if (hash === '#home') {
      check(st.n === 99, '99 pins in LOCATIONS', 'n=' + st.n);
      check((await pg.evaluate(() => (document.getElementById('statPins') || {}).textContent)) === '99', 'home shows 99 pins');
    }
    if (hash === '#map') {
      const m = await pg.evaluate(() => ({ count: (document.getElementById('pinCount') || {}).textContent, cards: document.querySelectorAll('#mapList > *').length, basemap: (document.getElementById('leafletMap') || {}).dataset.basemap, markers: document.querySelectorAll('#leafletMap .leaflet-marker-icon, #leafletMap .maplibregl-marker').length }));
      check(m.count === '99 pins found' && m.cards === 99, 'map lists all 99 pins', JSON.stringify(m));
      check(!!m.basemap && m.markers > 0, 'map renders a basemap and markers', JSON.stringify(m));
      await pg.focus('#mapSearchInput'); await pg.keyboard.type('japan');
      await sleep(800);
      const s = await pg.evaluate(() => ({ count: (document.getElementById('pinCount') || {}).textContent, cards: document.querySelectorAll('#mapList > *').length,
        expect: LOCATIONS.filter(l => [(l.nameEn || l.name), l.country, l.city, l.category].some(v => String(v).toLowerCase().includes('japan'))).length }));
      check(s.expect > 0 && s.cards === s.expect && s.count.startsWith(s.expect + ' pin'), 'search "japan" filters the list', JSON.stringify(s));
      await pg.evaluate(() => { const i = document.getElementById('mapSearchInput'); i.value = 'zzzz-no-match'; i.dispatchEvent(new Event('input')); });
      await sleep(500);
      check(/No pins match/.test(await pg.evaluate(() => document.getElementById('mapList').textContent)), 'search with no match shows the empty state');
    }
    if (hash === '#map?q=japan') check((await pg.evaluate(() => document.getElementById('mapSearchInput').value)) === 'japan', 'deep link #map?q=japan pre-fills the search');
    await pg.close();
  }
  check(pageErrors.length === 0, 'no uncaught page errors or dialogs', pageErrors.slice(0, 3).join(' | '));
  check(consoleErrors.length === 0, 'no console errors on any route', consoleErrors.slice(0, 5).join(' || '));
  check(guard.hits().length === 0, guard.summary());
  await b.close();
  console.log(`\n${pass}/${pass + fail} regression checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
