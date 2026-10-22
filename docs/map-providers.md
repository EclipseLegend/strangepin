# Map tile provider evaluation

Checked on **2026-10-21** (about 16:55–17:20, Europe/Madrid, CEST), using the official pages listed below. Nothing was signed up for and no keys were requested. Prices and terms change, so re-check these pages before you decide.

## Why this matters

The site currently loads `https://{s}.basemaps.cartocdn.com/dark_all/...` with no key.

- **TESTED** (local headless Chrome, 2026-10-21): CARTO now returns tiles that say "API KEY REQUIRED · carto.com/basemaps/apikey". See `docs/img/map-carto-legacy.png`.
- **Reason:** CARTO basemaps now require a key. Its plans page says: "Keys registered before 23 September 2026 and used commercially keep working until 30 November 2026."

## Comparison

| Provider | Dark style | Works with Leaflet | Commercial use on free tier | Free tier | Overage behaviour (surprise-bill risk) | Scalability | Official sources |
|---|---|---|---|---|---|---|---|
| **OpenFreeMap** | Yes: "Dark" (also Fiord, Positron) | Vector only. Needs MapLibre GL plus `@maplibre/maplibre-gl-leaflet` | Yes, explicitly | No limits, no keys, no registration | No billing at all, so no bill risk. No SLA. ToS: "may discontinue it at any time without notice" | Public CDN instance. You can self-host it (MIT) | https://openfreemap.org/ · https://openfreemap.org/tos/ (updated 2026-10-14) |
| **CARTO** (Dark Matter) | Yes: `dark_all` (the current look) | Native raster `L.tileLayer` | Yes: free commercial plan | Free non-commercial 5M requests/month. Free commercial 1M/month | The pages list plan quotas only. Commercial $500/mo (10M), Plus $1,500/mo (50M). The pages say nothing about automatic overage billing (**unverified**) | Good (CDN). Keys can be restricted by domain | https://carto.com/basemaps · https://dashboard.basemaps.carto.com/v1/plans · https://carto.com/legal/basemap-terms/ (version 2026-09-29) |
| **Stadia Maps** | Yes: Alidade Smooth Dark | Raster and vector | **No.** The free tier is non-commercial | 200k credits/month (1 credit per tile) | Free tier has "no additional usage". Starter $20/mo (1M) adds +3¢ per 1,000. The page says "usage caps prevent billing shock" | Good | https://stadiamaps.com/pricing/ |
| **MapTiler** | Yes: Dataviz Dark, Streets Dark | Raster and vector | **No.** Free is non-commercial/testing, and the logo is required | 100k requests / 5k sessions | Free tier pauses at quota (hard cap). Flex $30/mo bills overage automatically ($0.15 per 1k requests), but you can set a spending limit | Good | https://www.maptiler.com/cloud/pricing/ |
| **Thunderforest** | Not confirmed on the fetched page | Raster | Hobby tier only (non-commercial) | 150k tiles/month | Paid plans: Solo $125/mo (1.5M), Small Business $255/mo (15M). The page says "no surge charges" | Good | https://www.thunderforest.com/pricing/ |
| **Esri** (ArcGIS Location Platform) | Yes: Dark Gray Canvas | Yes, via the Esri Leaflet plugin | Account required | 2M basemap tiles/month free | "2M free then $0.15 per 1,000 tiles". The page doesn't say whether the free tier is a hard cap (**unverified**) | Enterprise-grade | https://location.arcgis.com/pricing/ |
| **Mapbox** | Yes: Dark | Raster via the Static Tiles API, or vector via mapbox-gl | Yes | Vector Tiles API: up to 200,000/month free | Pay-as-you-go above the free tier. Needs an account. The page doesn't confirm whether a card is required (**unverified**) | Excellent | https://www.mapbox.com/pricing |
| **Protomaps** (self-hosted PMTiles) | Yes: "dark" flavor | Vector, via MapLibre (or the protomaps-leaflet renderer) | Yes (ODbL attribution) | Depends on your hosting. Planet file is about 120 GB (z0–15). Regional extracts are possible with `pmtiles extract` | Only your own storage and bandwidth bill | Fully under your control. Hotlinking the demo builds is discouraged | https://docs.protomaps.com/basemaps/downloads |

## Recommendation (EXPECTED, owner decides)

- **Primary: OpenFreeMap "dark".** It needs no key, no account and no billing relationship, so it cannot produce a surprise charge. Commercial use is allowed. It looks very close to the current CARTO dark style.
  - **Main risk:** there is no SLA, and the service can be discontinued.
  - **Cost:** about 1 MB of extra JS (MapLibre, loaded lazily only when a map is shown), and it needs WebGL.
- **Fallback: CARTO Dark Matter with a domain-restricted key** on the free commercial plan (1M requests/month).
  - The owner requests the key by e-mail. That is a dashboard/owner action and was not done here.
  - The code already supports it: set `SP_BASEMAP='carto-key'` and `SP_CARTO_KEY`.
  - When `openfreemap-dark` fails to load (no WebGL, CDN down) and a key is set, the code falls back to keyed CARTO automatically.
- **Long-term option if traffic grows or the SLA matters:** self-host Protomaps PMTiles. A dark-styled regional/planet extract on object storage or CDN removes the third-party dependency.

## Shipped configuration (`feat/phase3` / technical PR)

`SP_BASEMAP = 'openfreemap-dark'`. `addBasemap()` tries each step and **detects** failure before moving on:

| Step | Basemap id | Used when | Failure detected by |
|---|---|---|---|
| 1 | `openfreemap-dark` | Primary. MapLibre GL 5.24.0 + maplibre-gl-leaflet 0.1.4 from unpkg (SRI), style `tiles.openfreemap.org/styles/dark` | No WebGL context; script load error (CDN down / SRI mismatch); MapLibre `error` before the style loads; style not loaded within 10 s |
| 2 | `carto-key` | Only if `SP_CARTO_KEY` is set (owner-requested, domain-restricted key) | 4 tile errors, or no tile within 10 s |
| 3 | `osm-dark` | Keyless OpenStreetMap Standard raster (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`), darkened with a CSS filter | 4 tile errors, or no tile within 10 s |
| 4 | `none` | Everything failed | Friendly English overlay: "Map tiles are unavailable right now…" with a **Try again** button. Markers stay on the map |

The basemap actually used is exposed as `data-basemap` on the map container.

The keyless CARTO URL (`carto-legacy`) was **removed** from the chain. It returns images that say "API KEY REQUIRED", so it "loads" successfully and cannot be detected as a failure.

**Override for testing:** on `localhost` / `127.0.0.1` only, `?basemap=<id>` starts the chain at that step.

### OSM tile usage policy check

Source: https://operations.osmfoundation.org/policies/tiles/, read 2026-10-21.

- Normal interactive viewing by a human on a public website is **permitted**. Requirements, and how the code meets them:
  - **Exact https URL:** used as written.
  - **Visible attribution:** "© OpenStreetMap contributors" in the Leaflet attribution control.
  - **Valid Referer:** sent. `_headers` sets `Referrer-Policy: strict-origin-when-cross-origin`, which sends the origin cross-site.
  - **No no-cache headers:** none are sent.
  - **No bulk or offline prefetch:** `sw.js` never intercepts or caches cross-origin tiles. TESTED: `tests/pwa-offline.js` asserts that no `openstreetmap` URL is cached.
- **Risks (EXPECTED):**
  - It is best-effort, with no SLA.
  - Access can be withdrawn without notice, and the policy warns commercial services in particular.
  - That is acceptable for a **fallback** that is used only when OpenFreeMap fails. It is not acceptable as the primary basemap for a growing site.
- The CSS dark filter only changes how tiles are displayed. Attribution stays unfiltered and visible.

### TESTED

Run: `tests/map-fallback.js`, 30/30, 2026-10-21 ~19:05 WEST (Europe/Lisbon), headless Chrome, static server on :8080. Failure modes were forced by aborting host requests or launching Chrome without WebGL.

- **OSM and CARTO tiles in this test:** mocked, i.e. served from a local PNG, so the test never sends automated traffic to `tile.openstreetmap.org` and needs no CARTO key.
- **OpenFreeMap:** reached for real (read-only) where it is expected to work.
- **CARTO key:** injected into the served HTML only inside the test.

| Scenario | Expected basemap | Result |
|---|---|---|
| WebGL (SwiftShader), all hosts reachable | `openfreemap-dark` | PASS, 99 markers, OFM/OpenMapTiles/OSM attribution |
| unpkg MapLibre blocked | `osm-dark` | PASS |
| `tiles.openfreemap.org` blocked | `osm-dark` | PASS |
| Chrome without WebGL | `osm-dark` | PASS |
| OFM blocked + `SP_CARTO_KEY` set | `carto-key` | PASS |
| OFM + OSM blocked | `none` + overlay | PASS, overlay text present, 99 markers still shown |
| Submit mini-map, OFM + OSM blocked | `none` + overlay | PASS |

None of the scenarios produced an uncaught page error.

Screenshots:
- `docs/img/map-osm-dark.png`. This one screenshot loaded about one viewport of **real** OSM tiles at zoom 2, once, comparable to a single human page view.
- `docs/img/map-all-failed.png`
- `docs/img/map-openfreemap-dark.png` (Phase 2)

### NOT TESTED / EXPECTED

- **NOT TESTED:**
  - real CARTO keyed tiles (no key exists);
  - real mobile GPUs;
  - a provider that **hangs** instead of refusing. EXPECTED: that adds up to 10 s per step before the next one is tried.
- **EXPECTED (CSP):** `img-src https:` covers OSM/CARTO tiles. `connect-src` includes `tiles.openfreemap.org`. `worker-src blob:` covers MapLibre. TESTED Report-Only: the `#map` and `?basemap=osm-dark#map` routes in `tests/csp-report-only.js` report 0 violations.
