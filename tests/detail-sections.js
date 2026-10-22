// Detail page Timeline/Sources: rendering, escaping and link attributes.
// Requires a static server on http://localhost:8080 serving the repo root.
const puppeteer = require('puppeteer-core');
const guard = require('./lib/prod-guard');
const BASE = process.env.BASE || 'http://localhost:8080';
let pass = 0, fail = 0;
const check = (ok, n, x) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} - ${n}${x ? ' ' + x : ''}`); };
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: [...guard.chromeArgs(), '--no-sandbox'] });
  const pg = await b.newPage(); guard.watch(pg);
  const errors = [];
  pg.on('pageerror', e => errors.push(e.message));
  pg.on('dialog', d => { errors.push('dialog: ' + d.message()); d.dismiss(); });
  await pg.setRequestInterception(true);
  pg.on('request', r => /^http:\/\/translate\.google|^https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com|basemaps\.cartocdn/.test(r.url()) ? r.abort() : r.continue());
  await pg.goto(BASE + '/?nosw=1&emulator=1#detail/001', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2500));
  const s1 = await pg.evaluate(() => {
    const tl = document.querySelector('[data-section="timeline"]');
    const src = document.querySelector('[data-section="sources"]');
    const links = src ? [...src.querySelectorAll('a')].map(a => ({ href: a.href, rel: a.rel, target: a.target })) : [];
    return { tl: tl ? tl.querySelectorAll('li').length : 0, src: src ? src.querySelectorAll('li').length : 0, links,
      expectTl: currentDetail.timeline.length, expectSrc: currentDetail.sources.length };
  });
  check(s1.tl > 0 && s1.tl === s1.expectTl, 'featured pin 001: timeline renders all entries', `${s1.tl}/${s1.expectTl}`);
  check(s1.src > 0 && s1.src === s1.expectSrc, 'featured pin 001: sources render all entries', `${s1.src}/${s1.expectSrc}`);
  check(s1.links.length >= 1 && s1.links.every(l => l.rel === 'noopener nofollow' && l.target === '_blank' && l.href.startsWith('https://')),
    'source links are https, target=_blank, rel="noopener nofollow"', JSON.stringify(s1.links));

  // Short pin with empty arrays renders nothing.
  const s2 = await pg.evaluate(() => {
    const loc = LOCATIONS.find(l => !l.featured && (!l.timeline || !l.timeline.length));
    currentDetail = loc; renderPage();
    return { id: loc.id, tl: !!document.querySelector('[data-section="timeline"]'), src: !!document.querySelector('[data-section="sources"]') };
  });
  await new Promise(r => setTimeout(r, 300));
  check(!s2.tl && !s2.src, 'short pin with empty arrays: no Timeline/Sources sections', JSON.stringify(s2));

  // Hostile data: must be inert text; javascript:/http: URLs must not become links.
  const s3 = await pg.evaluate(() => {
    window.__xss = 0;
    const loc = Object.assign({}, LOCATIONS[0], {
      timeline: [{ date: '<img src=x onerror="window.__xss++">', event: '<script>window.__xss++</script><b>bold</b>' }, { date: '1', event: '' }],
      sources: [
        { type: '<i>t</i>', title: '<img src=x onerror="window.__xss++">', url: 'javascript:window.__xss++' },
        { type: 'Web', title: 'plain http', url: 'http://example.com/' },
        { type: 'Web', title: 'quote "breakout', url: 'https://example.com/a"onmouseover="window.__xss++' },
      ],
    });
    currentDetail = loc; renderPage();
    const tl = document.querySelector('[data-section="timeline"]');
    const src = document.querySelector('[data-section="sources"]');
    return {
      tlItems: tl.querySelectorAll('li').length,
      injected: (tl.querySelectorAll('img,script,b').length + src.querySelectorAll('img,i').length),
      links: [...src.querySelectorAll('a')].map(a => ({ href: a.getAttribute('href'), attrs: a.getAttributeNames() })),
      tlText: tl.textContent.includes('<script>'),
    };
  });
  await new Promise(r => setTimeout(r, 500));
  const xss = await pg.evaluate(() => window.__xss);
  check(s3.injected === 0 && s3.tlText, 'hostile markup rendered as text (no injected elements)', JSON.stringify(s3));
  check(s3.tlItems === 1, 'timeline entry without event text skipped');
  check(s3.links.length === 1 && s3.links[0].attrs.sort().join() === 'href,rel,style,target', 'only the https URL became a link; no attribute breakout', JSON.stringify(s3.links));
  check(xss === 0, 'no script executed', `__xss=${xss}`);
  check(errors.length === 0, 'no page errors or dialogs', errors.join(' | '));
  check(guard.hits().length === 0, guard.summary());
  await b.close();
  console.log(`\n${pass}/${pass + fail} detail-section checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
