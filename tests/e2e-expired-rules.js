// Error handling under Firestore DENIAL: the v3 UI (pr/technical-v2) against the Auth +
// Firestore EMULATORS loaded with the OWNER-REPORTED expired production rules
// (tests/fixtures/rules-prod-expired.rules: every read and write is denied). This is also what
// users would see if the v3 client were deployed before the rules are fixed.
// Emulator only (project demo-strangepin, ?emulator=1 on localhost). Production Firebase,
// EmailJS and Cloudinary hosts are unresolvable in Chrome AND aborted by interception; every
// attempt is counted and the test asserts 0.
//   firebase emulators:exec --config firebase.audit-expired.json --only auth,firestore \
//     --project demo-strangepin "node tests/e2e-expired-rules.js"   (static server on :8080)
'use strict';
const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE_URL || 'http://localhost:8080/';
const BLOCK_HOSTS = ['firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com', 'firebase.googleapis.com', 'firebasestorage.googleapis.com', 'firebaselogging.googleapis.com',
  'strangepin-4e538.firebaseapp.com', 'strangepin-4e538.web.app', 'demo-strangepin.firebaseapp.com',
  'apis.google.com', 'accounts.google.com', 'api.emailjs.com', 'api.cloudinary.com', 'res.cloudinary.com'];
const BLOCK_RE = /^https?:\/\/([^/]*\.)?(googleapis\.com|firebaseapp\.com|web\.app|firebaseio\.com|apis\.google\.com|accounts\.google\.com|emailjs\.com|cloudinary\.com)(:\d+)?\//;
const ALLOWED_GOOGLE = /^https:\/\/(translate|translate-pa)\.googleapis\.com\//; // Google Translate widget, not Firebase
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (detail ? ' :: ' + detail : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const AUTH_EMU = 'http://127.0.0.1:9099/'; // must match firebase*.json and index.html (auth.useEmulator)
const EMU = 'http://127.0.0.1:8085/v1/projects/demo-strangepin/databases/(default)/documents';
async function emuCount(pathSuffix) {
  const r = await fetch(`${EMU}/${pathSuffix}`, { headers: { Authorization: 'Bearer owner' } });
  if (!r.ok) throw new Error('emulator admin list failed: ' + r.status);
  const j = await r.json(); return (j.documents || []).length;
}
const blockedHits = [], pageErrors = [];
async function newPage(browser) {
  const p = await (await browser.createBrowserContext()).newPage();
  p.on('pageerror', e => pageErrors.push(e.message));
  p.on('dialog', d => d.accept());
  await p.setRequestInterception(true);
  p.on('request', r => { const u = r.url(); if (BLOCK_RE.test(u) && !ALLOWED_GOOGLE.test(u)) { blockedHits.push(u); r.abort(); } else r.continue(); });
  // Diagnostics: name the network error if a request to the local Auth emulator fails.
  p.on('requestfailed', r => { if (r.url().startsWith(AUTH_EMU)) console.log('  (auth emulator request failed: ' + r.method() + ' ' + r.url().replace(/\?.*$/, '') + ' :: ' + ((r.failure() || {}).errorText || '?') + ')'); });
  return p;
}
// Sign in on the Auth emulator from the page. Waits for Auth to finish initialising first, and
// retries (max 3 attempts) ONLY on auth/network-request-failed: a transient browser -> local
// emulator transport error (seen once in CI run 39760014182, not reproducible locally). Any other
// error fails the test. This is test plumbing; the behaviour under test (Firestore denial) is
// unaffected because Auth is not restricted by Firestore rules.
async function emuSignIn(page, claims) {
  for (let attempt = 1; ; attempt++) {
    const r = await page.evaluate(async c => {
      await new Promise(res => { const off = firebase.auth().onAuthStateChanged(() => { off(); res(); }); });
      try {
        await firebase.auth().signInWithCredential(firebase.auth.GoogleAuthProvider.credential(JSON.stringify(c)));
        return { ok: true };
      } catch (e) {
        return { ok: false, code: e && e.code, detail: String((e && e.customData && e.customData.message) || (e && e.message) || e) };
      }
    }, claims);
    if (r.ok) return attempt;
    console.log(`  (emulator sign-in attempt ${attempt} failed: ${r.code} :: ${r.detail})`);
    if (r.code !== 'auth/network-request-failed' || attempt >= 3) throw new Error(`emulator sign-in failed after ${attempt} attempt(s): ${r.code} :: ${r.detail}`);
    await sleep(1000 * attempt);
  }
}
const text = (page, sel) => page.evaluate(s => { const el = document.querySelector(s); return el ? el.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
const toasts = page => page.evaluate(() => [...document.querySelectorAll('.sp-toast')].map(t => t.textContent));

(async () => {
  await fetch('http://127.0.0.1:8085/emulator/v1/projects/demo-strangepin/databases/(default)/documents', { method: 'DELETE' });
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--host-resolver-rules=' + BLOCK_HOSTS.map(h => `MAP ${h} ~NOTFOUND`).join(', ')] });
  const p = await newPage(browser);
  await p.goto(BASE + '?emulator=1#detail/001', { waitUntil: 'load' });
  await p.waitForFunction(() => window._db && window._spEmulator, { timeout: 15000 });
  check('emulator mode active (project demo-strangepin)', await p.evaluate(() => firebase.app().options.projectId === 'demo-strangepin'));

  // 1. Sign-in works (Auth), profile load is denied → visible notice, nothing written.
  const attempts = await emuSignIn(p, { sub: 'alice', email: 'alice@example.com', email_verified: true, name: 'Alice' });
  if (attempts > 1) console.log(`  (emulator sign-in needed ${attempts} attempts)`);
  await p.waitForFunction(() => window.currentUser && window.currentUser.uid && window._spProfileError, { timeout: 15000 });
  check('sign-in succeeds; denied profile load is reported to the user', (await text(p, '#authBtn')) === 'Sign Out' && (await toasts(p)).some(t => /profile couldn't be loaded/.test(t)), JSON.stringify(await toasts(p)));
  check('no users / publicProfiles documents were created', (await emuCount('users')) === 0 && (await emuCount('publicProfiles')) === 0);

  // 2. Comments: unavailable message for the list; a failed post keeps the text.
  await p.evaluate(() => showPage('detail', LOCATIONS[0]));
  await sleep(1500);
  check('comment list shows "Comments are unavailable right now." with a retry', /Comments are unavailable right now/.test(await text(p, '#commentsList')) && /Try again/.test(await text(p, '#commentsList')), await text(p, '#commentsList'));
  // Simulate a loaded profile so the write itself is attempted (and denied by the rules).
  await p.evaluate(() => { window.currentUser.nickname = 'Alice A'; });
  await p.type('#commentInput', 'Hello from an expired-rules world');
  await p.evaluate(() => submitComment('001'));
  await sleep(1500);
  const cm = { input: await p.evaluate(() => document.getElementById('commentInput').value), disabled: await p.evaluate(() => document.getElementById('commentInput').disabled), status: await text(p, '#commentStatus') };
  check('failed comment: error shown, typed text kept, input usable', cm.input === 'Hello from an expired-rules world' && !cm.disabled && /couldn't post your comment/i.test(cm.status) && /still in the box/.test(cm.status), JSON.stringify(cm));
  check('comment is NOT stored', (await emuCount('pins/001/comments')) === 0);

  // 3. Reaction: optimistic, then rolled back with a message.
  await p.evaluate(() => toggleReaction('001', 'creepy'));
  await sleep(1500);
  const rx = await p.evaluate(() => ({ local: JSON.parse(localStorage.getItem('sp_reactions') || '{}')['001'] || null, active: !!document.querySelector('#reactionsBar .reaction-btn.active') }));
  check('failed reaction is rolled back (no highlight, not kept locally) and explained', rx.local === null && !rx.active && (await toasts(p)).some(t => /save your reaction/.test(t)), JSON.stringify(rx));

  // 4. Save: rolled back with a message.
  await p.evaluate(() => toggleSave('001'));
  await sleep(1500);
  const sv = await p.evaluate(() => ({ local: JSON.parse(localStorage.getItem('sp_saved') || '[]').includes('001'), btn: (document.getElementById('saveBtn_001') || {}).textContent }));
  check('failed save is rolled back and explained', !sv.local && !/Saved/.test(sv.btn || '') && (await toasts(p)).some(t => /save this pin/.test(t)), JSON.stringify(sv));

  // 5. Submission: Firestore write denied → error, form kept, no e-mail sent.
  await p.evaluate(async () => { if (window.spCdnReady) await window.spCdnReady; window.__mail = []; window.emailjs = { init() {}, send: async (s, t, x) => { window.__mail.push(x); return { status: 200 }; } }; });
  await p.evaluate(() => showPage('submit'));
  await p.waitForSelector('#f_name', { timeout: 5000 });
  await p.evaluate(() => { submitLat = 38.7; submitLng = -9.1; selectCategory('UFO'); document.getElementById('f_name').value = 'Old mill'; document.getElementById('f_country').value = 'Portugal'; document.getElementById('f_story').value = 'Lights.'; document.getElementById('f_username').value = 'Alice A'; });
  await p.evaluate(() => handleSubmit());
  await sleep(2000);
  const sub = await p.evaluate(() => ({ err: (document.getElementById('submitErrors') || {}).textContent || '', name: (document.getElementById('f_name') || {}).value, success: !!document.getElementById('submitSuccess'), mails: window.__mail.length, btn: document.getElementById('submitBtn').disabled }));
  check('failed submission: error shown, answers kept, no success screen, no e-mail', /couldn't send your location/i.test(sub.err) && sub.name === 'Old mill' && !sub.success && sub.mails === 0 && !sub.btn, JSON.stringify(sub));
  check('no submissions document stored', (await emuCount('submissions')) === 0);

  // 6. Leaderboard: permission error → failure state with retry (not an endless spinner).
  await p.evaluate(() => showPage('leaderboard'));
  await sleep(2500);
  check('leaderboard read denied → failure message + Try again button', /couldn't load the rankings/i.test(await text(p, '#lbRows')) && !!(await p.$('#lbError button')), await text(p, '#lbRows'));
  // 10 s timeout when the listener never answers (e.g. hanging network).
  await p.evaluate(() => { window.__realLb = window.fbListenLeaderboard; window.fbListenLeaderboard = () => () => {}; retryLeaderboard(); });
  await sleep(4000);
  const mid = await text(p, '#lbRows');
  await sleep(7000);
  const after = await text(p, '#lbRows');
  check('leaderboard shows "Loading" before 10 s and a timeout failure state after ~10 s', /Loading live rankings/.test(mid) && /taking too long/.test(after) && !!(await p.$('#lbError button')), mid.slice(0, 40) + ' → ' + after.slice(0, 60));
  await p.evaluate(() => { window.fbListenLeaderboard = window.__realLb; });

  // 7. Profile page: submissions list failure state.
  await p.evaluate(() => showPage('profile'));
  await sleep(2000);
  check('My submissions failure state with retry', /can't be shown right now/.test(await text(p, '#mySubmissions')), await text(p, '#mySubmissions'));

  // 8. Signed-out home page: static fallback.
  const h = await newPage(browser);
  await h.goto(BASE + '?emulator=1', { waitUntil: 'load' });
  await h.waitForFunction(() => window._db && window._spEmulator, { timeout: 15000 });
  await sleep(2500);
  const home = await h.evaluate(() => ({ pins: (document.getElementById('statPins') || {}).textContent, pinners: (document.getElementById('statPinners') || {}).textContent }));
  check('home stats fall back to the static values (99 pins, "—" explorers)', home.pins === '99' && home.pinners === '—', JSON.stringify(home));

  check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
  check('ZERO requests to production Firebase / Google / EmailJS / Cloudinary hosts', blockedHits.length === 0, blockedHits.slice(0, 3).join(' '));
  await browser.close();
  const failed = results.filter(x => !x).length;
  console.log(`\n${results.length - failed}/${results.length} error-handling (expired rules) e2e checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
