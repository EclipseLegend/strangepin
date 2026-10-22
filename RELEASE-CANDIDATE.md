# StrangePin release candidate: QC pack

- **Prepared:** 2026-10-21. Phase 3 update ~19:55 WEST (Europe/Lisbon, UTC+1).
  - **Time-zone note:** entries written before Phase 3 (here, `CHANGES.md`, `docs/perf-lcp.md`
    §1–6, `docs/map-providers.md` header) were labelled "CEST (Europe/Madrid)", and those
    commits carry `+0200`. The owner's zone is Europe/Lisbon (UTC+1); Phase 3 commits carry
    `+0100`. Treat the older wall-clock labels as approximate (1 h ahead of Lisbon).
- **Status: LOCAL ONLY.** Nothing pushed, no PR opened, nothing deployed; no Firebase, Netlify,
  EmailJS or Cloudinary setting changed; no Firestore rules deployed; backfill not run; no
  account created; nothing purchased. **Nothing here restores production functionality until
  the owner runs section 8.**
- Labels: **TESTED** (run here, method stated) · **EXPECTED** (reasoning) · **NOT TESTED**.

## 0. The two PR-ready branches (both descend from `main` 728e8f5)

| Branch | Base for the PR | Contents |
|---|---|---|
| `pr/technical` | `main` (728e8f5) | All Phase 1, Phase 2, `perf/lcp` and Phase 3 work: fixes, proposed rules + tests, PWA, detail sections, SEO generator + `netlify.toml`, `_headers`, perf, OpenFreeMap basemap + fallback chain, `locations.js` removal, CI workflow, docs. No pin-data edits. |
| `pr/content` | `pr/technical` | **One commit, pin content only** (`index.html` `LOCATIONS` array). Depends on the technical PR: 9 of its 23 pins change `timeline`/`sources`, which `main` does not render. Verify: `node scripts/content-diff-check.js pr/technical pr/content`. |

PR order: 1) `pr/technical` → `main`; 2) after it merges, retarget `pr/content` to `main` (its
diff stays content-only because its base commit is then in `main`). The old working branches
(`fix/audit-critical`, `feat/phase2`, `perf/lcp`, `content/corrections`, `feat/phase3`) are
superseded; do not open PRs from them. Patches: regenerate with
`git format-patch main..pr/technical` / `pr/technical..pr/content` (kept outside git, `patches/`
is git-ignored).

## 1. Change summary

### Phase 1: `fix/audit-critical`
Details in `CHANGES.md`.
- XSS escaping in every `innerHTML` template that includes user data
- Firebase init order, plus an SDK guard
- Placeholder stubs no longer override authored fields on pins 001–010
- Word-boundary previews
- `robots.txt` and a homepage `sitemap.xml`
- Deep links on first load
- a11y labels, and the CLS fix (0.813 → 0)
- `og-image.png`, plus placeholder favicon and icons
- Helper and browser tests
- `docs/content-corrections.md`

### Phase 2: `feat/phase2`
| # | Commit | Change | Main files |
|---|---|---|---|
| 1 | a20c009 | **Proposed** Firestore rules + 46 rules tests (not deployed) | `firestore.rules`, `firebase.json`, `tests/rules.test.js` |
| 1 | e95bd91 | Dev-only emulator switch (only on `localhost`/`127.0.0.1` with `?emulator=1`, project `demo-strangepin`); writes aligned with the rules (summary below the table); backfill script (not run) | `index.html`, `tests/e2e-emulator.js`, `scripts/backfill-public-profiles.js` |
| 1 | 0f881e3 | Smoke-test mock updated for the publicProfiles query chain | `tests/browser-smoke.js` |
| 2 | 9bcab67 | Basemap set by `SP_BASEMAP` (Phase 3 makes OpenFreeMap dark the default); OpenFreeMap dark prototype via MapLibre (lazy, SRI); keyed CARTO option; provider evaluation | `index.html`, `docs/map-providers.md`, `docs/img/map-*.png` |
| 3 | c6be1f3, 24bc0da | Service worker, `offline.html`, manifest `id`/`scope`/maskable icon, 180 px apple-touch-icon, PWA tests | `sw.js`, `offline.html`, `manifest.json`, icons, `docs/pwa.md`, `tests/pwa-*.js` |
| 4 | c7693bf | Timeline and Sources sections on the detail page (escaped; https-only links with `rel="noopener nofollow"`) | `index.html`, `tests/detail-sections.js` |
| 4 | 7262060, 4a47558 | Review of timeline/sources, now that they are public; proposal for the trust model (verified flag and counts) | `docs/content-corrections.md` §6, `docs/trust-model-proposal.md` |
| 5 | fbd4eaa | SEO plan + prototype static generator for `/pins/<slug>/` (JSON-LD, OG, canonical, sitemap) | `docs/seo-url-plan.md`, `scripts/build-pins.js`, `tests/seo-pages.test.js` |
| 6 | c0aba61 | `_headers`: baseline security headers + **CSP Report-Only**; Translate script loaded over https instead of protocol-relative | `_headers`, `index.html`, `tests/csp-report-only.js`, `scripts/dev-headers-server.js` |
| — | 1ae39df | Tests README | `tests/README.md` |

Write changes in e95bd91:
- private `users/{uid}` plus a public `publicProfiles/{uid}` mirror;
- batched points updates;
- server timestamps;
- comment limits;
- one like per user, enforced through a marker doc.

### Performance: `perf/lcp` (stacked on `feat/phase2`)
Full method, numbers and causes: `docs/perf-lcp.md`.
- **CDN scripts:** deferred. The first render runs before them (`spInitAppOnce`), and the map waits for Leaflet and its CSS.
- **Google Translate:** lazy-loaded on first use of the language menu, or at startup if a non-English language is saved.
- **Fonts:** self-hosted (OFL) with `font-display: swap` and metric-adjusted local fallbacks; no preload; `/fonts/*` cached as `immutable`.
- **First render:** no fade-in. Leaflet CSS is non-blocking. The stats bar shows the pin and country counts immediately.
- **`sw.js`:** `SP_SW_VERSION` is now `v2`; woff2 is cached.
- **`_headers`:** `frame-src 'self'`, which the Translate language switch needs.
- **Tooling and tests:** `scripts/dev-headers-server.js` now resolves its root correctly and supports `/dir/*` globs. Previously, with `.` as the root, every path except `/` returned 403. New `tests/perf-lazy.js`; `tests/csp-report-only.js` now also checks the language switch.

### Phase 3 (on `pr/technical`)
- **Map:** `SP_BASEMAP = 'openfreemap-dark'`. Chain: OpenFreeMap dark (MapLibre, WebGL, SRI) →
  keyed CARTO Dark Matter (only if `SP_CARTO_KEY` is set) → OSM-based dark raster (OSM tiles +
  CSS filter; allowed for an interactive public site with attribution, no prefetch/offline;
  `docs/map-providers.md`). If all fail: English overlay "Map tiles are unavailable right now."
  with "Try again". The unusable `carto-legacy` option was removed.
- **`locations.js` removed** after a reference audit (`docs/locations-js-removal.md`).
- **Performance:** static first-paint hero (`scripts/sync-static-hero.js`), CDN scripts and
  brand fonts loaded after first contentful paint, DM Sans from the second visit,
  `content-visibility` below the fold (`docs/perf-lcp.md` §7).
- **SEO:** `netlify.toml` builds the 99 `/pins/<slug>/` pages into `dist/` and fails the build if
  the sitemap lists anything not in the output (`tests/sitemap-check.js`); the SPA sets the
  canonical of detail views to `/pins/<slug>/` (no forced redirect; `#detail` cannot be
  redirected server-side).
- **Firebase:** compatibility matrix + tests; backfill gets `--confirm-project` and per-user
  transactions (`docs/firebase-compat-matrix.md`).
- **CI / repo hygiene:** `.github/workflows/ci.yml`, `docs/branch-protection.md`, extended
  `.gitignore`, test dependencies pinned in `tests/package*.json`.

### Content (`pr/content`)
- 23 pins, sourced corrections (`docs/content-corrections-applied.md`). Sources: 0 removed,
  3 citations corrected in place (same work), 1 added.

## 2. Final performance comparison (TESTED)

Lighthouse 12.8.2, mobile, same local HTTPS+gzip server and flags for every variant, Firebase
back ends blocked (`--blocked-url-patterns`; every run verified: 0–2 back-end attempts, all
blocked, none sent). Medians of 5 (simulate) / 3 (DevTools), spread in brackets.

| Variant | Mode | Perf | LCP | FCP | TBT | CLS | LCP element |
|---|---|---|---|---|---|---|---|
| `main` 728e8f5 | simulate | 70 | 2567 (2421–2891) | 2238 | 104 (69–119) | 0.813 | footer disclaimer (CLS bug) |
| old `perf/lcp` | simulate | 84 | 4206 (3707–4305) | 2178 | 5 (3–9) | 0 | hero title |
| **`pr/technical`** | simulate | **99** | **1576 (1565–1610)** | **1507** | **69 (57–88)** | **0** | hero title |
| `main` | DevTools | 71 | 1452 (1411–1463) | 1452 | 250 | 0.808 | footer disclaimer |
| **`pr/technical`** | DevTools | **100** | **873 (854–876)** | 854 | 67 | 0 | hero title |

Release blocker **resolved**: default-mode LCP 1576 ≤ 2567 ms, CLS 0 ≤ 0.813, TBT 69 ≤ 104 ms.
Cause (Lantern graph evidence): every request started before the observed LCP becomes an LCP
dependency, so the deferred CDN scripts (simulated serial Firebase chain to ~3.26 s) and fonts
inflated simulated LCP; also a replaced static hero is not an LCP candidate. `main`'s 2.57 s is
artificially low because its LCP element is the footer, in view only because of the CLS bug.
Trade-off: first-visit body text uses the metric-matched fallback instead of DM Sans
(`SP_BODY_FONT_POLICY`). Details: `docs/perf-lcp.md` §7.

## 3. Automated test results (TESTED, 2026-10-21 ~19:35–19:50 WEST)

All suites were run as the CI workflow would, in a **clean worktree** of the branch with
`npm ci --prefix tests` (pinned lockfile), headless Google Chrome, static servers on
127.0.0.1, emulators with project `demo-strangepin`. Result: **all green**.

| Suite | Result |
|---|---|
| `tests/helpers.test.js` | 7/7 |
| `scripts/sync-static-hero.js --check` | up to date |
| `scripts/build-pins.js` + `tests/sitemap-check.js` | 99 pages; 101 URLs all in output (negative test: injected/missing URL → exit 1) |
| `tests/seo-pages.test.js` + html-validate 9.7.1 | 16/16 |
| `tests/browser-smoke.js` | 18/18 |
| `tests/detail-sections.js` | 9/9 |
| `tests/pwa-installability.js` | 11/11 |
| `tests/map-fallback.js` (7 failure scenarios, hosts blocked) | 30/30 |
| `tests/pwa-offline.js` (real offline) | 13/13 |
| `tests/rules.test.js` (emulator) | 46/46 |
| `tests/compat-matrix.test.js` (emulator) | 42 cells, 0 unexpected |
| `tests/e2e-emulator.js` (real UI + emulators) | 22/22, zero real back-end requests |
| `tests/perf-lazy.js` (network: Translate) | 14/14 |
| `tests/csp-report-only.js` (network: Translate, OpenFreeMap) | header 7/7, 0 violations (incl. OFM map and OSM fallback routes) |
| `tests/compat-old-client.js` (`main` client) | `firebase is not defined` on 3 routes, 0 back-end attempts |
| `scripts/content-diff-check.js pr/technical pr/content` | PASS (negative test → exit 1) |
| `npx netlify-cli@17 build --offline` (no login, clean worktree) | build command ran, sitemap check passed, exit 0 |
| `actionlint` on `ci.yml` | clean |
| Backfill on emulator | dry run; missing/wrong `--confirm-project` → exit 2; two writes → identical docs |
| Secret scan (section 7) | no secrets; only the public Firebase web config |

NOT TESTED: GitHub-hosted runner execution of `ci.yml` (EXPECTED to pass: same commands;
`ubuntu-latest` ships `/usr/bin/google-chrome`), real Netlify build/deploy, real devices,
Safari/Firefox, production Firebase/EmailJS/Cloudinary.

## 4. Firebase compatibility matrix (summary; `docs/firebase-compat-matrix.md`)

Production rules are **unknown** (no console access); "old rules" = an assumed permissive set.

| Scenario | Features | Security |
|---|---|---|
| Old client + old rules (today) | Nothing Firebase-backed works: `main` never initialises Firebase (TESTED) | Assumed rules allow reading others' email, self-awarding points, editing others' comments (TESTED on assumed rules) |
| New client + old rules | All allowed (TESTED at rules level in the matrix; the UI e2e ran only against the new rules); leaderboard empty for legacy users until backfill (EXPECTED) | Same as today |
| New client + new rules (target) | All work (TESTED, e2e 22/22 + matrix) | All tested abuse denied |
| Rolled-back client + new rules | `main`: nothing works anyway; a working old client: sign-in and comments only, rest denied (TESTED cells) | Protected |

## 5. GitHub PR plan

1. Owner applies branch protection (`docs/branch-protection.md`: PR required, 0 approvals,
   required check `tests`, no force push, no deletion, no bypass).
2. Push `pr/technical`; open **PR #1** `pr/technical` → `main`. CI `tests` must pass; Netlify
   builds a deploy preview with `netlify.toml`.
3. Push `pr/content`; open **PR #2** `pr/content` → `pr/technical` (diff = content only); after
   PR #1 merges, retarget PR #2 to `main` (GitHub does this automatically when the base branch is
   deleted on merge; otherwise edit the base).
4. Merge PR #1 (owner), production checks, then PR #2.

## 6. Safe deployment order (owner-run; each step needs explicit approval)

1. Capture the live Firestore rules (console → Rules) into the repo and rerun the matrix.
2. Merge PR #1 → Netlify production (works with old and new rules). Check on the deploy
   preview first: map (OpenFreeMap tiles + attribution), deep links, `/pins/area-51/`,
   `sitemap.xml`, headers, SW, sign-in (preview domain must be an authorised Auth domain),
   comment/reaction/save/like, EmailJS/Cloudinary submit, Lighthouse.
3. Backfill: `node scripts/backfill-public-profiles.js` (dry run) → review → `--write
   --confirm-project=strangepin-4e538`.
4. Deploy `firestore.rules` (`firebase deploy --only firestore:rules --project strangepin-4e538`,
   owner) and smoke test on production.
5. Backfill again (idempotent).
6. Merge PR #2 (content) after the owner's content review on its preview.

## 7. Secret / sensitive-file scan (TESTED)

- **gitleaks 8.30.1** (checksum verified) and **trufflehog 3.99.3** (`--no-verification`, so the
  key was never sent anywhere) over every commit of `main`, `pr/technical`, `pr/content` and all
  other local refs. Findings: the Firebase web `apiKey` only, in `index.html` and in two
  files that the owner uploaded and later deleted in `main`'s own history
  (`index.html.bak`, `strangepin-dist/`).
- Manual checks over every commit: no `.env`, service-account JSON, private keys, tokens,
  cookies, emulator data, Lighthouse traces/reports, `node_modules`, `dist/`, `patches/`; no blob
  > 500 KB. Box-specific paths were removed from the tip docs (`<local-tools>/`); some older
  commits' docs still mention local tool paths (directory names only, no secrets).
- **Public, not secret (listed for completeness):** Firebase web config in `index.html`
  (`apiKey AIzaSyBn5qHhpLgNwsHXcIegKJF-ZzybomjVTuI`, `authDomain strangepin-4e538.firebaseapp.com`,
  `projectId strangepin-4e538`, `storageBucket strangepin-4e538.firebasestorage.app`,
  `messagingSenderId 254898349595`, `appId 1:254898349595:web:1a20cc9c8d4ced1796fabe`); EmailJS
  public key / service / template IDs and the recipient `thestrangepin@gmail.com`; Cloudinary
  unsigned preset. Protection comes from rules, key restrictions and dashboard settings
  (section 11), not from hiding them. trufflehog classifies the key as a "Google (Gemini) API
  key": an unrestricted AIza key works for any API enabled on the project, so restrict it.
- `main` contains a stray file `download` (a misnamed copy of `.gitignore`); harmless, can be
  deleted in a later PR (not touched, to keep the PRs focused).

## 8. Rollback procedures

- **Site:** Netlify → Deploys → last good deploy → "Publish deploy" (instant). Code: revert PR
  (`git revert -m 1 <merge>`), no force push.
- **Rules:** Firebase console → Firestore → Rules → history → previous version → publish.
  **Roll back rules before (or with) the client**: an older client against the new rules loses
  points/reactions/likes/saves/leaderboard.
- **Backfill:** additive (`publicProfiles/*`); old clients ignore it; leave in place.
- **netlify.toml:** reverting PR #1 restores "publish repo root, no build".
- **Basemap:** `SP_BASEMAP` / `SP_CARTO_KEY` one-line change; the chain already falls back.
- **Service worker:** a rollback deploy is picked up on the next online navigation.
  - If the SW itself misbehaves, deploy this kill-switch `sw.js` and keep it for at least a few weeks:
    ```js
    self.addEventListener('install', () => self.skipWaiting());
    self.addEventListener('activate', (e) => e.waitUntil((async () => {
      for (const k of await caches.keys()) if (k.startsWith('sp-')) await caches.delete(k);
      await self.registration.unregister();
      for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
    })()));
    ```

## 9. Remaining known risks

- Production Firestore rules unknown; abuse exposure today depends on them.
- Points are client-initiated (rules cap and cool down, not prevent); a Cloud Function is the
  real fix. Users with non-integer `points` get a 0 mirror and cannot earn points until fixed.
- OpenFreeMap and OSM tiles have no SLA; OSM fallback is best-effort and policy-bound (no
  heavy use). CARTO key path NOT TESTED with a real key.
- Simulated metrics ≠ field data; confirm with CrUX ~28 days after deploy. First-visit body
  font differs (trade-off).
- `netlify.toml` changes the production build (publish `dist/` instead of the repo root): repo
  files like `docs/`, `tests/`, `firestore.rules` stop being public (intended), but any
  external link to them breaks.
- 0 required approvals: anyone with write access (including the owner's agents) can merge once
  `tests` passes; the safeguard is procedural (`docs/branch-protection.md`).
- CSP is Report-Only and needs `'unsafe-inline'`; Translate untested on the https origin.
- Content items needing sources/approval are not included (see `docs/content-corrections-applied.md`).

## 10. Map recommendation
OpenFreeMap dark is now the default (section 1). Optional: request a domain-restricted CARTO
key and set `SP_CARTO_KEY` as a second tier; later, self-hosted Protomaps if SLA matters.

## 11. Remaining security items (dashboard or owner only)
| Item | Where | Action |
|---|---|---|
| Firestore rules | Firebase console / CLI | Run the backfill, then deploy `firestore.rules` (section 8, step 5) |
| Firebase API key restriction | Google Cloud console → APIs & Services → Credentials | Restrict the browser key's HTTP referrers to `strangepin.com/*`, `*.netlify.app/*` (previews) and `localhost` (dev); restrict it to the Identity Toolkit, Token Service and Firestore APIs |
| Firebase Auth | Authorized domains | Remove unused domains; add the preview domain only while testing |
| App Check (optional) | Firebase console | reCAPTCHA Enterprise / v3 for Firestore, to reduce scripted abuse |
| EmailJS | EmailJS dashboard | Lock the recipient to the owner's address in the template (not taken from form input); set allowed origins to the production domain; enable reCAPTCHA on the template; review rate limits |
| Cloudinary | Cloudinary console → Upload presets | Unsigned preset: restrict formats (jpg/png/webp), max file size, folder, no overwrite; moderation if available; consider a signed upload via a function |
| Security headers | `_headers` (in the PR) | Report-Only first; then add `report-to`, move to nonces/hashes, and enforce |
| HSTS | Netlify | Netlify serves HTTPS with HSTS by default (EXPECTED; confirm on the preview response). Do not add `preload` without a deliberate decision |
