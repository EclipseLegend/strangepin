// End-to-end test of the v3 app (pr/technical-v2) against the Firebase Local Emulator Suite
// (Auth + Firestore, project demo-strangepin, rules = firestore.rules).
// NOTHING here talks to the real project: the page runs with ?emulator=1 on localhost; every
// production Firebase, EmailJS and Cloudinary host is made unresolvable in Chrome AND aborted
// by request interception, every attempt is counted, and the test asserts the count is 0.
// (apis.google.com/js/api.js, the public gapi loader, stays allowed: the SDK needs it to open
// the sign-in popup even in emulator mode; it is a static library, not a project API.)
//
//   firebase emulators:exec --only auth,firestore --project demo-strangepin "node tests/e2e-emulator.js"
//   (static server on :8080 from the repo root)
'use strict';
const puppeteer = require('puppeteer-core');
process.env.GCLOUD_PROJECT = 'demo-strangepin';
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'demo-strangepin' });
const adb = admin.firestore();
const { review } = require('../scripts/admin-review-submission.js');
const { emuSignIn, emuPopupSignIn, watchAuthEmulator } = require('./lib/emulator-auth.js');

const BASE = process.env.BASE_URL || 'http://localhost:8080/';
const BLOCK_HOSTS = ['firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com', 'firebase.googleapis.com', 'firebasestorage.googleapis.com', 'firebaselogging.googleapis.com',
  'strangepin-4e538.firebaseapp.com', 'strangepin-4e538.web.app', 'demo-strangepin.firebaseapp.com', 'accounts.google.com',
  'api.emailjs.com', 'api.cloudinary.com', 'res.cloudinary.com'];
const BLOCK_RE = /^https?:\/\/([^/]*\.)?(firestore|identitytoolkit|securetoken|firebaseinstallations|firebase|firebasestorage|firebaselogging)\.googleapis\.com[:/]|^https?:\/\/[^/]*\.(firebaseapp\.com|web\.app|firebaseio\.com)[:/]|^https:\/\/accounts\.google\.com\/|^https?:\/\/([^/]*\.)?(emailjs\.com|cloudinary\.com)[:/]/;
const XSS = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (detail ? ' :: ' + detail : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const blockedHits = [];
const consoleErrors = [];

async function openPage(browser, hash) {
  const page = await browser.newPage();
  page._errors = [];
  page.on('pageerror', e => page._errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('dialog', d => (page._acceptDialogs ? d.accept() : d.dismiss()));
  await page.setRequestInterception(true);
  page.on('request', r => { if (BLOCK_RE.test(r.url())) { blockedHits.push(r.url()); r.abort(); } else r.continue(); });
  watchAuthEmulator(page);
  await page.goto(BASE + '?emulator=1' + hash, { waitUntil: 'load' });
  await page.waitForFunction(() => window._db && window._spEmulator, { timeout: 15000 });
  return page;
}
async function signIn(page, sub, name, email, picture) {
  await emuSignIn(page, { sub, email, email_verified: true, name, picture: picture || '' });
  await page.waitForFunction(() => window.currentUser && window.currentUser.nickname, { timeout: 15000 });
  return page.evaluate(() => window.currentUser.uid);
}
const get = async p => { const s = await adb.doc(p).get(); return s.exists ? s.data() : null; };
const text = (page, sel) => page.evaluate(s => { const el = document.querySelector(s); return el ? el.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);

(async () => {
  await fetch('http://127.0.0.1:8085/emulator/v1/projects/demo-strangepin/databases/(default)/documents', { method: 'DELETE' });
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--host-resolver-rules=' + BLOCK_HOSTS.map(h => `MAP ${h} ~NOTFOUND`).join(', ')] });

  // ── Alice: new Google user ──────────────────────────────────────────────
  // Hostile URL params (must never reach the EmailJS recipient; checked at the submission below).
  const a = await openPage(await browser.createBrowserContext(), '&to_email=attacker%40evil.example&recipient=attacker%40evil.example#detail/001');
  check('emulator mode active on localhost?emulator=1 (project demo-strangepin)', await a.evaluate(() => firebase.app().options.projectId === 'demo-strangepin'));
  check('"firebase is not defined" fixed: SDK initialised after deferred load, no page errors so far', a._errors.length === 0, a._errors.join(' | '));
  const A = await signIn(a, 'alice-google', XSS, 'alice@example.com', 'javascript:window.__xss=1');
  const aDoc = await get('users/' + A), aPub = await get('publicProfiles/' + A);
  check('sign-in creates private users doc (points 0, pins 0, schema 3)', aDoc && aDoc.points === 0 && aDoc.pins === 0 && aDoc._schemaVersion === 3 && aDoc.email === 'alice@example.com', JSON.stringify(aDoc && Object.keys(aDoc).sort()));
  check('javascript: photo URL from the auth profile is stored as empty', aDoc.photoURL === '');
  check('public profile = generated nickname + score only (no e-mail, name, photo)', aPub && JSON.stringify(Object.keys(aPub).sort()) === '["nickname","pins","points","updatedAt"]' && /^Explorer-[0-9A-Z]{4}$/.test(aPub.nickname), JSON.stringify(aPub));
  const nickA = aPub.nickname;

  // Comment via the real UI
  await a.evaluate(() => showPage('detail', LOCATIONS[0]));
  await sleep(800);
  await a.type('#commentInput', 'Spooky! ' + XSS);
  await a.click('#commentInput ~ button, button[onclick^="submitComment"]').catch(() => a.evaluate(() => submitComment('001')));
  await a.waitForFunction(() => document.querySelectorAll('#commentsList .comment-card').length > 0, { timeout: 10000 });
  const cm = await a.evaluate(() => { const el = document.getElementById('commentsList'); return { imgs: el.querySelectorAll('img').length, text: el.textContent, input: document.getElementById('commentInput').value }; });
  const stored = (await adb.collection('pins/001/comments').get()).docs.map(d => d.data());
  check('comment stored with authorName = public nickname (rules-enforced), rendered as text', stored.length === 1 && stored[0].authorName === nickA && !('displayName' in stored[0]) && cm.text.includes(nickA) && cm.imgs === 0 && cm.text.includes('<img src=x'), JSON.stringify(stored[0] && stored[0].authorName));
  check('Google name is not shown on the comment', !cm.text.includes('onerror="window.__xss'.slice(0, 0) + 'alice@') && !/alice@example/.test(cm.text));
  check('input cleared after a successful comment', cm.input === '');
  // Immediate second comment: the 15 s server-side throttle denies it → error shown, text kept.
  await a.type('#commentInput', 'Second thought');
  await a.evaluate(() => submitComment('001'));
  await sleep(1500);
  const cm2 = { input: await a.evaluate(() => document.getElementById('commentInput').value), status: await text(a, '#commentStatus') };
  check('failed comment (throttled by rules) shows an error and keeps the typed text', cm2.input === 'Second thought' && /couldn't post your comment/i.test(cm2.status) && /still in the box/.test(cm2.status), JSON.stringify(cm2));
  check('only one comment stored', (await adb.collection('pins/001/comments').get()).size === 1);

  // Reaction + save (successful path)
  await a.evaluate(() => toggleReaction('001', 'creepy'));
  await sleep(1500);
  const rx = await get('pins/001/reactions/' + A);
  const rxUi = (await text(a, '#reactionsBar')) || '';
  check('reaction saved (creepy) and count shown', rx && rx.type === 'creepy' && /Creepy\s*1/.test(rxUi), rxUi.slice(0, 80));
  await a.evaluate(() => toggleSave('001'));
  await sleep(1000);
  check('saved pin stored under users/{uid}/saved/001', !!(await get(`users/${A}/saved/001`)));

  // Client-side cheating is refused by the rules
  const cheat = await a.evaluate(() => window._db.collection('users').doc(window.currentUser.uid).update({ points: 99999 }).then(() => 'ok', e => e.code));
  check('direct points write is denied', cheat === 'permission-denied', cheat);
  check('browser has no points-award function any more (fbAddPoints removed)', await a.evaluate(() => typeof window.fbAddPoints === 'undefined'));

  // Nickname: reserved name refused client-side; direct write refused by rules; valid change works
  await a.evaluate(() => showPage('profile'));
  await a.waitForSelector('#profileNickname', { timeout: 5000 });
  await a.evaluate(() => { document.getElementById('profileNickname').value = 'StrangePin Team'; });
  await a.evaluate(() => saveNickname());
  await sleep(500);
  check('reserved nickname "StrangePin Team" refused in the UI', /reserved/i.test(await text(a, '#nicknameStatus')), await text(a, '#nicknameStatus'));
  const bypass = await a.evaluate(() => window._db.collection('publicProfiles').doc(window.currentUser.uid).update({ nickname: 'Str4nge.Pin', updatedAt: firebase.firestore.FieldValue.serverTimestamp() }).then(() => 'ok', e => e.code));
  check('reserved look-alike "Str4nge.Pin" denied by the rules (bypassing the UI)', bypass === 'permission-denied', bypass);
  await a.evaluate(() => { document.getElementById('profileNickname').value = 'Night Owl'; });
  await a.evaluate(() => saveNickname());
  await sleep(1000);
  check('valid nickname saved', (await get('publicProfiles/' + A)).nickname === 'Night Owl' && /Saved/.test(await text(a, '#nicknameStatus')));

  // Submission → pending review (EmailJS stubbed in-page: no request leaves the browser)
  await a.evaluate(async () => { if (window.spCdnReady) await window.spCdnReady; window.__mail = []; window.emailjs = { init() {}, send: async (s, t, p) => { window.__mail.push(p); return { status: 200 }; } }; });
  await a.evaluate(() => showPage('submit'));
  await a.waitForSelector('#f_name', { timeout: 5000 });
  check('submit form pre-fills the username with the public nickname', (await a.evaluate(() => document.getElementById('f_username').value)) === 'Night Owl');
  await a.evaluate(() => {
    submitLat = 38.7969; submitLng = -9.3903; selectCategory('Haunted');
    document.getElementById('f_name').value = 'Old mill';
    document.getElementById('f_country').value = 'Portugal';
    document.getElementById('f_story').value = 'Lights at night near the old mill.';
  });
  // Try to inject a recipient through the page: an extra form field, storage and globals.
  await a.evaluate(() => {
    const f = document.getElementById('f_name').form || document.getElementById('f_name').parentElement;
    for (const n of ['to_email', 'recipient']) { const i = document.createElement('input'); i.type = 'hidden'; i.name = n; i.id = 'f_' + n; i.value = 'attacker@evil.example'; f.appendChild(i); }
    localStorage.setItem('to_email', 'attacker@evil.example'); sessionStorage.setItem('to_email', 'attacker@evil.example');
    window.to_email = 'attacker@evil.example'; window.EMAILJS_TO_EMAIL = 'attacker@evil.example';
  });
  await a.evaluate(() => handleSubmit());
  await a.waitForSelector('#submitSuccess', { timeout: 10000 });
  const succ = await text(a, '#submitSuccess');
  check('success screen says "pending review" and makes no points claim', /pending review/i.test(succ) && !/\bpts\b|points|\+10|earn/i.test(succ), succ.slice(0, 160));
  const subs = (await adb.collection('submissions').where('authorUid', '==', A).get()).docs;
  const sd = subs[0] && subs[0].data();
  check('submissions/{id} stored: status pending, authorUid, no points field', subs.length === 1 && sd.status === 'pending' && !('points' in sd) && !('pointsAwarded' in sd), JSON.stringify(sd && { status: sd.status, keys: Object.keys(sd).length }));
  const mail = await a.evaluate(() => window.__mail);
  check('EmailJS notification params: to_email is the fixed StrangePin inbox, includes submission_id', mail.length === 1 && mail[0].to_email === 'thestrangepin@gmail.com' && mail[0].submission_id === subs[0].id, JSON.stringify(mail[0] && Object.keys(mail[0])));
  check('EmailJS recipient cannot be changed from the page (URL params, form field, storage, globals ignored)', mail.length === 1 && mail[0].to_email === 'thestrangepin@gmail.com' && !JSON.stringify(mail[0]).includes('attacker@evil.example') && (await a.evaluate(() => location.search)).includes('to_email=attacker'), JSON.stringify(mail[0] && mail[0].to_email));
  check('points unchanged after submitting (0)', (await get('users/' + A)).points === 0 && (await get('publicProfiles/' + A)).points === 0);
  await a.evaluate(() => showPage('profile'));
  await a.waitForSelector('.sp-submission-status', { timeout: 8000 });
  check('My submissions shows "Pending review"', (await text(a, '.sp-submission-status')) === 'Pending review', await text(a, '.sp-submission-status'));
  const selfApprove = await a.evaluate(id => window._db.collection('submissions').doc(id).update({ status: 'approved' }).then(() => 'ok', e => e.code), subs[0].id);
  check('author cannot approve own submission from the browser', selfApprove === 'permission-denied', selfApprove);

  // Owner approves with the admin script (Admin SDK → emulator) → UI reflects it
  await review(admin, adb, subs[0].id, { decision: 'approved', reviewer: 'effie', write: true });
  await a.reload({ waitUntil: 'load' });
  await a.waitForFunction(() => window.currentUser && window.currentUser.nickname, { timeout: 15000 });
  await a.evaluate(() => showPage('profile'));
  await a.waitForSelector('.sp-submission-status', { timeout: 8000 });
  const nav = await text(a, '#authInfo');
  check('after admin approval: "Approved · +10 pts" in My submissions and 10 pts in the nav', /Approved · \+10 pts/.test(await text(a, '.sp-submission-status')) && /10 pts/.test(nav), (await text(a, '.sp-submission-status')) + ' / ' + nav);

  // Account deletion request (creates a request, deletes nothing)
  a._acceptDialogs = true;
  await a.evaluate(() => requestAccountDeletion());
  await sleep(1500);
  const dr = await get('deletionRequests/' + A);
  check('deletion request stored (status requested) and confirmed in the UI; nothing deleted', dr && dr.status === 'requested' && /request was received/.test(await text(a, '#deletionArea')) && !!(await get('users/' + A)), JSON.stringify(dr && dr.status));

  // ── Legacy user: seeded doc identical in shape to the owner's ───────────
  const lctx = await browser.createBrowserContext();
  const l = await openPage(lctx, '');
  const L = await signIn(l, 'legacy-google', 'Legacy Owner Name', 'legacy.owner@gmail.example', 'https://lh3.googleusercontent.com/a/legacy');
  await l.evaluate(() => firebase.auth().signOut());
  await l.waitForFunction(() => !window.currentUser, { timeout: 5000 });
  const JOINED = admin.firestore.Timestamp.fromDate(new Date('2026-05-01T10:00:00Z'));
  const legacySeed = { points: 25, pins: 2, email: 'legacy.owner@gmail.example', displayName: 'Legacy Owner Name', joinedAt: JOINED, photoURL: 'https://lh3.googleusercontent.com/a/legacy', uid: L };
  await adb.doc('publicProfiles/' + L).delete();
  await adb.doc('users/' + L).set(legacySeed);  // replace with the legacy shape (no publicProfiles, no schema version)
  await signIn(l, 'legacy-google', 'Legacy Owner Name', 'legacy.owner@gmail.example', 'https://lh3.googleusercontent.com/a/legacy');
  await sleep(800);
  const lDoc = await get('users/' + L), lPub = await get('publicProfiles/' + L);
  const keep = k => JSON.stringify(lDoc[k]) === JSON.stringify(legacySeed[k]);
  check('legacy sign-in keeps points 25 / pins 2 / email / displayName / photoURL / joinedAt / uid', ['points', 'pins', 'email', 'displayName', 'photoURL', 'uid'].every(keep) && lDoc.joinedAt.toMillis() === JOINED.toMillis(), JSON.stringify({ points: lDoc.points, pins: lDoc.pins }));
  check('legacy doc gains only lastActive (no reset, no schema rewrite)', JSON.stringify(Object.keys(lDoc).sort()) === JSON.stringify(['displayName', 'email', 'joinedAt', 'lastActive', 'photoURL', 'pins', 'points', 'uid']), JSON.stringify(Object.keys(lDoc).sort()));
  check('legacy public profile created mirroring 25 / 2 with a generated nickname', lPub && lPub.points === 25 && lPub.pins === 2 && /^Explorer-/.test(lPub.nickname) && Object.keys(lPub).length === 4, JSON.stringify(lPub));
  check('legacy user sees 25 pts in the nav', /25 pts/.test(await text(l, '#authInfo')), await text(l, '#authInfo'));
  // Sign out and in again: nothing changes.
  await l.evaluate(() => firebase.auth().signOut());
  await l.waitForFunction(() => !window.currentUser, { timeout: 5000 });
  await signIn(l, 'legacy-google', 'Legacy Owner Name', 'legacy.owner@gmail.example');
  await sleep(800);
  const lDoc2 = await get('users/' + L), lPub2 = await get('publicProfiles/' + L);
  check('second sign-in changes nothing (points, pins, nickname)', lDoc2.points === 25 && lDoc2.pins === 2 && lPub2.points === 25 && lPub2.nickname === lPub.nickname);
  await l.evaluate(() => showPage('detail', LOCATIONS[1]));
  await sleep(800);
  await l.type('#commentInput', 'Legacy comment');
  await l.evaluate(id => submitComment(id), await l.evaluate(() => LOCATIONS[1].id));
  await sleep(1500);
  const lc = (await adb.collection(`pins/${await l.evaluate(() => LOCATIONS[1].id)}/comments`).get()).docs.map(d => d.data());
  check('legacy user can comment (as nickname)', lc.length === 1 && lc[0].authorName === lPub.nickname);

  // ── Bob ─────────────────────────────────────────────────────────────────
  const b = await openPage(await browser.createBrowserContext(), '#detail/001');
  const B = await signIn(b, 'bob-google', 'Bob Realname', 'bob@example.com');
  await b.evaluate(() => showPage('detail', LOCATIONS[0]));
  await b.waitForFunction(() => document.querySelectorAll('#commentsList .comment-like-btn').length > 0, { timeout: 10000 });
  const cid = await b.evaluate(() => (pinComments['001'][0] || {}).id);
  await b.evaluate(id => likeComment('001', id), cid);
  await sleep(800);
  await b.evaluate(id => likeComment('001', id), cid);
  await sleep(800);
  check('like twice from the same user counts once', (await get(`pins/001/comments/${cid}`)).likes === 1);
  const peek = await b.evaluate(uid => window._db.collection('users').doc(uid).get().then(() => 'readable', e => e.code), A);
  check("bob cannot read alice's private doc (email)", peek === 'permission-denied', peek);
  const edit = await b.evaluate(id => window._db.collection('pins').doc('001').collection('comments').doc(id).update({ text: 'pwned' }).then(() => 'ok', e => e.code), cid);
  check("bob cannot edit alice's comment", edit === 'permission-denied', edit);

  // Leaderboard
  await b.evaluate(() => showPage('leaderboard'));
  await b.waitForFunction(() => { const el = document.getElementById('lbRows'); return el && el.querySelectorAll('.lb-row').length >= 3; }, { timeout: 10000 });
  const lb = await b.evaluate(() => { const el = document.getElementById('lbRows'); return { imgs: el.querySelectorAll('img').length, rows: [...el.querySelectorAll('.lb-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim()) }; });
  const lbText = lb.rows.join(' | ');
  check('leaderboard: legacy user first with 25, then Night Owl with 10', lb.rows[0].includes(lPub.nickname) && /25$/.test(lb.rows[0]) && lb.rows[1].includes('Night Owl') && /10$/.test(lb.rows[1]), lbText.slice(0, 200));
  check('leaderboard shows nicknames only: no Google names, e-mails or photos', !/Legacy Owner Name|Bob Realname|@example|@gmail|<img/.test(lbText) && lb.imgs === 0, lbText.slice(0, 120));
  check('points guide shows approved-only values (no video / verified)', await b.evaluate(() => { const t = document.getElementById('mainContent').textContent; return /Approved location/.test(t) && !/Add a video|Get verified/.test(t); }));

  // ── Signed-out visitor: home stats ──────────────────────────────────────
  const c = await openPage(await browser.createBrowserContext(), '');
  await sleep(3000);
  const home = await c.evaluate(() => ({ pinners: (document.getElementById('statPinners') || {}).textContent, list: (document.getElementById('activePinnersList') || {}).textContent || '', imgs: document.querySelectorAll('#activePinnersList img').length, pins: (document.getElementById('statPins') || {}).textContent }));
  check('home stats: 3 pinners from publicProfiles', home.pinners === '3', JSON.stringify(home.pinners));
  check('home active pinners use nicknames only', home.list.includes('Night Owl') && !/Legacy Owner Name|Bob Realname/.test(home.list) && home.imgs === 0, home.list.slice(0, 120));
  const anonWrite = await c.evaluate(() => window._db.collection('pins').doc('001').collection('comments').add({ uid: 'x', authorName: 'x', text: 'spam', likes: 0, at: firebase.firestore.FieldValue.serverTimestamp() }).then(() => 'ok', e => e.code));
  check('signed-out visitor cannot comment', anonWrite === 'permission-denied', anonWrite);

  // ── Real UI sign-in via the emulator's Google popup ─────────────────────
  const dctx = await browser.createBrowserContext();
  const d = await openPage(dctx, '');
  await emuPopupSignIn(dctx, d);
  check('UI sign-in via the Google popup (Auth emulator) creates the profile and updates the nav', (await text(d, '#authBtn')) === 'Sign Out');

  // ── Global ──────────────────────────────────────────────────────────────
  const pages = [a, l, b, c, d];
  const xss = (await Promise.all(pages.map(p => p.evaluate(() => window.__xss || 0)))).reduce((x, y) => x + y, 0);
  check('no XSS payload executed in any session', xss === 0, 'count=' + xss);
  const errs = pages.flatMap(p => p._errors);
  check('no uncaught page errors (incl. "firebase is not defined")', errs.length === 0, errs.join(' | '));
  console.log('     console errors (informational): ' + consoleErrors.length + (consoleErrors.length ? ' :: ' + consoleErrors.slice(0, 5).join(' || ') : ''));
  check('ZERO requests to production Firebase / EmailJS / Cloudinary hosts', blockedHits.length === 0, blockedHits.slice(0, 3).join(' '));

  await browser.close();
  const failed = results.filter(x => !x).length;
  console.log(`\n${results.length - failed}/${results.length} emulator e2e checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
