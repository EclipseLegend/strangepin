// End-to-end test of the app against the Firebase Local Emulator Suite.
// NOTHING here talks to the real project: the page is opened with ?emulator=1 on
// localhost (dev-only switch in index.html → project "demo-strangepin"), and any
// request to real Firebase/Google back-ends is aborted and reported as a failure.
//
//   firebase emulators:start --only auth,firestore --project demo-strangepin   (repo root)
//   python3 -m http.server 8080                                                (repo root)
//   node tests/e2e-emulator.js
'use strict';
const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE_URL || 'http://localhost:8080/';
// Anchored on the host: emulator URLs embed these host names in their *path*.
const REAL_BACKEND = /^https:\/\/(firestore|identitytoolkit|securetoken|firebaseinstallations)\.googleapis\.com|^https:\/\/api\.emailjs\.com|^https:\/\/api\.cloudinary\.com|^https:\/\/nominatim\.openstreetmap\.org|^http:\/\/translate\.google\.com/;
const XSS = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (detail ? ' :: ' + detail : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function openPage(browser, hash, realHits) {
  const page = await browser.newPage();
  page._errors = [];
  page.on('pageerror', e => page._errors.push(e.message));
  page.on('dialog', d => d.dismiss());
  await page.setRequestInterception(true);
  page.on('request', r => {
    if (REAL_BACKEND.test(r.url())) { if (!/translate\.google|nominatim/.test(r.url())) realHits.push(r.url()); r.abort(); }
    else r.continue();
  });
  await page.goto(BASE + '?emulator=1' + hash, { waitUntil: 'load' });
  await page.waitForFunction(() => window._db && window._spEmulator, { timeout: 15000 });
  return page;
}
async function signIn(page, uid, name, email) {
  await page.evaluate(async (uid, name, email) => {
    const token = JSON.stringify({ sub: uid, email, email_verified: true, name, picture: 'javascript:window.__xss=1' });
    await firebase.auth().signInWithCredential(firebase.auth.GoogleAuthProvider.credential(token));
  }, uid, name, email);
  await page.waitForFunction(() => window.currentUser && window.currentUser.spData && window.currentUser.spData.uid, { timeout: 15000 });
  return page.evaluate(() => window.currentUser.uid); // the auth emulator assigns its own uid
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const realHits = [];

  // ── Alice ────────────────────────────────────────────────────────────────
  const ctxA = await browser.createBrowserContext();
  const a = await openPage(ctxA, '#detail/001', realHits);
  check('emulator mode active on localhost?emulator=1', await a.evaluate(() => firebase.app().options.projectId === 'demo-strangepin'));
  const A = await signIn(a, 'alice', XSS, 'alice@example.com');
  const aDoc = await a.evaluate(() => window.currentUser.spData);
  check('sign-in creates private user doc (points 0)', aDoc.points === 0 && aDoc.email === 'alice@example.com', JSON.stringify({ points: aDoc.points, v: aDoc._schemaVersion }));
  check('javascript: photoURL from auth profile is stored as empty', aDoc.photoURL === '', JSON.stringify(aDoc.photoURL));
  const pubA = await a.evaluate(async () => (await window._db.collection('publicProfiles').doc(window.currentUser.uid).get()).data());
  check('public profile mirror created without email', pubA && !('email' in pubA) && pubA.points === 0, JSON.stringify(pubA && Object.keys(pubA)));

  // Comment with XSS payload via the real UI
  await a.evaluate(() => showPage('detail', LOCATIONS[0]));
  await sleep(800);
  await a.type('#commentInput', 'Spooky! ' + XSS);
  await a.evaluate(() => submitComment('001'));
  await a.waitForFunction(() => document.querySelectorAll('#commentsList .comment-card').length > 0, { timeout: 10000 });
  const cm = await a.evaluate(() => { const el = document.getElementById('commentsList'); return { imgs: el.querySelectorAll('img').length, text: el.textContent }; });
  check('comment stored and rendered as text (XSS inert)', cm.imgs === 0 && cm.text.includes('<img src=x') && cm.text.includes('Spooky!'), `imgs=${cm.imgs}`);

  // Reaction
  await a.evaluate(() => toggleReaction('001', 'creepy'));
  await sleep(1200);
  const rx = await a.evaluate(async () => ({ doc: (await window._db.collection('pins').doc('001').collection('reactions').doc(window.currentUser.uid).get()).data(), ui: (document.getElementById('reactionsBar') || {}).textContent || '' }));
  check('reaction saved (type creepy) and count shown', rx.doc && rx.doc.type === 'creepy' && /Creepy\s*1/.test(rx.ui.replace(/\s+/g, ' ')), JSON.stringify(rx.doc && rx.doc.type));

  // Save pin
  await a.evaluate(() => toggleSave('001'));
  await sleep(800);
  const saved = await a.evaluate(async () => (await window._db.collection('users').doc(window.currentUser.uid).collection('saved').doc('001').get()).exists);
  check('saved pin stored under users/alice/saved/001', saved);

  // Points: combined award, then cooldown
  await a.evaluate(() => window.fbAddPoints(window.currentUser.uid, ['pin', 'photo']));
  const pts = await a.evaluate(async () => ({ priv: (await window._db.collection('users').doc(window.currentUser.uid).get()).data().points, pub: (await window._db.collection('publicProfiles').doc(window.currentUser.uid).get()).data().points }));
  check('award pin+photo = +15 mirrored to public profile', pts.priv === 15 && pts.pub === 15, JSON.stringify(pts));
  const second = await a.evaluate(() => window.fbAddPoints(window.currentUser.uid, ['pin']).then(() => 'ok', e => e.code));
  check('second award inside 30 s cooldown is rejected by rules', second === 'permission-denied', second);
  const cheat = await a.evaluate(() => window._db.collection('users').doc(window.currentUser.uid).update({ points: 99999 }).then(() => 'ok', e => e.code));
  check('direct points write (cheat) rejected', cheat === 'permission-denied', cheat);

  // ── Bob ──────────────────────────────────────────────────────────────────
  const ctxB = await browser.createBrowserContext();
  const b = await openPage(ctxB, '#detail/001', realHits);
  const B = await signIn(b, 'bob', 'Bob', 'bob@example.com');
  await b.evaluate(() => showPage('detail', LOCATIONS[0]));
  await b.waitForFunction(() => document.querySelectorAll('#commentsList .comment-like-btn').length > 0, { timeout: 10000 });
  const cid = await b.evaluate(() => (pinComments['001'][0] || {}).id);
  await b.evaluate(id => likeComment('001', id), cid);
  await sleep(800);
  await b.evaluate(id => likeComment('001', id), cid);
  await sleep(800);
  const likes = await b.evaluate(async id => (await window._db.collection('pins').doc('001').collection('comments').doc(id).get()).data().likes, cid);
  check('like twice from the same user counts once', likes === 1, 'likes=' + likes);
  const peek = await b.evaluate(uid => window._db.collection('users').doc(uid).get().then(() => 'readable', e => e.code), A);
  check("bob cannot read alice's private doc (email)", peek === 'permission-denied', peek);
  const edit = await b.evaluate(id => window._db.collection('pins').doc('001').collection('comments').doc(id).update({ text: 'pwned' }).then(() => 'ok', e => e.code), cid);
  check("bob cannot edit alice's comment", edit === 'permission-denied', edit);

  // Leaderboard (live listener on publicProfiles)
  await b.evaluate(() => showPage('leaderboard'));
  await b.waitForFunction(() => { const el = document.getElementById('lbRows'); return el && el.querySelectorAll('.lb-row').length >= 2; }, { timeout: 10000 });
  const lb = await b.evaluate(() => { const el = document.getElementById('lbRows'); return { imgs: [...el.querySelectorAll('img')].map(i => i.getAttribute('src')), text: el.textContent.replace(/\s+/g, ' ') }; });
  check('leaderboard shows alice first with escaped name, no injected img', lb.text.indexOf('<img src=x') > -1 && lb.text.indexOf('<img src=x') < lb.text.indexOf('Bob') && lb.imgs.length === 0, lb.text.slice(0, 120));
  check('leaderboard has no email addresses', !/@example\.com/.test(lb.text));

  // Home live sections for a signed-out visitor
  const ctxC = await browser.createBrowserContext();
  const c = await openPage(ctxC, '', realHits);
  await sleep(2500);
  const home = await c.evaluate(() => ({ pinners: (document.getElementById('statPinners') || {}).textContent, list: (document.getElementById('activePinnersList') || {}).textContent || '', imgs: document.querySelectorAll('#activePinnersList img').length }));
  check('signed-out home stats read publicProfiles (2 pinners)', home.pinners === '2', JSON.stringify(home.pinners));
  check('signed-out home active pinners escaped', home.list.includes('<img src=x') && home.imgs === 0);
  const anonWrite = await c.evaluate(() => window._db.collection('pins').doc('001').collection('comments').add({ uid: 'x', text: 'spam', likes: 0, displayName: '', photoURL: '', at: firebase.firestore.FieldValue.serverTimestamp() }).then(() => 'ok', e => e.code));
  check('signed-out visitor cannot comment', anonWrite === 'permission-denied', anonWrite);

  // Real UI sign-in: click "Sign In" → emulator's Google popup → auto-generated account
  const ctxD = await browser.createBrowserContext();
  const d = await openPage(ctxD, '', realHits);
  const popupTarget = ctxD.waitForTarget(t => t.type() === 'page' && /127\.0\.0\.1:9099\/emulator\/auth\/handler/.test(t.url()), { timeout: 15000 });
  await d.click('#authBtn');
  const pop = await (await popupTarget).page();
  await pop.waitForFunction(() => [...document.querySelectorAll('button')].some(x => /Add new account/.test(x.textContent)), { timeout: 15000, polling: 200 });
  // Emulator widget: "Add new account" → "Auto-generate user information" → "Sign in".
  await pop.evaluate(() => [...document.querySelectorAll('button')].find(x => /Add new account/.test(x.textContent)).click());
  await sleep(1000);
  await pop.evaluate(() => document.getElementById('autogen-button').click());
  await sleep(500);
  await pop.evaluate(() => document.getElementById('sign-in').click());
  await d.waitForFunction(() => window.currentUser && window.currentUser.spData && window.currentUser.spData.uid, { timeout: 15000 });
  const nav = await d.evaluate(() => (document.getElementById('authBtn') || {}).textContent.trim());
  check('UI sign-in via Google popup (emulator widget) creates profile and updates nav', nav === 'Sign Out', nav);

  // Global
  const xss = (await Promise.all([a, b, c, d].map(p => p.evaluate(() => window.__xss || 0)))).reduce((x, y) => x + y, 0);
  check('no XSS payload executed in any session', xss === 0, 'count=' + xss);
  const errs = [a, b, c, d].flatMap(p => p._errors);
  check('no uncaught page errors', errs.length === 0, errs.join(' | '));
  check('zero requests to real Firebase/Google back-ends', realHits.length === 0, realHits.slice(0, 3).join(' '));

  await browser.close();
  const failed = results.filter(x => !x).length;
  console.log(`\n${results.length - failed}/${results.length} emulator e2e checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
