# Performance: LCP investigation and fixes (`perf/lcp`)

- **Branch:** `perf/lcp`, stacked on `feat/phase2` (f1724ef). Status at the time: local only. These changes shipped with PR #1 (deployed 2026-10-22).
- **Measured:** 2026-10-21, 17:50–19:05 CEST (Europe/Madrid), on the shared Linux box.
- `<local-tools>/` = measurement scripts and raw output kept on the dev box, deliberately not committed.
- Labels: **TESTED** = run here (method stated); **EXPECTED** = reasoning only; **NOT TESTED**.

## 1. Method

- **Tool:** Lighthouse 12.8.2 (`npx lighthouse@12.8.2`), mobile form factor, performance only, Chrome headless (`/usr/bin/google-chrome`).
  - **Simulate mode** (Lighthouse default, "Lantern"): the page loads unthrottled; the metrics are then *simulated* for slow 4G with 4x CPU slowdown.
  - **DevTools mode** (`--throttling-method=devtools`): the page really loads under network and CPU throttling, so the metrics are real paints.
- **Server:** a local HTTPS + gzip static server (`<local-tools>/https-server.py`, self-signed localhost certificate). Reasons:
  - Netlify serves the HTML compressed (about 66 KB with brotli). The python `http.server` serves it uncompressed (about 340–370 KB), which inflates simulated times.
  - On a plain-http origin, the old protocol-relative `//translate.google.com/...` script became `http://`. Port 80 is blocked on this box, so the request hung and Lighthouse reported NO_FCP on `main`.
- **Variants** (three servers side by side): `main` 728e8f5 (`https://localhost:8201`), `feat/phase2` f1724ef (`:8202`), `perf/lcp` (`:8203`). Each was run 3 times; the median is reported.
- **Back-end traffic during the Lighthouse runs:** the page made its normal **read-only** requests to production Firebase (Firestore listen channel, Identity Toolkit `getProjectConfig`). No writes were made, no form was submitted, and no account was used.
- Raw runs: `<local-tools>/lh/runs/*.json`. Summary script: `node <local-tools>/lh-summary.js <labels>`.

## 2. Results (TESTED, medians of 3)

**Simulate mode (Lighthouse default)**

| Variant | Perf | LCP | FCP | TBT | CLS | LCP element |
|---|---|---|---|---|---|---|
| `main` 728e8f5 | 70 | 2569 ms | 2243 ms | 112 ms | 0.813 | footer `div.disclaimer`: in view only because of the layout-shift bug |
| `feat/phase2` f1724ef | 92 | 2747 ms | 2427 ms | 137 ms | 0 | nav `div.logo-text`: the hero was excluded because it fades in from opacity 0 |
| **`perf/lcp` final** (index.html as of 528af42) | 86 | 3853 ms | **2184 ms** | **4 ms** | 0 | **hero `h1.hero-title`** ("Every mystery has a place.") |

- Three extra runs each for `main` and `feat/phase2` give the same 6-run medians: `main` 70 / 2570 / 2243 / 119 / 0.813 and `feat/phase2` 92 / 2747 / 2427 / 137 / 0.
- The final variant was stable: perf 86/86/87; LCP 3855/3853/3712 ms.

**DevTools mode (real throttled paints)**

| Variant | Perf | LCP | FCP | TBT | CLS | LCP element |
|---|---|---|---|---|---|---|
| `main` | 71 | 1439 ms | 1439 ms | 255 ms | 0.808 | footer disclaimer |
| `feat/phase2` | 92 | 1449 ms | 1449 ms | 264 ms | 0 | nav logo text |
| **`perf/lcp` final** | **96** | **1312 ms** | **735 ms** | 234 ms | 0.001 | hero `h1.hero-title` |

**How to read these numbers**
- With real paints (DevTools mode), the branch is better than both baselines. Content appears about 0.7 s earlier, the real hero is the LCP element, and it paints sooner.
- In simulate mode, **LCP looks worse** (3.85 s vs 2.57 s / 2.75 s), although FCP and TBT are better. Two reasons:
  1. The baselines' LCP elements are not the real largest content (a shifted footer, and a small logo while the hero is invisible).
  2. Lantern's LCP for the final branch is the hero at its font swap, so it includes a *simulated* slow-4G download of the self-hosted fonts. In the unthrottled load of the same runs, observed LCP was about 0.33–0.37 s.
- **Production field data will decide.** See §6.

## 3. The original "6.9 s vs 4.1 s" (Phase 1)

That comparison was made over plain http with uncompressed HTML (`lh/lh-orig.json`, `lh/lh-new.json`).
- On the Phase 1 branch, once the CLS fix stopped the footer jumping into view, the LCP element became `#homeStats`. That element was updated after Firestore answered, so LCP waited on the network.
- Under the method above, `feat/phase2` (2.75 s) is close to `main` (2.57 s) in simulate mode and equal in DevTools mode (1.45 s vs 1.44 s).
- **TESTED conclusion:** most of the "regression" was a measurement artifact, plus an LCP element that waited on Firestore. It was not slower rendering.

## 4. What delayed LCP, and the fixes (all in `index.html` unless noted)

| Cause (TESTED by trace or Lighthouse unless marked) | Fix |
|---|---|
| Synchronous CDN scripts in `<head>` (Leaflet, EmailJS, Firebase compat ×3) ran before the first render. TBT 112–137 ms simulated. | Scripts are `defer`red. The app renders from an inline call just before `</body>`, guarded by `spInitAppOnce` (DOMContentLoaded stays as a fallback). Map code waits for `L` and the Leaflet CSS (`spWhenLeafletReady`). TBT is now 4 ms simulated. |
| Google Translate `element.js` loaded on every page view, on the critical path. | **Lazy-loaded:** the script loads only when the language menu opens or a language is chosen, or at startup when a non-English preference is saved. |
| Google Fonts stylesheet: a render-blocking cross-origin request chain. | Self-hosted woff2 subsets in `fonts/` (SIL OFL 1.1, `fonts/LICENSES.md`), inline `@font-face` with `font-display: swap`. `_headers` caches `/fonts/*` for a year as `immutable`. |
| The font swap shifted the hero (CLS 0.071 in DevTools mode once the fade was removed). | **Metric-adjusted local fallbacks** (`Syne Fallback`, `DM Sans Fallback`: Arial / Liberation Sans with `size-adjust` and ascent/descent overrides). The values were measured in Chrome with canvas `measureText`. CLS is now 0.001. |
| The `.page` fade-in starts at opacity 0, so the hero could not be the LCP element and became visible only after 0.35 s. | No fade on the **first** render. Later page changes still fade. |
| Leaflet CSS was render-blocking on every page. | Loaded non-blocking (`media="print"` + `onload`, with a `<noscript>` fallback). The map waits for it. |
| The stats bar showed "—" until Firestore answered. Under Phase 1 this was the LCP element. | Pin and country counts render immediately from the bundled data. Only "explorers" waits for Firestore. |
| `<link rel="preload">` for two fonts made the first paint **bimodal** in simulate runs: observed FCP was about 0.3 s or about 1.3 s (slow in 10 of 21 runs across the preload variants). | Preloads removed. Afterwards 3 of 3 runs were stable (fewer runs than with the preloads, so this is less certain) and the first paint used the fallback fonts at about 0.16 s observed. The exact Chrome mechanism was **not determined**: the trace shows frames presented from about 0.26 s, but the first contentful paint is recorded only at about 1.32 s. |

`sw.js`: `SP_SW_VERSION` is now `v2` (precached files changed), and woff2 is added to the same-origin cache-first rule.

## 5. CSP: the single Google Translate violation (TESTED)

- **Root cause:** Google rate-limits automated traffic. It answered `element.js` with `302 → https://www.google.com/sorry/...`. That host is not in `script-src`, and Chrome reports the violation under the **original** Translate URL, which is why it looked like an allow-listed host being blocked.
  - In an 8-run probe (`<local-tools>/csp-probe.js`), the one violation coincided with that 302.
  - The page does not matter (seen on `#home` here, on `#submit` earlier). Real users are rarely served `/sorry`. `www.google.com` was deliberately **not** added to `script-src`.
- **With lazy loading,** Translate is not requested on a normal page view (TESTED in `tests/perf-lazy.js`). The violation can therefore only appear after a visitor chooses a language.
- **New check:** the language switch under the CSP (`tests/csp-report-only.js`, last row): switching to Español on `#submit` translates the page.
  - It initially caused a `frame-src` violation for the page's own origin. `'self'` was added to `frame-src` in `_headers`.
  - What remains is `img-src http://translate.google.com/gen204...`. Translate builds its beacon protocol-relative, so it is `http://` only on the http test origin. **EXPECTED:** it is `https://` on production and therefore allowed by `img-src https:`. This is reported as information, not counted.

## 6. Unresolved / caveats

- **Simulated LCP is worse than the baselines** (3.85 s vs 2.57 s / 2.75 s). The reason is Lantern's handling of the hero's font swap, while real-paint runs are better. PageSpeed Insights uses simulate mode, so its headline LCP may look worse after deploy. **NOT TESTED** in production. Compare CrUX / field LCP before and after (it needs about 28 days of data).
- **One-time first-layout cost on this box:** about 250 ms unthrottled in a fresh browser, about 100 ms of it from colour emoji (Noto Color Emoji). It is environment-specific. Lantern multiplies it by the CPU slowdown. Replacing emoji in the nav and tab bar with inline SVG icons would remove it. That is a design change and was not made.
- The bimodal first paint with font preloads is avoided, not explained.
- **NOT TESTED:**
  - real phones and real networks;
  - Netlify's actual compression and headers (`_headers` `/fonts/*` caching is EXPECTED to apply);
  - Safari/Firefox behaviour of the fallback overrides. EXPECTED from compatibility tables (not verified here): Firefox supports all four descriptors; Safari supports `size-adjust` (17+) but not `ascent-override`/`descent-override`. Where they are unsupported, the fallback is plain or only width-adjusted Arial, so the swap can cause a small shift.

## 7. Phase 3: the simulated-LCP regression, identified and resolved

Measured 2026-10-21, ~19:10–19:45 WEST (Europe/Lisbon). (The "CEST (Europe/Madrid)" labels in
§1–§6 above are the earlier box setting, UTC+2; Phase 3 times are Europe/Lisbon, UTC+1.)

### 7.1 Identical environment for every variant (TESTED)

- Lighthouse 12.8.2, mobile, **default simulate throttling**, performance only, Chrome headless,
  `--ignore-certificate-errors`; same local HTTPS + gzip server (`https-server.py`) for every
  variant (`main` :8201, old `perf/lcp` :8202, Phase 3 :8203); **5 runs each**, median + spread.
- **No production Firebase traffic:** `--blocked-url-patterns` for `*firestore.googleapis.com*`,
  `*identitytoolkit.googleapis.com*`, `*securetoken.googleapis.com*`, `*firebaseapp.com*`,
  `*apis.google.com*`. Every run's network log was checked: 0–2 back-end requests per run, all
  with status "blocked" (never sent). The only Google request that still loads is the static
  Firebase SDK JavaScript from `www.gstatic.com` (a CDN file, not a back-end call). On `main`
  there are 0 back-end attempts because its Firebase init fails (`firebase is not defined`).
- Script: `lh5.sh <label> <url> 5` (tooling kept outside the repo).

### 7.2 Results (TESTED, simulate mode, 5 runs each)

| Variant | Perf | LCP median (spread) | FCP | TBT median (spread) | CLS | LCP element | Observed (unthrottled) FCP / LCP |
|---|---|---|---|---|---|---|---|
| `main` 728e8f5 | 70 | 2567 ms (2421–2891) | 2238 | 104 ms (69–119) | 0.813 | footer `div.disclaimer` | 206–262 / same |
| `perf/lcp` 9fa4cd9 | 84 | 4206 ms (3707–4305) | 2178 | 5 ms (3–9) | 0 | `h1.hero-title` | 166–216 / 333–423 |
| **Phase 3** (`feat/phase3`) | **99** | **1576 ms (1565–1610)** | **1507** | **69 ms (57–88)** | **0** | `h1.hero-title` | 181–213 / same |

A second 5-run `main` batch gave 69 / 2568 ms (2418–3333) / TBT 103 / CLS 0.813, so the
baseline is stable. (The earlier 3-run `perf/lcp` figure, 3853 ms, was measured with production
back ends reachable; with them blocked it is 4206 ms.)

**DevTools mode (real throttled paints), 3 runs each, same settings:**

| Variant | Perf | LCP | FCP | TBT | CLS | LCP element |
|---|---|---|---|---|---|---|
| `main` | 71 | 1452 ms (1411–1463) | 1452 | 250 ms | 0.808 | footer disclaimer |
| **Phase 3** | **100** | **873 ms (854–876)** | 854 | 67 ms | 0 | `h1.hero-title` |

Goal "default-mode LCP ≤ main, CLS and TBT not worse": **met** (1576 vs 2567 ms; CLS 0 vs
0.813; TBT 69 vs 104 ms). Against old `perf/lcp`, TBT rose from 5 to 69 ms (brand fonts now
swap in after first paint; see 7.4); it is still below `main`.

### 7.3 What exactly drove the regression (TESTED with Lantern debug traces)

Method: `LANTERN_DEBUG=1` single runs export the optimistic/pessimistic LCP simulation graphs
(`*LargestContentfulPaint.trace.json`), which list every network/CPU node the simulated LCP
depends on.

1. **Lantern makes every request that *started* before the observed LCP an LCP dependency.**
   On `perf/lcp` the observed LCP (hero text at its font swap, 333–423 ms) came after the start
   of the `defer` CDN scripts (Leaflet, EmailJS, three Firebase SDK files) and the three WOFF2
   fonts. Under simulated slow 4G these are "downloaded" before LCP; the Firebase chain alone
   ended at ~3258 ms in the graph. This is why simulated LCP was 3.7–4.3 s while the real
   paint was ~0.35 s. Not a font-swap issue alone: removing only the font swap (hero3) still
   gave 3211 ms; deferring the CDN until after first paint (hero4) gave 1671 ms.
2. **A static first-paint hero that is later replaced is not an LCP candidate.** Chrome drops a
   candidate whose node is removed before presentation. The first attempt (static hero
   replaced by `innerHTML`) scored 4309 ms; keeping the static `section.hero` node and appending
   the rest of the page after it fixed this (3612 ms in isolation).
3. **The flaky first paint with font preloads (§6)** is now moot: there are no font preloads; the
   fonts are not requested before first paint at all.

Single-run experiments (simulate): hero1 static hero replaced 4309 ms · hero2 node kept 3612 ·
hero3 fonts after paint 3211 · hero4 CDN after paint 1671 ms (TBT 247) · then TBT work below.

### 7.4 Fixes shipped (all features kept; CSP/SRI unchanged)

- **Static hero markup** in `index.html` between `SP-STATIC-HERO` markers, generated from
  `renderHomeHero()` by `scripts/sync-static-hero.js` (`--check` runs in CI). The SPA keeps that
  node on the first `#home` render. Non-home deep links clear it before first paint.
- **Deferred assets after first contentful paint:** Leaflet CSS/JS, EmailJS and the Firebase
  SDK (same versions, same SRI hashes, `async=false` to keep order) are injected after the
  `first-contentful-paint` entry (fallbacks: `load` + 1 s, hard 3 s). `window.spCdnReady`
  resolves when they have loaded; Firebase init and the EmailJS submit wait for it. Map and
  submit mini-map wait for Leaflet (tested with a slowed CDN).
- **Fonts:** metric-adjusted local fallbacks paint first. Syne + JetBrains Mono (brand/hero)
  activate right after first paint. DM Sans (body) is prefetched at idle and used **from the
  next visit** (`SP_BODY_FONT_POLICY = 'repeat-visit'`), because activating it during the
  first visit cost ~70–100 ms of relayout (TBT 247 → 276 ms when swapped on idle). Option
  `'swap-after-load'` exists if the owner prefers brand body text on the first visit (its TBT
  was not measured on the final build; EXPECTED higher than 69 ms, by roughly the DM Sans
  relayout cost above).
- **`content-visibility: auto`** on below-the-fold home sections and the footer, with
  `contain-intrinsic-size`, to shrink the post-paint relayout (TBT 128 → 73 ms in exp7).
- Tried and dropped: font preloads (bimodal first paint, §6). Considered but **not run as
  separate experiments** (NOT TESTED), because the fonts are no longer requested before first
  paint: `font-display: optional` for the hero, font subsetting, more inline critical CSS (the
  site CSS is already inline).

### 7.5 Why `main`'s 2.57 s was artificially low (TESTED)

On `main` the LCP element is the footer `div.disclaimer`. It is in the first viewport only
because of the layout-shift bug (CLS 0.806–0.813: the main area starts with no height, so the
footer paints at the top and is then pushed down). The hero appears later with a fade-in from
opacity 0, which Chrome does not count. So `main` reports the paint time of the wrong element;
once CLS is fixed (Phase 1+), the real hero becomes the LCP element and is what is measured.

### 7.6 Trade-offs and NOT TESTED

- First visit: body text uses the metric-adjusted Arial fallback instead of DM Sans (brand
  change visible to the owner; switch with `SP_BODY_FONT_POLICY`).
- Interactivity: map, sign-in and the form become usable when the deferred assets have loaded
  (~0.3–1 s after first paint on this box; EXPECTED longer on slow phones).
- NOT TESTED: real devices/networks, PageSpeed Insights on the deployed site, CrUX field data
  (needs ~28 days after deploy), Safari/Firefox.
