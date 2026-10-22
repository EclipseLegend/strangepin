// Loads the app through a server that applies _headers and collects CSP
// (Report-Only) violations per page. Start: node scripts/dev-headers-server.js . 8093
const puppeteer = require('puppeteer-core');
const guard = require('./lib/prod-guard');
const BASE = process.env.BASE || 'http://localhost:8093';
const PNG = require('fs').readFileSync(__dirname + '/../icon-192.png');
const routes = ['/?nosw=1&emulator=1#home', '/?nosw=1&emulator=1#map', '/?nosw=1&emulator=1&basemap=osm-dark#map', '/?nosw=1&emulator=1#detail/001', '/?nosw=1&emulator=1#submit', '/?nosw=1&emulator=1#leaderboard', '/offline.html'];
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: [...guard.chromeArgs(), '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let total = 0, hdr = 0; const all = [];
  for (const r of routes) {
    const pg = await b.newPage(); guard.watch(pg);
    await pg.evaluateOnNewDocument(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.effectiveDirective} ${e.blockedURI}`)); });
    await pg.setRequestInterception(true);
    // Firebase back ends and the plain-http translate script are aborted (no real back-end traffic; port 80 hangs here).
    // OSM tiles are mocked (served locally; CSP is still evaluated) so the test sends no automated traffic to tile.openstreetmap.org.
    pg.on('request', q => /^http:\/\/translate\.google|^https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com/.test(q.url()) ? q.abort()
      : /^https:\/\/tile\.openstreetmap\.org\//.test(q.url()) ? q.respond({ status: 200, contentType: 'image/png', body: PNG }) : q.continue());
    const resp = await pg.goto(BASE + r, { waitUntil: 'domcontentloaded' });
    if (resp.headers()['content-security-policy-report-only']) hdr++;
    await new Promise(res => setTimeout(res, r.includes('map') ? 7000 : 3000));
    // ?emulator=1 (test-only) connects to the local emulators, which the production CSP does
    // not list: those reports are test artefacts and are not counted.
    const v = [...new Set(await pg.evaluate(() => window.__csp))].filter(x => !/127\.0\.0\.1:(8085|9099)/.test(x));
    total += v.length; all.push(...v.map(x => `${r}: ${x}`));
    console.log(`${r.padEnd(42)} violations=${v.length}${v.length ? '\n    ' + v.join('\n    ') : ''}`);
    await pg.close();
  }
  // Language switch on #submit (Google Translate is lazy-loaded on use).
  // Translate builds its beacon URLs protocol-relative, so on this http test origin they are
  // http:// and violate img-src https: (would be https:// on the https production origin):
  // reported as informational, not counted. A redirect to google.com/sorry (rate limiting)
  // makes the run inconclusive and is reported as such.
  {
    const pg = await b.newPage(); guard.watch(pg); let sorry = false;
    await pg.evaluateOnNewDocument(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.effectiveDirective} ${e.blockedURI}`)); });
    await pg.setRequestInterception(true);
    pg.on('request', q => /^https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com/.test(q.url()) ? q.abort() : q.continue());
    pg.on('response', x => { if (/google\.com\/sorry/.test(x.url()) || x.headers().location?.includes('/sorry')) sorry = true; });
    await pg.goto(BASE + '/?nosw=1&emulator=1#submit', { waitUntil: 'load' });
    await Promise.all([pg.waitForNavigation({ timeout: 30000 }).catch(() => null), pg.evaluate(() => translatePage('es', '🇪🇸', 'Español'))]);
    await new Promise(res => setTimeout(res, 8000));
    const st = await pg.evaluate(() => ({ cls: document.documentElement.className, lang: document.documentElement.lang }));
    const v = [...new Set(await pg.evaluate(() => window.__csp))];
    const info = v.filter(x => /^img-src http:\/\/translate\.google\.com\//.test(x)), real = v.filter(x => !info.includes(x));
    total += real.length;
    console.log(`${'#submit → Español (Translate)'.padEnd(42)} violations=${real.length} translated=${/translated/.test(st.cls) && st.lang === 'es'}${sorry ? ' INCONCLUSIVE (google.com/sorry rate limit)' : ''}` +
      (real.length ? '\n    ' + real.join('\n    ') : '') + (info.length ? '\n    (info, http test origin only) ' + info.join('\n    ') : ''));
    await pg.close();
  }
  await b.close();
  console.log(`\nCSP-Report-Only header present on ${hdr}/${routes.length} responses; ${total} unique violation(s) total`);
  console.log(guard.summary());
  if (guard.hits().length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
