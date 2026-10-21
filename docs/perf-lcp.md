# Performance: LCP investigation and fixes (`perf/lcp`)

- **Branch:** `perf/lcp`, stacked on `feat/phase2` (f1724ef). Status: LOCAL ONLY, not pushed or deployed.
- **Measured:** 2026-10-21, 17:50–19:05 CEST (Europe/Madrid), on the shared Linux box.
- Labels: **TESTED** = run here (method stated); **EXPECTED** = reasoning only; **NOT TESTED**.

## 1. Method

- **Tool:** Lighthouse 12.8.2 (`npx lighthouse@12.8.2`), mobile form factor, performance only, Chrome headless (`/usr/bin/google-chrome`).
  - **Simulate mode** (Lighthouse default, "Lantern"): the page loads unthrottled; the metrics are then *simulated* for slow 4G with 4x CPU slowdown.
  - **DevTools mode** (`--throttling-method=devtools`): the page really loads under network and CPU throttling, so the metrics are real paints.
- **Server:** a local HTTPS + gzip static server (`/workspace/strangepin-dev-tools/https-server.py`, self-signed localhost certificate). Reasons:
  - Netlify serves the HTML compressed (about 66 KB with brotli). The python `http.server` serves it uncompressed (about 340–370 KB), which inflates simulated times.
  - On a plain-http origin, the old protocol-relative `//translate.google.com/...` script became `http://`. Port 80 is blocked on this box, so the request hung and Lighthouse reported NO_FCP on `main`.
- **Variants** (three servers side by side): `main` 728e8f5 (`https://localhost:8201`), `feat/phase2` f1724ef (`:8202`), `perf/lcp` (`:8203`). Each was run 3 times; the median is reported.
- **Back-end traffic during the Lighthouse runs:** the page made its normal **read-only** requests to production Firebase (Firestore listen channel, Identity Toolkit `getProjectConfig`). No writes were made, no form was submitted, and no account was used.
- Raw runs: `/workspace/strangepin-dev-tools/lh/runs/*.json`. Summary script: `node /workspace/strangepin-dev-tools/lh-summary.js <labels>`.

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
  - In an 8-run probe (`/workspace/strangepin-dev-tools/csp-probe.js`), the one violation coincided with that 302.
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
