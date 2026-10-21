// PWA test: SW registration, precache, offline navigation, no Firebase/googleapis caching.
// Real offline: phase A runs online against a static server this script starts
// (python3 -m http.server on :8090). Phase B kills that server and relaunches Chrome
// with the same profile and every host name unresolvable, so neither the origin
// nor any CDN can be reached. (DevTools offline emulation does not apply to the
// service worker's own fetches, so it is not used.)
const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const PORT = 8090;
const BASE = `http://localhost:${PORT}`;
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-pwa-'));
const launch = (extra = []) => puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  userDataDir: PROFILE, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...extra] });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (ok, name, extra) => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}${extra ? ' ' + extra : ''}`); };
(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  await sleep(1000);
  let browser = await launch();
  let page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  // Never reach real Firebase back ends or the plain-http translate script.
  page.on('request', r => /^http:\/\/translate\.google|^https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com/.test(r.url()) ? r.abort() : r.continue());

  await page.goto(BASE + '/', { waitUntil: 'load' });
  const reg = await page.evaluate(async () => {
    const r = await Promise.race([navigator.serviceWorker.ready, new Promise(res => setTimeout(() => res(null), 15000))]);
    return r ? { scope: r.scope, active: !!r.active } : null;
  });
  check(reg && reg.active && reg.scope === BASE + '/', 'service worker registered and active, scope /', JSON.stringify(reg));
  await page.reload({ waitUntil: 'load' }); // now controlled
  await new Promise(r => setTimeout(r, 2500));
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  check(controlled, 'page is controlled by the service worker after reload');

  const caches = await page.evaluate(async () => {
    const out = {};
    for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).map(r => r.url);
    return out;
  });
  const all = Object.values(caches).flat();
  const shell = Object.entries(caches).filter(([k]) => k.startsWith('sp-shell-')).flatMap(([, v]) => v);
  for (const u of ['/', '/index.html', '/offline.html', '/manifest.json', '/icon-192.png'])
    check(shell.includes(BASE + u), `precached ${u}`);
  check(all.some(u => u.includes('unpkg.com/leaflet@1.9.4/dist/leaflet.js')), 'pinned Leaflet JS runtime-cached');
  const forbidden = all.filter(u => /googleapis\.com|gstatic\.com|firebase|identitytoolkit|securetoken|emailjs|cloudinary|cartocdn|openfreemap|openstreetmap|translate/.test(u));
  check(forbidden.length === 0, 'no Firebase/googleapis/gstatic/EmailJS/Cloudinary/tile/translate URLs in any cache', forbidden.slice(0, 3).join(' '));

  check(errors.length === 0, 'online: no uncaught page errors', errors.slice(0, 2).join(' | '));
  await browser.close();

  // Phase B: genuinely offline.
  server.kill();
  await sleep(500);
  browser = await launch(['--host-resolver-rules=MAP * ~NOTFOUND']);
  page = await browser.newPage();
  page.on('pageerror', e => errors.push('offline: ' + e.message));
  await page.goto(BASE + '/#map', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 3000));
  const off1 = await page.evaluate(() => ({ title: document.title, hasApp: !!document.getElementById('app') || document.body.innerText.length > 500,
    markers: document.querySelectorAll('.leaflet-marker-icon').length }));
  check(off1.hasApp, 'offline: root navigation serves cached app shell', JSON.stringify(off1));
  check(off1.markers > 0, 'offline: map markers render from cached index.html (inline data) + Leaflet', `markers=${off1.markers}`);

  await page.goto(BASE + '/pins/not-cached-yet/', { waitUntil: 'domcontentloaded' });
  const off2 = await page.evaluate(() => document.title);
  check(/Offline/.test(off2), 'offline: uncached path serves offline.html', off2);

  const offlineErrors = errors.filter(e => e.startsWith('offline: '));
  console.log('INFO - offline page errors (informational):', offlineErrors.length ? offlineErrors.slice(0, 3).join(' | ') : 'none');

  await browser.close();
  fs.rmSync(PROFILE, { recursive: true, force: true });
  console.log(`\n${pass}/${pass + fail} PWA checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
