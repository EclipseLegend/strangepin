# Tests

Local-only checks; nothing here talks to production Firebase, EmailJS or Cloudinary.

| File | What it checks | How to run |
|---|---|---|
| `helpers.test.js` | `escapeHtml`, `safeHttpsUrl`, `avatarInitial`, `safeDocId`, `avatarHtml`, `truncateAtWord`, `previewText` | `node tests/helpers.test.js` |
| `browser-smoke.js` | Firebase initialises (no `firebase is not defined`), deep links (`#detail/001`, `#detail/area-51`, `#map`, `#nearby`), featured timelines present, XSS payloads rendered through the real render functions (comments, leaderboard, profile, home live sections) stay inert, avatar fallback works | `python3 -m http.server 8080` in the repo root, then `npm i --no-save puppeteer-core` and `CHROME_PATH=/path/to/chrome node tests/browser-smoke.js` |

The browser test aborts requests to Firestore, Firebase Auth, EmailJS, Cloudinary and
Nominatim, and mocks Firestore/auth data in the page.

## Phase 2 tests

| File | What it checks | How to run |
|---|---|---|
| `rules.test.js` | 46 tests of the **proposed** `firestore.rules` (users private, publicProfiles mirror, points caps/cooldown, reactions, saves, comment ownership, one like per user, default deny) | `firebase emulators:exec --only firestore --project demo-strangepin "node tests/rules.test.js"` (needs Java 11+, firebase-tools, @firebase/rules-unit-testing) |
| `e2e-emulator.js` | 22 end-to-end checks of the real UI against the Auth + Firestore emulators (`?emulator=1`, project `demo-strangepin`), including UI popup sign-in, XSS, rule denials and **zero requests to real back ends** | `firebase emulators:start --only auth,firestore --project demo-strangepin`, `python3 -m http.server 8080 --bind 127.0.0.1`, then `node tests/e2e-emulator.js` |
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
