// Shared, robust sign-in for headless-browser tests that use the local Auth EMULATOR
// (project demo-strangepin, page opened with ?emulator=1 on localhost). Test plumbing only.
//
// Why: CI runs 39760014182 and 39762965281 each failed once with auth/network-request-failed
// on the browser -> Auth emulator fetch (accounts:signInWithIdp / accounts:lookup) during the
// first sign-in on a freshly loaded page. The page's JS context survived (the error came back
// from page.evaluate; a reload or cross-document navigation would have destroyed the context),
// and it was not reproducible locally (hundreds of fresh-page sign-ins). So:
//   1. emuSignIn() waits until the document has loaded, emulator mode is on, and Auth has
//      finished initialising (first onAuthStateChanged) before signing in;
//   2. it retries ONLY on auth/network-request-failed, max 3 attempts, with backoff
//      (1 s, 2 s); any other error fails immediately;
//   3. watchAuthEmulator() logs every failed request to the Auth emulator with Chrome's
//      error text, and any main-frame navigation during a sign-in, so a recurrence in CI
//      names its cause.
// Retrying is safe: a Google-credential sign-in on the emulator is idempotent (same sub ->
// same uid), so a sign-in whose response was lost signs in to the same account.
'use strict';
const AUTH_EMU = 'http://127.0.0.1:9099/'; // must match firebase*.json and index.html (auth.useEmulator)
const MAX_ATTEMPTS = 3;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function watchAuthEmulator(page, log = console.log) {
  if (page.__spAuthWatch) return page;
  page.__spAuthWatch = { signingIn: false, navigations: [] };
  page.on('requestfailed', r => {
    if (!r.url().startsWith(AUTH_EMU)) return;
    log(`  (auth emulator request failed: ${r.method()} ${r.url().replace(/\?.*$/, '')} :: ${(r.failure() || {}).errorText || '?'})`);
  });
  page.on('framenavigated', f => {
    if (f === page.mainFrame() && page.__spAuthWatch.signingIn) page.__spAuthWatch.navigations.push(f.url());
  });
  return page;
}

/** Sign in with a fake Google credential on the Auth emulator. Resolves to { uid, attempts }. */
async function emuSignIn(page, claims, { log = console.log } = {}) {
  watchAuthEmulator(page, log);
  await page.waitForFunction(() => document.readyState === 'complete' && window._spEmulator && window.firebase && firebase.apps.length > 0, { timeout: 15000 });
  for (let attempt = 1; ; attempt++) {
    page.__spAuthWatch.signingIn = true;
    page.__spAuthWatch.navigations = [];
    let r;
    try {
      r = await page.evaluate(async c => {
        const auth = firebase.auth();
        await new Promise(res => { const off = auth.onAuthStateChanged(() => { off(); res(); }); });
        try {
          const cred = await auth.signInWithCredential(firebase.auth.GoogleAuthProvider.credential(JSON.stringify(c)));
          return { ok: true, uid: cred.user.uid };
        } catch (e) {
          return { ok: false, code: e && e.code, detail: String((e && e.customData && e.customData.message) || (e && e.message) || e) };
        }
      }, claims);
    } finally {
      page.__spAuthWatch.signingIn = false;
    }
    const nav = page.__spAuthWatch.navigations;
    if (nav.length) log(`  (main-frame navigation during sign-in: ${nav.join(' , ')})`);
    if (r.ok) {
      if (attempt > 1) log(`  (emulator sign-in for ${claims.sub} succeeded on attempt ${attempt})`);
      return { uid: r.uid, attempts: attempt };
    }
    log(`  (emulator sign-in attempt ${attempt}/${MAX_ATTEMPTS} for ${claims.sub} failed: ${r.code} :: ${r.detail})`);
    if (r.code !== 'auth/network-request-failed' || attempt >= MAX_ATTEMPTS)
      throw new Error(`emulator sign-in failed after ${attempt} attempt(s): ${r.code} :: ${r.detail}`);
    await sleep(1000 * attempt);
  }
}

/**
 * Real UI sign-in through the Auth emulator's Google popup: click `buttonSelector` on `page`,
 * choose "Add new account" -> auto-generate -> sign in in the emulator's handler popup, and wait
 * for the app to show the signed-in user. Same retry policy as emuSignIn(): retried only when
 * the app reports auth/network-request-failed (it logs "Sign in error: <code>").
 */
async function emuPopupSignIn(ctx, page, { buttonSelector = '#authBtn', log = console.log } = {}) {
  watchAuthEmulator(page, log);
  await page.waitForFunction(() => document.readyState === 'complete' && window._spEmulator && window.firebase && firebase.apps.length > 0, { timeout: 15000 });
  await page.evaluate(() => new Promise(res => { const off = firebase.auth().onAuthStateChanged(() => { off(); res(); }); }));
  for (let attempt = 1; ; attempt++) {
    const errors = [];
    const onConsole = m => { const t = m.text(); if (m.type() === 'error' && /Sign in error/.test(t)) errors.push(t); };
    page.on('console', onConsole);
    try {
      const popupTarget = ctx.waitForTarget(t => t.type() === 'page' && /127\.0\.0\.1:9099\/emulator\/auth\/handler/.test(t.url()), { timeout: 15000 });
      await page.click(buttonSelector);
      const pop = await (await popupTarget).page();
      await pop.waitForFunction(() => [...document.querySelectorAll('button')].some(x => /Add new account/.test(x.textContent)), { timeout: 15000, polling: 200 });
      await pop.evaluate(() => [...document.querySelectorAll('button')].find(x => /Add new account/.test(x.textContent)).click());
      await sleep(1000);
      await pop.evaluate(() => document.getElementById('autogen-button').click());
      await sleep(500);
      await pop.evaluate(() => document.getElementById('sign-in').click());
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        if (await page.evaluate(() => !!(window.currentUser && window.currentUser.nickname))) {
          if (attempt > 1) log(`  (emulator popup sign-in succeeded on attempt ${attempt})`);
          return { attempts: attempt };
        }
        if (errors.length) break;
        await sleep(200);
      }
    } finally {
      page.off('console', onConsole);
    }
    if (!errors.length) {
      const st = await page.evaluate(() => ({ authUser: !!(firebase.auth().currentUser), appUser: !!window.currentUser, nickname: !!(window.currentUser && window.currentUser.nickname) })).catch(e => String(e));
      const open = (await ctx.pages()).map(pg => pg.url().replace(/\?.*$/, ''));
      log(`  (popup sign-in state: ${JSON.stringify(st)}; open pages: ${open.join(' , ')})`);
    }
    // Close any emulator handler popup left open so the next attempt gets a fresh one.
    for (const pg of await ctx.pages()) if (/127\.0\.0\.1:9099\/emulator\/auth\/handler/.test(pg.url())) await pg.close().catch(() => {});
    const err = errors.join(' | ') || 'timed out waiting for the signed-in user';
    log(`  (emulator popup sign-in attempt ${attempt}/${MAX_ATTEMPTS} failed: ${err})`);
    if (!/auth\/network-request-failed/.test(err) || attempt >= MAX_ATTEMPTS)
      throw new Error(`emulator popup sign-in failed after ${attempt} attempt(s): ${err}`);
    await sleep(1000 * attempt);
  }
}

module.exports = { AUTH_EMU, emuSignIn, emuPopupSignIn, watchAuthEmulator };
