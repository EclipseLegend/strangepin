// Chrome DevTools installability check (CDP Page.getInstallabilityErrors + Page.getAppManifest).
// Requires a static server on http://localhost:8080 serving the repo root.
// Note: Lighthouse 12 removed the PWA category, so this uses the same Chrome check that DevTools shows.
const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://localhost:8080';
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const pg = await b.newPage();
  await pg.setRequestInterception(true);
  pg.on('request', r => /^http:\/\/translate\.google|^https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com/.test(r.url()) ? r.abort() : r.continue());
  await pg.goto(BASE + '/', { waitUntil: 'load' });
  await pg.evaluate(() => navigator.serviceWorker.ready);
  await pg.reload({ waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 2000));
  const cdp = await pg.target().createCDPSession();
  const inst = await cdp.send('Page.getInstallabilityErrors');
  const man = await cdp.send('Page.getAppManifest');
  const m = JSON.parse(man.data || '{}');
  let pass = 0, fail = 0;
  const check = (ok, n, x) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} - ${n}${x ? ' ' + x : ''}`); };
  check(inst.installabilityErrors.length === 0, 'Chrome reports no installability errors', JSON.stringify(inst.installabilityErrors));
  check((man.errors || []).length === 0, 'manifest parses with no errors', JSON.stringify(man.errors));
  check(m.id === '/' && m.start_url === '/' && m.scope === '/' && m.display === 'standalone', 'id/start_url/scope/display');
  check(m.icons.some(i => i.sizes === '192x192') && m.icons.some(i => i.sizes === '512x512'), '192 and 512 icons');
  check(m.icons.some(i => i.purpose === 'maskable'), 'maskable icon declared');
  for (const i of m.icons) {
    const r = await pg.evaluate(async (src) => { const res = await fetch(src); const bl = await res.blob();
      const bm = await createImageBitmap(bl); return { ok: res.ok, type: bl.type, w: bm.width, h: bm.height }; }, i.src);
    check(r.ok && r.type === 'image/png' && `${r.w}x${r.h}` === i.sizes, `icon ${i.src} is a ${i.sizes} PNG`, JSON.stringify(r));
  }
  for (const s of m.shortcuts || []) check(/^\/#(nearby|map|submit)$/.test(s.url), `shortcut ${s.url}`);
  await b.close();
  console.log(`\n${pass}/${pass + fail} installability checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
