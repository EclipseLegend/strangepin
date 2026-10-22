// Runtime check of the ORIGINAL client (main 728e8f5): does it initialise Firebase at all?
// Serve a checkout of main on http://127.0.0.1:8301 (e.g. git worktree + python3 -m http.server).
// ALL Google/Firebase back-end requests are aborted (never reach production); they are only
// counted. Usage: OLD_BASE=http://127.0.0.1:8301 node tests/compat-old-client.js
const puppeteer = require('puppeteer-core');
const BASE = process.env.OLD_BASE || 'http://127.0.0.1:8301';
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const res = {};
  for (const route of ['#home', '#detail/001', '#leaderboard']) {
    const pg = await b.newPage(); const errors = []; const backend = [];
    pg.on('pageerror', e => errors.push(e.message));
    await pg.setRequestInterception(true);
    pg.on('request', q => {
      const u = q.url();
      if (/(firestore|identitytoolkit|securetoken|www)\.googleapis\.com|firebaseapp\.com|apis\.google\.com|accounts\.google\.com/.test(u)) { backend.push(u.split('?')[0]); return q.abort(); }
      if (/^http:\/\/translate\.google/.test(u)) return q.abort(); // protocol-relative URL on http hangs here
      q.continue();
    });
    await pg.goto(BASE + '/' + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 4000));
    const st = await pg.evaluate(() => ({ firebaseGlobal: typeof window.firebase, apps: window.firebase && window.firebase.apps ? window.firebase.apps.length : 0, db: !!window._db, signIn: typeof window.fbSignIn }));
    res[route] = { ...st, backendRequests: backend.length, errors: [...new Set(errors)].slice(0, 3) };
    console.log(route.padEnd(14), JSON.stringify(res[route]));
    await pg.close();
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
