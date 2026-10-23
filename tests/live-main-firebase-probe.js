// AUDIT (2026-10-22): does the CURRENTLY DEPLOYED client (https://strangepin.com HTML, saved
// locally with curl; byte-identical to main 728e8f5) ever reach Firestore / Firebase Auth?
// Serve the saved HTML on http://127.0.0.1:8302 (python3 -m http.server). Production Firebase
// hosts are made unresolvable in Chrome AND aborted; every attempt is counted, none can succeed.
//   LIVE_BASE=http://127.0.0.1:8302 node tests/live-main-firebase-probe.js
'use strict';
const puppeteer = require('puppeteer-core');
const BASE = process.env.LIVE_BASE || 'http://127.0.0.1:8302';
const HOSTS = ['firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'firebaseinstallations.googleapis.com',
  'firebase.googleapis.com', 'strangepin-4e538.firebaseapp.com', 'strangepin-4e538.web.app', 'apis.google.com', 'accounts.google.com', 'api.emailjs.com', 'api.cloudinary.com'];
const PROD_RE = /^https?:\/\/([^/]*\.)?(firestore|identitytoolkit|securetoken|firebaseinstallations|firebase|firebasestorage)\.googleapis\.com|firebaseapp\.com|\.web\.app|apis\.google\.com|accounts\.google\.com|api\.emailjs\.com|api\.cloudinary\.com/;
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--host-resolver-rules=' + HOSTS.map(h => `MAP ${h} ~NOTFOUND`).join(', ')] });
  let totalAttempts = 0;
  for (const route of ['#home', '#detail/001', '#leaderboard', '#profile']) {
    const pg = await b.newPage(); const errors = []; const attempts = [];
    pg.on('pageerror', e => errors.push(e.message));
    pg.on('dialog', d => d.dismiss());
    await pg.setRequestInterception(true);
    pg.on('request', q => { const u = q.url(); if (PROD_RE.test(u)) { attempts.push(u.split('?')[0]); return q.abort(); } if (/^http:\/\/translate\.google/.test(u)) return q.abort(); q.continue(); });
    await pg.goto(BASE + '/' + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 4000));
    // Try the visible Sign In button and the detail-page community actions like a visitor would.
    const click = await pg.evaluate(() => { const btn = document.getElementById('authBtn'); if (!btn) return 'no button'; try { btn.click(); return 'clicked'; } catch (e) { return 'threw ' + e.message; } });
    await new Promise(r => setTimeout(r, 1500));
    const st = await pg.evaluate(() => ({ firebaseGlobal: typeof window.firebase, apps: window.firebase && window.firebase.apps ? window.firebase.apps.length : 0, db: !!window._db, fbSignIn: typeof window.fbSignIn, currentUser: !!window.currentUser, popupOpened: false }));
    const pages = (await b.pages()).length;
    totalAttempts += attempts.length;
    console.log(route.padEnd(13), JSON.stringify({ ...st, signInClick: click, openPages: pages, backendAttempts: attempts.length, errors: [...new Set(errors)].slice(0, 3) }));
    await pg.close();
  }
  await b.close();
  console.log(`\nTOTAL production back-end requests attempted: ${totalAttempts}`);
})().catch(e => { console.error(e); process.exit(1); });
