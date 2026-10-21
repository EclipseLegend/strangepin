// Headless browser smoke + XSS render tests for a locally served copy of the site.
// Usage:
//   python3 -m http.server 8080   (from the repo root, in another shell)
//   NODE_PATH=<dir containing puppeteer-core> CHROME_PATH=/usr/bin/google-chrome node tests/browser-smoke.js
// Network calls to Firebase back-ends, EmailJS and Cloudinary are blocked so the
// test never reads from or writes to production services.
'use strict';
const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE_URL || 'http://localhost:8080/';
// http://translate.google.com is aborted: the page uses a protocol-relative URL, which
// becomes plain http on a local http:// origin (port 80 is not reachable from the test box).
const BLOCK = /^http:\/\/translate\.google\.com|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|api\.emailjs\.com|api\.cloudinary\.com|nominatim\.openstreetmap\.org/;
const XSS = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
const results = [];
function check(name, cond, detail) { results.push({ name, ok: !!cond, detail }); console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (detail ? ' :: ' + detail : '')); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  let dialogs = 0;
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', async d => { dialogs++; await d.dismiss(); });
  await page.setRequestInterception(true);
  page.on('request', r => (BLOCK.test(r.url()) ? r.abort() : r.continue()));

  // 1. Firebase initialises without "firebase is not defined"
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await sleep(1500);
  const fb = await page.evaluate(() => ({ db: !!window._db, signIn: typeof window.fbSignIn, init: !!window._spFirebaseInitialised }));
  check('no "firebase is not defined" error', !errors.some(e => /firebase is not defined/.test(e)), errors.join(' | '));
  check('Firebase initialised (window._db, fbSignIn)', fb.db && fb.signIn === 'function' && fb.init, JSON.stringify(fb));

  // 2. Deep links
  for (const [hash, expectPage, expectId] of [['#detail/001', 'detail', '001'], ['#detail/area-51', 'detail', '001'], ['#map', 'map', null], ['#nearby', 'nearby', null], ['#detail/999', 'home', null]]) {
    const p2 = await browser.newPage();
    await p2.setRequestInterception(true);
    p2.on('request', r => (BLOCK.test(r.url()) ? r.abort() : r.continue()));
    await p2.goto(BASE + hash, { waitUntil: 'load' });
    await sleep(800);
    const st = await p2.evaluate(() => ({ page: window.currentPage, id: (typeof currentDetail !== 'undefined' && currentDetail) ? currentDetail.id : null, title: document.title }));
    check(`deep link ${hash} -> ${expectPage}`, st.page === expectPage && (!expectId || st.id === expectId), JSON.stringify(st));
    await p2.close();
  }

  // 2b. A missing SDK script (CDN outage / content blocker) must not throw
  {
    const p3 = await browser.newPage();
    const errs3 = [];
    p3.on('pageerror', e => errs3.push(e.message));
    await p3.setRequestInterception(true);
    p3.on('request', r => ((BLOCK.test(r.url()) || /firebase-firestore-compat\.js/.test(r.url())) ? r.abort() : r.continue()));
    await p3.goto(BASE, { waitUntil: 'load' });
    await sleep(1000);
    check('missing Firestore SDK degrades without uncaught errors', errs3.length === 0, errs3.join(' | '));
    await p3.close();
  }

  // 3. Featured pin timeline/sources are no longer wiped by stubs
  const tl = await page.evaluate(() => LOCATIONS.filter(l => l.timeline && l.timeline.length).length);
  check('10 featured pins keep authored timelines', tl === 10, 'count=' + tl);

  // 4. XSS payloads rendered through the real render functions are inert
  await page.evaluate(() => showPage('detail', LOCATIONS[0]));
  await sleep(800);
  await page.evaluate(xss => {
    pinComments['001'] = [{ id: "x');window.__xss=1;//", displayName: xss, text: xss, likes: xss, photoURL: 'javascript:window.__xss=1' }];
    renderCommentsList('001');
  }, XSS);
  await sleep(300);
  const c = await page.evaluate(() => { const el = document.getElementById('commentsList'); return { imgs: el.querySelectorAll('img').length, text: el.textContent, onclick: (el.querySelector('.comment-like-btn') || {}).outerHTML || '' }; });
  check('comment XSS payload rendered as text', c.imgs === 0 && c.text.includes('<img src=x'), `imgs=${c.imgs}`);
  check('comment id cannot inject into inline handler', !/__xss/.test(c.onclick), c.onclick.slice(0, 120));

  // Leaderboard rows (mock live listener)
  await page.evaluate(xss => {
    window.fbListenLeaderboard = cb => { setTimeout(() => cb([{ displayName: xss, email: 'secret@example.com', photoURL: 'javascript:window.__xss=1', points: 10, pins: 1 },
                                                            { displayName: 'Ok', photoURL: 'https://invalid.example/missing.png', points: 5, pins: 0 }]), 0); return () => {}; };
    showPage('leaderboard');
  }, XSS);
  await sleep(1200);
  const lb = await page.evaluate(() => { const el = document.getElementById('lbRows'); return el ? { html: el.innerHTML, imgs: [...el.querySelectorAll('img')].map(i => i.getAttribute('src')) , text: el.textContent } : null; });
  check('leaderboard rows: no injected <img>, https-only avatars', lb && !lb.imgs.some(s => !/^https:/.test(s || '')), JSON.stringify(lb && lb.imgs));
  check('leaderboard does not expose email local part', lb && !lb.text.includes('secret'), '');

  // Profile page with malicious auth profile
  await page.evaluate(xss => {
    window.currentUser = { uid: 'u1', displayName: xss, email: '', photoURL: 'javascript:window.__xss=1', spData: { points: 0, pins: 0 } };
    showPage('profile');
  }, XSS);
  await sleep(800);
  const prof = await page.evaluate(() => ({ imgs: document.querySelectorAll('#mainContent img[src^="javascript"], #mainContent img[src="x"]').length, hasText: document.getElementById('mainContent').textContent.includes('<img src=x') }));
  check('profile XSS payload rendered as text', prof.imgs === 0 && prof.hasText, JSON.stringify(prof));

  // Home "active pinners" + "latest pins" with a mocked Firestore
  await page.evaluate(xss => {
    const doc = d => ({ data: () => d });
    const q = name => ({ orderBy: () => q(name), limit: () => q(name), get: async () => name === 'publicProfiles'
      ? { size: 1, docs: [doc({ displayName: xss, photoURL: 'javascript:window.__xss=1', points: 3, pins: 1 })] }
      : { size: 1, docs: [doc({ name: xss, city: xss, country: 'X', category: 'UFO', submittedAt: { seconds: 1 } })] } });
    window._db = { collection: q };
    showPage('home');
  }, XSS);
  await sleep(1500);
  const home = await page.evaluate(() => ({ imgs: document.querySelectorAll('#activePinnersList img, #fbLatestPins img').length, latest: (document.getElementById('fbLatestPins') || {}).textContent || '' }));
  check('home live pinners/latest pins XSS inert', home.imgs === 0 && home.latest.includes('<img src=x'), JSON.stringify(home).slice(0, 160));

  // Avatar fallback still works for a broken https image
  const fallback = await page.evaluate(async () => {
    const box = document.createElement('div'); document.body.appendChild(box);
    box.innerHTML = avatarHtml('https://invalid.example/none.png', 'Zed', 'color:white;');
    await new Promise(r => setTimeout(r, 1500));
    const t = box.textContent; box.remove(); return t;
  });
  check('avatar onerror fallback shows initial', fallback === 'Z', JSON.stringify(fallback));

  await sleep(500);
  const xssFired = await page.evaluate(() => window.__xss || 0);
  check('no XSS payload executed and no alert dialogs', xssFired === 0 && dialogs === 0, `__xss=${xssFired} dialogs=${dialogs}`);
  check('no uncaught page errors', errors.length === 0, errors.join(' | '));

  await browser.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} browser checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
