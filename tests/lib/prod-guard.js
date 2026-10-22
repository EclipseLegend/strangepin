// Shared production guard for every headless-browser test.
// 1. chromeArgs(): Chrome resolves NO production Firebase / EmailJS / Cloudinary host
//    (host-resolver-rules ... ~NOTFOUND), so a request could not leave the box even if a
//    test's own interception missed it.
// 2. watch(page): counts every request the page attempts to one of those hosts.
// 3. hits(): the attempts; each test asserts the count is 0.
// Pages run with ?emulator=1 (localhost only): the app then talks to the local emulators
// (project demo-strangepin) instead of strangepin-4e538.
'use strict';
const BLOCK_HOSTS = ['firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com', 'firebase.googleapis.com', 'firebasestorage.googleapis.com', 'firebaselogging.googleapis.com',
  'strangepin-4e538.firebaseapp.com', 'strangepin-4e538.web.app', 'strangepin-4e538.firebaseio.com', 'demo-strangepin.firebaseapp.com',
  'accounts.google.com', 'api.emailjs.com', 'api.cloudinary.com', 'res.cloudinary.com'];
const BLOCK_RE = /^https?:\/\/([^/]*\.)?(firestore|identitytoolkit|securetoken|firebaseinstallations|firebase|firebasestorage|firebaselogging)\.googleapis\.com[:/]|^https?:\/\/[^/]*\.(firebaseapp\.com|web\.app|firebaseio\.com)[:/]|^https:\/\/accounts\.google\.com\/|^https?:\/\/([^/]*\.)?(emailjs\.com|cloudinary\.com)[:/]/;
const attempts = [];
const chromeArgs = () => ['--host-resolver-rules=' + BLOCK_HOSTS.map(h => `MAP ${h} ~NOTFOUND`).join(', ')];
function watch(page) { page.on('request', r => { if (BLOCK_RE.test(r.url())) attempts.push(r.url()); }); return page; }
const hits = () => attempts.slice();
const summary = () => `production Firebase/EmailJS/Cloudinary requests attempted: ${attempts.length}` + (attempts.length ? ' :: ' + attempts.slice(0, 3).join(' ') : '');
module.exports = { BLOCK_HOSTS, BLOCK_RE, chromeArgs, watch, hits, summary };
