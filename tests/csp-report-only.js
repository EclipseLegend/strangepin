// Loads the app through a server that applies _headers and collects CSP
// (Report-Only) violations per page. Start: node scripts/dev-headers-server.js . 8093
const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://localhost:8093';
const routes = ['/?nosw=1#home', '/?nosw=1#map', '/?nosw=1&basemap=openfreemap-dark#map', '/?nosw=1#detail/001', '/?nosw=1#submit', '/?nosw=1#leaderboard', '/offline.html'];
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let total = 0, hdr = 0; const all = [];
  for (const r of routes) {
    const pg = await b.newPage();
    await pg.evaluateOnNewDocument(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.effectiveDirective} ${e.blockedURI}`)); });
    await pg.setRequestInterception(true);
    // Firebase back ends and the plain-http translate script are aborted (no real back-end traffic; port 80 hangs here).
    pg.on('request', q => /^http:\/\/translate\.google|^https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com/.test(q.url()) ? q.abort() : q.continue());
    const resp = await pg.goto(BASE + r, { waitUntil: 'domcontentloaded' });
    if (resp.headers()['content-security-policy-report-only']) hdr++;
    await new Promise(res => setTimeout(res, r.includes('map') ? 7000 : 3000));
    const v = [...new Set(await pg.evaluate(() => window.__csp))];
    total += v.length; all.push(...v.map(x => `${r}: ${x}`));
    console.log(`${r.padEnd(42)} violations=${v.length}${v.length ? '\n    ' + v.join('\n    ') : ''}`);
    await pg.close();
  }
  await b.close();
  console.log(`\nCSP-Report-Only header present on ${hdr}/${routes.length} responses; ${total} unique violation(s) total`);
})().catch(e => { console.error(e); process.exit(1); });
