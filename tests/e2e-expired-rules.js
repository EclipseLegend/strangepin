// AUDIT (2026-10-22): the PR #1 UI against the Auth + Firestore EMULATORS loaded with the
// OWNER-REPORTED expired production rules (tests/fixtures/rules-prod-expired.rules).
// Shows what users would experience if PR #1 were deployed WITHOUT a rules change.
// Emulator only (project demo-strangepin, ?emulator=1 on localhost). Every production
// Firebase / Google back-end host is made unresolvable in Chrome AND aborted by request
// interception; the test fails if a single request to one of them is even attempted.
//   firebase emulators:exec --config firebase.audit-expired.json --only auth,firestore \
//     --project demo-strangepin "node tests/e2e-expired-rules.js"   (static server on :8080)
'use strict';
const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE_URL || 'http://localhost:8080/';
const PROD_HOSTS = ['firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com', 'firebase.googleapis.com', 'firebasestorage.googleapis.com',
  'strangepin-4e538.firebaseapp.com', 'strangepin-4e538.web.app', 'demo-strangepin.firebaseapp.com',
  'apis.google.com', 'accounts.google.com', 'api.emailjs.com', 'api.cloudinary.com'];
const PROD_RE = /^https?:\/\/([^/]*\.)?(googleapis\.com|firebaseapp\.com|web\.app|firebaseio\.com|apis\.google\.com|accounts\.google\.com|api\.emailjs\.com|api\.cloudinary\.com)(:\d+)?\//;
const ALLOWED_GOOGLE = /^https:\/\/(translate|translate-pa)\.googleapis\.com\//; // never reached in this test anyway
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (detail ? ' :: ' + detail : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EMU = 'http://127.0.0.1:8085/v1/projects/demo-strangepin/databases/(default)/documents';
// Admin read of the emulator (bypasses rules; "Bearer owner" is the emulator's admin token).
async function emuList(pathSuffix) {
  const r = await fetch(`${EMU}/${pathSuffix}`, { headers: { Authorization: 'Bearer owner' } });
  if (!r.ok) throw new Error('emulator admin list failed: ' + r.status);
  const j = await r.json(); return (j.documents || []).length;
}

(async () => {
  // Start from an empty emulator database (other suites may have left seed data).
  await fetch('http://127.0.0.1:8085/emulator/v1/projects/demo-strangepin/databases/(default)/documents', { method: 'DELETE' });
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--host-resolver-rules=' + PROD_HOSTS.map(h => `MAP ${h} ~NOTFOUND`).join(', ')] });
  const prodHits = [], consoleMsgs = [], pageErrors = [];
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  p.on('pageerror', e => pageErrors.push(e.message));
  p.on('console', m => { if (['error', 'warn', 'warning'].includes(m.type())) consoleMsgs.push(m.type() + ': ' + m.text()); });
  p.on('dialog', d => { consoleMsgs.push('dialog: ' + d.message()); d.dismiss(); });
  await p.setRequestInterception(true);
  p.on('request', r => { const u = r.url(); if (PROD_RE.test(u) && !ALLOWED_GOOGLE.test(u)) { prodHits.push(u); r.abort(); } else r.continue(); });

  await p.goto(BASE + '?emulator=1#detail/001', { waitUntil: 'load' });
  await p.waitForFunction(() => window._db && window._spEmulator, { timeout: 15000 });
  check('emulator mode active (project demo-strangepin)', await p.evaluate(() => firebase.app().options.projectId === 'demo-strangepin'));

  // 1. Sign-in: Firebase Auth is independent of Firestore rules.
  await p.evaluate(async () => {
    const token = JSON.stringify({ sub: 'alice', email: 'alice@example.com', email_verified: true, name: 'Alice' });
    await firebase.auth().signInWithCredential(firebase.auth.GoogleAuthProvider.credential(token));
  });
  await p.waitForFunction(() => window.currentUser && window.currentUser.uid, { timeout: 15000 });
  await sleep(800);
  const st = await p.evaluate(() => ({ authUser: !!firebase.auth().currentUser, spData: window.currentUser.spData, nav: (document.getElementById('authBtn') || {}).textContent.trim(), info: (document.getElementById('authInfo') || {}).textContent.replace(/\s+/g, ' ').trim() }));
  check('Google sign-in itself succeeds (Auth emulator) under expired Firestore rules', st.authUser && st.nav === 'Sign Out', st.nav);
  check('user profile creation fails silently -> spData is empty, nav shows 0 pts', JSON.stringify(st.spData) === '{}' && /0 pts/.test(st.info), JSON.stringify(st.spData) + ' / ' + st.info);
  check('no users/{uid} document was created', (await emuList('users')) === 0);
  check('no publicProfiles/{uid} document was created', (await emuList('publicProfiles')) === 0);

  // 2. Comments
  await p.evaluate(() => showPage('detail', LOCATIONS[0]));
  await sleep(1000);
  await p.type('#commentInput', 'Hello from an expired-rules world');
  await p.evaluate(() => submitComment('001'));
  await sleep(1500);
  const cm = await p.evaluate(() => ({ list: (document.getElementById('commentsList') || {}).textContent.replace(/\s+/g, ' ').trim(), input: document.getElementById('commentInput').value, disabled: document.getElementById('commentInput').disabled }));
  check('comment is NOT stored', (await emuList('pins/001/comments')) === 0);
  console.log('     UI after comment attempt: list="' + cm.list.slice(0, 80) + '", input="' + cm.input + '", disabled=' + cm.disabled + ' (typed text is cleared and no error is shown)');
  check('comment UI shows no user-facing error; typed text is lost', cm.input === '' && !/denied|error|fail/i.test(cm.list), cm.list.slice(0, 60));

  // 3. Reactions (optimistic local state only)
  await p.evaluate(() => toggleReaction('001', 'creepy'));
  await sleep(1200);
  const rx = await p.evaluate(() => ({ local: JSON.parse(localStorage.getItem('sp_reactions') || '{}')['001'], ui: (document.getElementById('reactionsBar') || {}).innerHTML }));
  check('reaction is NOT stored in Firestore', (await emuList('pins/001/reactions')) === 0);
  check('reaction kept only in localStorage; button highlighted, no count', rx.local === 'creepy' && /reaction-btn active/.test(rx.ui) && !/reaction-count/.test(rx.ui), rx.local);

  // 4. Save pin (local only)
  await p.evaluate(() => toggleSave('001'));
  await sleep(800);
  const myUid = await p.evaluate(() => window.currentUser.uid);
  check('saved pin is NOT stored in Firestore (localStorage only)', (await emuList('users/' + myUid + '/saved')) === 0 && await p.evaluate(() => JSON.parse(localStorage.getItem('sp_saved') || '[]').includes('001')));

  // 5. Points (called after a successful EmailJS submission in the real flow)
  const award = await p.evaluate(() => window.fbAddPoints(window.currentUser.uid, ['pin', 'photo']).then(() => 'ok', e => e.code || String(e)));
  check('points award is rejected (submission flow catches it and still shows success)', award !== 'ok', award);

  // 6. Leaderboard
  await p.evaluate(() => showPage('leaderboard'));
  await sleep(2500);
  const lb = await p.evaluate(() => (document.getElementById('lbRows') || {}).textContent.replace(/\s+/g, ' ').trim());
  console.log('     leaderboard shows: "' + lb.slice(0, 80) + '"');
  check('leaderboard read is denied -> stays on "Loading live rankings..." forever', /Loading live rankings/.test(lb), lb.slice(0, 60));

  // 7. Signed-out home page
  const ctx2 = await browser.createBrowserContext();
  const h = await ctx2.newPage();
  h.on('pageerror', e => pageErrors.push(e.message));
  await h.setRequestInterception(true);
  h.on('request', r => { const u = r.url(); if (PROD_RE.test(u) && !ALLOWED_GOOGLE.test(u)) { prodHits.push(u); r.abort(); } else r.continue(); });
  await h.goto(BASE + '?emulator=1', { waitUntil: 'load' });
  await h.waitForFunction(() => window._db && window._spEmulator, { timeout: 15000 });
  await sleep(2500);
  const home = await h.evaluate(() => ({ pins: (document.getElementById('statPins') || {}).textContent, pinners: (document.getElementById('statPinners') || {}).textContent }));
  console.log('     home stats: pins=' + home.pins + ' pinners=' + home.pinners);
  check('home stats fall back to the static values (99 pins, "—" explorers)', home.pins === '99' && home.pinners === '—', JSON.stringify(home));

  check('no uncaught page errors (failures are caught and logged)', pageErrors.length === 0, pageErrors.join(' | '));
  const denials = consoleMsgs.filter(m => /permission|insufficient/i.test(m));
  console.log('     console errors/warnings mentioning permissions: ' + denials.length);
  denials.slice(0, 8).forEach(m => console.log('       ' + m.slice(0, 160)));
  check('ZERO requests to production Firebase/Google/EmailJS/Cloudinary hosts', prodHits.length === 0, prodHits.slice(0, 3).join(' '));

  await browser.close();
  const failed = results.filter(x => !x).length;
  console.log(`\n${results.length - failed}/${results.length} expired-rules e2e checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
