# Tests

Local-only checks; nothing here talks to production Firebase, EmailJS or Cloudinary.

| File | What it checks | How to run |
|---|---|---|
| `helpers.test.js` | `escapeHtml`, `safeHttpsUrl`, `avatarInitial`, `safeDocId`, `avatarHtml`, `truncateAtWord`, `previewText`; nickname rules (reserved names, shape), client = `scripts/lib/nickname.js`, default nickname, photo type/size checks, friendly errors | `node tests/helpers.test.js` |
| `browser-smoke.js` | Firebase initialises (no `firebase is not defined`), deep links (`#detail/001`, `#detail/area-51`, `#map`, `#nearby`), featured timelines present, XSS payloads rendered through the real render functions (comments, leaderboard, profile, home live sections) stay inert, avatar fallback works | `python3 -m http.server 8080` in the repo root, then `npm i --no-save puppeteer-core` and `CHROME_PATH=/path/to/chrome node tests/browser-smoke.js` |

Every browser test uses `tests/lib/prod-guard.js`: production Firebase, EmailJS and
Cloudinary hosts are unresolvable in Chrome (`--host-resolver-rules`), every attempted request
to them is counted, and the test asserts the count is 0. Pages run with `?emulator=1`
(localhost only → project `demo-strangepin`); the PWA tests, where the service worker is
disabled in emulator mode, stub the Firebase SDK script instead.

Tests that sign in to the Auth emulator (`e2e-emulator.js`, `e2e-expired-rules.js`) use
`tests/lib/emulator-auth.js`: `emuSignIn()` (fake Google credential) and `emuPopupSignIn()`
(the emulator's real popup) wait for the page load and Auth initialisation, retry ONLY on
`auth/network-request-failed` (max 3 attempts, 1 s / 2 s backoff; any other error fails), and
log every failed request to the Auth emulator with Chrome's error text plus any main-frame
navigation during a sign-in. This covers a rare browser → emulator transport error seen in CI.
`emuPopupSignIn()` waits for the emulator popup's own script (loaded after a blocking unpkg
CDN script) and for each popup state before clicking, instead of fixed sleeps.

## Phase 2 tests

| File | What it checks | How to run |
|---|---|---|
| `rules.test.js` | `firestore.rules` v3 (see the v3 section below) | `firebase emulators:exec --only firestore --project demo-strangepin "node tests/rules.test.js"` (needs Java 11+, firebase-tools, @firebase/rules-unit-testing) |
| `e2e-emulator.js` | v3 end-to-end UI checks against the Auth + Firestore emulators (see the v3 section below) | `firebase emulators:start --only auth,firestore --project demo-strangepin`, `python3 -m http.server 8080 --bind 127.0.0.1`, then `node tests/e2e-emulator.js` |
| `detail-sections.js` | Timeline/Sources rendering, hostile data inert, only https links, `rel="noopener nofollow"` | static server on :8080, `node tests/detail-sections.js` |
| `pwa-offline.js` | SW registration/control, precache contents, nothing from Firebase/Google/EmailJS/Cloudinary/tiles cached, **real offline** (server killed + all hosts unresolvable) | `node tests/pwa-offline.js` (starts its own server on :8090) |
| `pwa-installability.js` | Chrome `Page.getInstallabilityErrors` = [], manifest parse, icon sizes, shortcuts | static server on :8080, `node tests/pwa-installability.js` |
| `seo-pages.test.js` | `scripts/build-pins.js` output: slugs, titles, canonical, description, OG, JSON-LD, escaping, sitemap; optional html-validate | `node scripts/build-pins.js && HTMLVALIDATE=<path to html-validate> node tests/seo-pages.test.js` |
| `csp-report-only.js` | `_headers` applied by `scripts/dev-headers-server.js`; CSP Report-Only violations per route, plus the Español language switch on `#submit` (Translate reached read-only) | `node scripts/dev-headers-server.js . 8093`, then `node tests/csp-report-only.js` |

## Performance (`perf/lcp`)

| File | What it checks | How to run |
|---|---|---|
| `perf-lazy.js` | First render happens before the deferred CDN scripts (delayed 3 s); init runs once; stats are shown immediately; no Google Translate request on a plain load; map deep link (99 markers) and submit mini-map with slow Leaflet; the language menu lazy-loads Translate; choosing Español translates the page (skipped if Google returns its rate-limit page); a saved preference loads Translate at startup | static server on :8080, `node tests/perf-lazy.js` |

Lighthouse method and results: `docs/perf-lcp.md`.

## Phase 3

| File | What it checks | How to run |
|---|---|---|
| `map-fallback.js` | Basemap chain OpenFreeMap dark → keyed CARTO (only with a key) → OSM-based dark raster, and the English error overlay when every provider fails (hosts blocked per scenario) | static server on :8080, `node tests/map-fallback.js` |
| `sitemap-check.js` | Every sitemap `<loc>` exists in the build output; every pin page is listed; one host, no `#`/`?`; robots.txt Sitemap line | `node scripts/build-pins.js --out dist && node tests/sitemap-check.js dist https://strangepin.com` (also run by `netlify.toml`) |
| `compat-matrix.test.js` | 42 cells: old/new client request shapes × assumed-old/new rules, plus abuse cases (`docs/firebase-compat-matrix.md`) | inside `firebase emulators:exec --only auth,firestore --project demo-strangepin` |
| `compat-old-client.js` | Runs the `main` client (served separately) with every Firebase back end aborted; records init errors and back-end attempts | serve `main` on :8301, `node tests/compat-old-client.js` |
| `../scripts/content-diff-check.js` | The content PR changes only pin content in `index.html`, no source removed | `node scripts/content-diff-check.js pr/technical pr/content` |
| `../scripts/sync-static-hero.js --check` | The static first-paint hero matches `renderHomeHero()` | `node scripts/sync-static-hero.js --check` |

Dependencies are pinned in `tests/package.json` / `tests/package-lock.json` (`npm ci --prefix tests`).
CI: `.github/workflows/ci.yml` (required job `tests`; see `docs/branch-protection.md`).

## Firebase security audit (2026-10-22, local branch `audit/firebase-rules`)

All emulator-only (project `demo-strangepin`); nothing contacts `strangepin-4e538`.
Report: `FIREBASE-SECURITY-AUDIT.md` (delivered outside the repo).

| File | What it checks | How to run |
|---|---|---|
| `expired-rules.test.js` | 44 read/write shapes of the old and new client, signed-in and anonymous, against the owner-reported live rules (`fixtures/rules-prod-expired.rules`, expired test mode): all must be denied | `firebase emulators:exec --config firebase.audit-expired.json --only auth,firestore --project demo-strangepin "node tests/expired-rules.test.js"` |
| `e2e-expired-rules.js` | Error handling of the v3 UI when Firestore denies everything (see the v3 section below) | same config, static server on :8080, `node tests/e2e-expired-rules.js` |
| `live-main-firebase-probe.js` | The deployed client (curl of https://strangepin.com, identical to main 728e8f5) never initialises Firebase and attempts 0 back-end requests; Sign In does nothing | serve the saved HTML on :8302, `LIVE_BASE=http://127.0.0.1:8302 node tests/live-main-firebase-probe.js` |

`compat-matrix.test.js` covers four rule sets (assumed-old, prod-expired, v1-pr1, v3).
The audit's `rules-v2-audit.test.js` was merged into `rules.test.js` (every case kept, adapted to v3).

## v3: manual review, admin-owned points, nicknames (local branch `pr/technical-v2`)

| File | What it checks | How to run |
|---|---|---|
| `rules.test.js` | `firestore.rules` v3: legitimate flows; legacy users (owner-shaped doc: points 25, pins 2, …) never reset/overwritten; private/public read boundaries; Google-only writes (unauthenticated, anonymous and email/password denied); cross-user edits; server-owned points/pins/roles; reserved and malformed nicknames; comments (author name = nickname, 15 s throttle); likes; submissions (pending only, schema, 60 s throttle, no review fields); `pointAwards` no client access; deletion requests; schema; invented pin ids; default deny | `firebase emulators:exec --only firestore --project demo-strangepin "node tests/rules.test.js"` |
| `admin-scripts.test.js` | `scripts/lib/guard.js` refusals; `admin-review-submission.js` list, dry run, approve, reject, duplicate, concurrent (8 at once), ledger tampering, missing profile, bad legacy values, non-admin client attempts; `backfill-public-profiles.js` dry run (counts only, no PII), create-if-absent, users untouched, existing profiles untouched, idempotent re-run | inside `firebase emulators:exec --only firestore --project demo-strangepin` |
| `e2e-emulator.js` | Real UI on the emulators: Google sign-in (credential + popup widget), profile creation, legacy user sign-in (seeded owner-shaped doc), comments/likes/reactions/saves, nickname change and reserved names, submission → pending review → admin approval → points shown, deletion request, leaderboard and home stats (nicknames only), XSS, 0 production requests | inside `firebase emulators:exec --only auth,firestore --project demo-strangepin`, static server on :8080 |
| `e2e-expired-rules.js` | Error handling under denial: profile-load notice, comments unavailable + failed comment keeps text, reaction and save roll back with a message, failed submission keeps the form and sends no e-mail, leaderboard failure state + 10 s timeout + retry, My submissions failure state, home fallback, 0 production requests | `firebase emulators:exec --config firebase.audit-expired.json --only auth,firestore --project demo-strangepin "node tests/e2e-expired-rules.js"` |
| `regression.js` | 99 pins, every route, map (list + markers), search and deep-link search, no page errors, **no console errors**, 0 production requests | inside `firebase emulators:exec --only auth,firestore --project demo-strangepin`, static server on :8080 |
