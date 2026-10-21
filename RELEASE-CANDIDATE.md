# StrangePin release candidate: QC pack

- **Prepared:** 2026-10-21, 17:20 CEST (Europe/Madrid).
- **Status:** LOCAL ONLY.
  - Nothing has been pushed, no PR has been opened, and nothing has been deployed.
  - No Firebase, Netlify, EmailJS or Cloudinary setting was changed.
  - No account was created and nothing was purchased.
- **Important:** none of this restores or changes production functionality until the owner runs the deployment plan in section 7.

| Branch | Head | Base | Contents |
|---|---|---|---|
| `fix/audit-critical` | 073b265 | `origin/main` 728e8f5 | Phase 1 fixes (see `CHANGES.md`) |
| `feat/phase2` | tip = the commit adding this file | `fix/audit-critical` | Phase 2 items 1–6 (code and docs, no pin-data edits) |
| `content/corrections` | 1 commit on top of `feat/phase2` | `feat/phase2` | Sourced pin-data corrections only, as a **separate PR** |

**Patches:**
- `patches/` (Phase 1)
- `patches/feat-phase2/0001…0012`
- `patches/content-corrections/0001`

Labels used below:
- **TESTED:** run here, with the method and environment stated.
- **EXPECTED:** reasoning only.
- **NOT TESTED:** needs real devices, real accounts or production.

---

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
| 2 | 9bcab67 | Basemap set by `SP_BASEMAP` (default `carto-legacy` = unchanged); OpenFreeMap dark prototype via MapLibre (lazy, SRI); keyed CARTO option; provider evaluation | `index.html`, `docs/map-providers.md`, `docs/img/map-*.png` |
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

### Content: `content/corrections` (separate PR)
- 52 field edits on 23 pins, each with a source. See `docs/content-corrections-applied.md`.
- Items that need a source or an owner decision were left out.

---

## 2. Test results: TESTED
All runs: 2026-10-21, on the box, Google Chrome headless via puppeteer-core 23. Static servers ran on `127.0.0.1` only.

| Suite | Environment | Expected | Result |
|---|---|---|---|
| `tests/rules.test.js` | Firestore emulator, `firebase emulators:exec`, project `demo-strangepin` | Proposed rules allow legitimate writes and deny abuse | **46/46 PASS** (`/workspace/strangepin-dev-tools/rules-test-output.txt`) |
| `tests/e2e-emulator.js` | Real UI + Auth/Firestore emulators (`?emulator=1`) | Sign-in, doc creation, comments, reactions, saves, points, likes and leaderboard work; abuse is denied; XSS is inert; no real back-end traffic | **22/22 PASS**, including "zero requests to real Firebase/Google back-ends" |
| `tests/browser-smoke.js` | Static server, mocked Firestore | Phase 1 behaviour, with no regressions | **18/18 PASS** |
| `tests/helpers.test.js` | Node | Escaping and URL helpers | **7/7 PASS** |
| `tests/detail-sections.js` | Static server | Timeline/Sources render; hostile data is inert; only https links, with `noopener nofollow` | **9/9 PASS** |
| `tests/pwa-offline.js` | Own server on :8090; **real offline** (server killed, all hosts unresolvable) | SW controls the page; shell is precached; no Firebase/Google/EmailJS/Cloudinary/tile URLs cached; offline map shows 99 markers; uncached path → `offline.html` | **13/13 PASS** |
| `tests/pwa-installability.js` | CDP `Page.getInstallabilityErrors` | No installability errors; manifest and icons valid | **11/11 PASS** |
| `tests/seo-pages.test.js` + html-validate 9 | `node scripts/build-pins.js` output | 99 pages: unique titles, canonical, description, OG, JSON-LD (Place/Article/Breadcrumb); hostile data escaped; sitemap with 101 URLs; valid HTML | **16/16 PASS** |
| Lighthouse 12, `/pins/area-51/` (generated) | Local | — | SEO 100, Accessibility 100, Best Practices 100 |
| Map screenshots (`/workspace/strangepin-dev-tools/mapshot.js`) | SwiftShader WebGL | OpenFreeMap dark renders with 99 markers; `carto-legacy` reproduces "API KEY REQUIRED" | As expected. `docs/img/map-openfreemap-dark.png`, `map-carto-legacy.png` |
| `tests/csp-report-only.js` | `_headers` applied by `scripts/dev-headers-server.js`; 7 routes incl. map (both basemaps), detail, submit, leaderboard | Header on every response; 0 violations | Header on 7/7 responses. **0 violations** on the last 2 runs. One earlier run logged a single `script-src-elem` report for the Translate script on `#submit`; the cause is not determined (that URL's host is allow-listed) |
| `content/corrections` | Field-level diff of `LOCATIONS`, plus smoke 18/18, detail 9/9, helpers 7/7 | Only the listed fields and pins changed; 99 pins | PASS |

Network safety during tests:
- Real Firestore, Identity Toolkit and Secure Token requests were aborted in every browser test, except the emulator e2e, which pointed only at `127.0.0.1`.
- Google Translate, unpkg, OpenFreeMap and CARTO public CDNs were reached read-only.

## 3. EXPECTED (reasoned, not verified)
- **Production Firebase:**
  - The new client code should work against the current production rules only if those rules are permissive. The live rules were not readable during the audit.
  - The proposed rules will break old clients that write `points` to `users/{uid}` without the mirror. That is intended.
- **Leaderboard:** the leaderboard and home stats read `publicProfiles`. Legacy users will be missing from them until `scripts/backfill-public-profiles.js --write` runs.
- **Points:** points remain client-initiated. The rules cap abuse (≤35 per award, 30 s cooldown, mirror must match), but they cannot fully prevent it. A Cloud Function is the real fix.
- **OpenFreeMap:**
  - no account or billing, so no surprise charges;
  - availability is best-effort (no SLA);
  - needs WebGL; about 1 MB extra JS, loaded only when a map is shown.
- **SW updates:** navigations are network-first, so a new deploy is picked up on the next online load. Bump `SP_SW_VERSION` whenever precached files change.
- **CSP:** the policy needs `'unsafe-inline'` for scripts, because the app uses inline `onclick` handlers and inline scripts. Enforcing it would therefore add little XSS protection until nonces or hashes are adopted. Report-Only mode has no reporting endpoint, so violations appear only in each visitor's console.

## 4. NOT TESTED
- Android install, iOS Add to Home Screen, and real mobile GPUs. Manual checklist: `docs/pwa.md`.
- Anything that needs production or the dashboards:
  - Firestore rules deploy;
  - the backfill;
  - EmailJS and Cloudinary flows;
  - Google sign-in against the real project;
  - the Netlify build and headers;
  - the `carto-key` basemap (no key exists);
  - Search Console and the Rich Results Test;
  - social preview scrapers.
- Google Translate inside the CSP beyond page load (the language switch itself was not exercised).

## 5. Known limitations
- `SP_BASEMAP` stays on `'carto-legacy'`, so **production map tiles will still say "API KEY REQUIRED"** until the owner picks a provider. This is a one-line change (section 6).
- The icons are placeholders (Phase 1); the maskable icon is derived from them.
- `locations.js` is not used by the app, but it is publicly served and has diverged from the inline data. Proposal: delete it (needs owner approval).
- The static `/pins/` pages need a Netlify build step (`netlify.toml`). That is intentionally **not** included; it should be a follow-up PR (`docs/seo-url-plan.md` §6).
- Data quality:
  - `verified:true` is set on every pin;
  - `reports` and score values are placeholders;
  - all pins share `dateAdded` 2026-06-04.
  - None of these are changed yet (see `docs/trust-model-proposal.md`).
- Phase 1 Lighthouse (mobile, throttled) measured LCP at 6.9 s on the branch vs 4.1 s originally, while CLS improved to 0. Investigate before release.
- `content/corrections` leaves out the items marked "source needed" or "needs approval" (Overtoun, Winchester Catfish, Bibbulmun, Point Pleasant, Roswell, the §6.2 items, and the new categories).

## 6. Map recommendation
Details, official URLs and the check dates (2026-10-21) are in `docs/map-providers.md`.

- **Primary: OpenFreeMap "dark".** No key, no account, commercial use allowed, no billing. The risk is that it has no SLA.
  - To ship it, set `const SP_BASEMAP = 'openfreemap-dark';` in `index.html`.
  - TESTED locally: renders with 99 markers.
- **Fallback: CARTO Dark Matter with a domain-restricted key.** Free commercial plan, 1M requests/month.
  - The owner requests the key; then set `SP_CARTO_KEY`.
  - The code falls back to it automatically if MapLibre/WebGL fails.
- **Later:** self-hosted Protomaps PMTiles, if SLA or scale matters.

## 7. Deployment plan (owner-run; each step needs explicit approval)
0. **Before any push:** enable branch protection on `main` (section 9).
1. **Firebase:** dry-run the backfill, then run it for real (owner, with a service account; the script never runs automatically):
   `node scripts/backfill-public-profiles.js` → review → `--write`.
2. **Push and open the PR:**
   - push `feat/phase2` (which contains `fix/audit-critical`);
   - open a PR into `main` with the description from `CHANGES.md` and this file;
   - optionally flip `SP_BASEMAP` in the PR after the decision in section 6.
3. **Netlify deploy preview** is built automatically for the PR. Verify on the preview URL:
   - [ ] Home, map, detail, submit, leaderboard and about load, with no console errors except CSP Report-Only notes.
   - [ ] The map renders tiles with the chosen basemap, 99 markers and correct attribution.
   - [ ] `#detail/001` deep link; Timeline and Sources visible; source links open in a new tab.
   - [ ] **Google sign-in.** The preview domain must be added to Firebase Auth → Authorized domains first; otherwise mark it untestable on the preview.
   - [ ] Comment, reaction, save and like against **production** rules (still the old ones at this point): they work, nothing is duplicated, and the leaderboard shows users after the backfill.
   - [ ] Submission form: EmailJS sends to the owner's inbox only; a Cloudinary upload succeeds with the restricted preset.
   - [ ] DevTools → Application: the SW is active; caches contain only `sp-shell-v1`/`sp-runtime-v1`; offline reload shows the shell.
   - [ ] Response headers include the `_headers` set, and `sw.js` is `no-cache`.
   - [ ] Console CSP Report-Only violations: record them and adjust `_headers`.
   - [ ] Lighthouse on the preview (mobile): compare with `/workspace/strangepin-dev-tools/lh/` baselines.
   - [ ] Android/iOS checklist in `docs/pwa.md` (on the preview, if possible).
4. **Merge** with the owner's approval. Netlify then publishes `main` to production.
5. **Deploy `firestore.rules`** after the production smoke checks pass (Firebase console, or `firebase deploy --only firestore:rules --project strangepin-4e538` by the owner). Then repeat the step 3 checks for comments, likes and points on production.
6. **`content/corrections`:** a separate PR, preview, owner content review, then merge.
7. **Follow-ups:**
   - SEO build PR (`netlify.toml` + generator);
   - CSP enforcement after a clean Report-Only period;
   - points Cloud Function;
   - trust-model implementation.

## 8. Rollback plan
- **Site (instant):** Netlify → Deploys → select the last good production deploy → **"Publish deploy"**. Optionally lock auto-publishing while you investigate.
- **Code:** create a revert PR with `git revert -m 1 <merge-commit>` (no force push), and merge it after the preview passes.
- **Firestore rules:** Firebase console → Firestore → Rules → history → restore the previous version. Do this first if writes start failing after step 7.5.
- **Backfill:** it only adds `publicProfiles/*` docs, which old clients ignore. Leave them in place, or delete them via an admin script only with approval.
- **Service worker:**
  - A rollback deploy is picked up on the next online navigation (network-first).
  - If the SW itself misbehaves, deploy this kill-switch `sw.js` and keep it for at least a few weeks:
    ```js
    self.addEventListener('install', () => self.skipWaiting());
    self.addEventListener('activate', (e) => e.waitUntil((async () => {
      for (const k of await caches.keys()) if (k.startsWith('sp-')) await caches.delete(k);
      await self.registration.unregister();
      for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
    })()));
    ```
- **Basemap:** set `SP_BASEMAP` back, or set `SP_CARTO_KEY`. This is a one-line revert.

## 9. Branch protection for `main`: set before any push
Repository `EclipseLegend/strangepin` → Settings → Rules → Rulesets → New branch ruleset (or classic Branch protection):

| Setting | Value |
|---|---|
| Target branches | `main` (default branch) |
| Enforcement | Active |
| Bypass list | **Empty.** Admins are included (classic: "Do not allow bypassing the above settings") |
| Restrict deletions | On |
| Block force pushes | On |
| Require linear history | On (squash or rebase merges only) |
| Require a pull request before merging | On |
| · Required approvals | **1** (see the note below) |
| · Dismiss stale approvals when new commits are pushed | On |
| · Require approval of the most recent reviewable push | On |
| · Require review from Code Owners | On, once `CODEOWNERS` exists (e.g. `* @EclipseLegend`) |
| · Require conversation resolution before merging | On |
| Require status checks to pass | On: `netlify/…/deploy-preview` (the Netlify check name appears after its first PR run) and, once a GitHub Action runs `tests/helpers.test.js` + `tests/seo-pages.test.js`, that job |
| · Require branches to be up to date before merging | On |
| Require signed commits | Optional (recommended if the owner's machine is set up for it) |
| Allowed merge methods (Settings → General) | Squash (and/or rebase); disable merge commits to keep history linear |
| Automatically delete head branches | On |

**Note on approvals:** GitHub does not let a PR author approve their own PR.
- If the owner is the only collaborator and also authors the PRs, a 1-approval rule blocks every merge.
- In that case, either add a trusted second reviewer, or set Required approvals = 0 while keeping "Require a pull request" and the status checks. That still prevents direct pushes and force pushes.

Netlify (optional): Site configuration → Build & deploy → keep Deploy Previews on, and consider "Lock to stop auto publishing" for controlled releases.

## 10. Remaining security items (dashboard or owner only)
| Item | Where | Action |
|---|---|---|
| Firestore rules | Firebase console / CLI | Run the backfill, then deploy `firestore.rules` (step 7.5) |
| Firebase API key restriction | Google Cloud console → APIs & Services → Credentials | Restrict the browser key's HTTP referrers to `strangepin.com/*`, `*.netlify.app/*` (previews) and `localhost` (dev); restrict it to the Identity Toolkit, Token Service and Firestore APIs |
| Firebase Auth | Authorized domains | Remove unused domains; add the preview domain only while testing |
| App Check (optional) | Firebase console | reCAPTCHA Enterprise / v3 for Firestore, to reduce scripted abuse |
| EmailJS | EmailJS dashboard | Lock the recipient to the owner's address in the template (not taken from form input); set allowed origins to the production domain; enable reCAPTCHA on the template; review rate limits |
| Cloudinary | Cloudinary console → Upload presets | Unsigned preset: restrict formats (jpg/png/webp), max file size, folder, no overwrite; moderation if available; consider a signed upload via a function |
| Security headers | `_headers` (in the PR) | Report-Only first; then add `report-to`, move to nonces/hashes, and enforce |
| HSTS | Netlify | Netlify serves HTTPS with HSTS by default (EXPECTED; confirm on the preview response). Do not add `preload` without a deliberate decision |
| `locations.js` | Repo | Delete (approval), since it is a stale public copy of the data |
