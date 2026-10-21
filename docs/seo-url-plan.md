# SEO URL plan: crawlable `/pins/<slug>/` pages

**Status:** this is a plan plus a working local prototype (`scripts/build-pins.js`). Nothing has been deployed and Netlify settings are unchanged.

## 1. Why
Every pin today lives at `/#detail/NNN`. Search engines ignore the `#fragment`, so all 99 pins collapse into a single URL (`/`). Only the homepage can be indexed, and there are no per-pin titles, descriptions, Open Graph previews or structured data.

**Goal:** one static, fast, crawlable HTML page per pin at `https://strangepin.com/pins/<slug>/`. The interactive SPA stays as it is.

## 2. Slug rules
1. Use the existing `slug` field when it matches `^[a-z0-9]+(-[a-z0-9]+)*$`. All 99 current slugs are valid and unique (TESTED: data check, 2026-10-21).
2. Otherwise derive the slug from `nameEn || name`:
   - apply NFKD and strip diacritics;
   - lowercase;
   - replace `&` with `and`;
   - join runs of `[a-z0-9]` with `-`;
   - trim leading and trailing `-`;
   - cap at 80 characters.
3. If two pins get the same slug, append `-<id>` deterministically (e.g. `point-pleasant-099`).
4. **Slugs are permanent.** A renamed pin keeps its slug; for example 073 keeps `the-lake-michigan-stonehenge` in `content/corrections`. If a slug must change, add a 301 in `_redirects`: `/pins/old/ /pins/new/ 301`.
5. Pin IDs never change. `pins-manifest.json` maps `id → slug`.

## 3. What each page contains
Implemented in the prototype.

- **`<title>`:** `{Name} — {Category} Mystery in {City, Country} | StrangePin`. All 99 titles are unique.
- **`<meta name="description">`:** `shortPreview` (or `fullStory`), cut at a word boundary to 160 characters or fewer.
- **`<link rel="canonical">`:** the absolute `https://strangepin.com/pins/<slug>/` (trailing slash, so it matches how Netlify serves directories).
- **Open Graph / Twitter:** `og:type=article`, `og:title`, `og:description`, `og:url` (= canonical), `og:image` 1200×630, `twitter:card=summary_large_image`.
- **JSON-LD** (`@graph`):
  - `Place`: name, description, `geo` (GeoCoordinates), `address.addressCountry`/`addressLocality`;
  - `Article`: headline, description, url, image, `about` → Place, `datePublished` (from `dateAdded`), publisher, `citation` (https sources only);
  - `BreadcrumbList`: StrangePin › Pins › Name.
  - **No `aggregateRating` or `review` markup.** Those would be built from placeholder counts (see `docs/trust-model-proposal.md`).
  - JSON-LD is serialised with `<`, `>` and `&` escaped as `\u003c`, `\u003e` and `\u0026`, so it cannot close its `<script>` tag.
- **Body:**
  - breadcrumb, H1, category/location/coordinates;
  - content warnings from `contentFlags`, plus `safetyNote`;
  - The Story / What We Know / The Mystery;
  - Timeline and Sources (https links only, `rel="noopener nofollow"`);
  - an "Open on the interactive map" link to `/#detail/NNN`;
  - up to 4 related pins in the same category (internal links);
  - the site disclaimer.
- **Escaping:** every value goes through `escapeHtml`; URLs go through `safeHttpsUrl`.
- **Weight:** no JavaScript and only inline CSS (the page is about 10 KB).

### og:image strategy
1. **Now:** the shared `/og-image.png` (1200×630, added in Phase 1).
2. **When a pin has an https `media.heroImageUrl`,** use it (already coded). No pin has one today.
3. **Later (optional):** generate per-pin cards at build time, e.g. `/og/<slug>.png`. Render an HTML template to PNG with a headless browser in CI, or use Netlify's image CDN. Keep those cards out of the SW precache.

## 4. Sitemap
The build writes `sitemap.xml` with `/`, `/pins/` and every pin page (`lastmod` = `dateAdded`). It replaces the hand-written Phase 1 sitemap, which lists only `/`. `robots.txt` already points to `/sitemap.xml`.

**Caveat:** all pins share `dateAdded: 2026-06-04` (placeholder). Once real edit dates exist, use a real `updatedAt`.

## 5. Redirects from `#detail/NNN`
- **The server never sees the fragment,** so `_redirects` cannot map `/#detail/001` to `/pins/area-51/`.
- **Plan (client-side; only after the static pages are live):**
  1. Keep `/#detail/NNN` working inside the SPA for shares and history. Do NOT force-redirect users who are on the map.
  2. In the SPA's `updateSEO()` for the detail view, set `<link rel="canonical">` to the pin's `/pins/<slug>/` (it is `https://strangepin.com/` today), using `pins-manifest.json` or the inline `slug`. This tells crawlers that render JavaScript which page is canonical.
  3. Change the share buttons (X/Facebook/copy link) to share `/pins/<slug>/`, so link previews get per-pin OG tags. Crawlers fetching social previews do not run JavaScript.
  4. Optional: a path-based alias `_redirects` rule `/detail/:id /pins/:slug/ 301` is NOT possible without a per-id rule. The build can emit one line per pin (`/detail/001 /pins/area-51/ 301`) if path-form links are ever introduced.
- **Static page → app:** the "Open on the interactive map" link uses `/#detail/NNN`. TESTED: clicking it opened the SPA detail view for 001.

## 6. Netlify implications
- **Today:** no build step. Netlify publishes the repo root as-is from `main`.
- **With the generator, a build step is needed.** Proposed `netlify.toml` (NOT added to the repo, because merging it changes how production builds):
  ```toml
  [build]
    command = "node scripts/build-pins.js --out dist --site https://strangepin.com"
    publish = "dist"
  [build.environment]
    NODE_VERSION = "20"
  [context.deploy-preview]
    command = "node scripts/build-pins.js --out dist --site $DEPLOY_PRIME_URL"
  ```
- **Deploy previews:** canonicals point at the preview host when built with `--site $DEPLOY_PRIME_URL`. Netlify also adds `X-Robots-Tag: noindex` to deploy previews by default (EXPECTED; check it on the first preview).
- **`_headers` and `_redirects`** must be in the publish directory. The generator copies them from the repo root.
- **Trailing slashes:** Netlify serves `/pins/x/index.html` at `/pins/x/`. Keep "Pretty URLs" on, and make the canonical include the trailing slash (it does).
- **Service worker:** `/pins/*` navigations fall back to `offline.html` when uncached (TESTED in `tests/pwa-offline.js`).
- **Build output:** `dist/` is git-ignored (already in `.gitignore`).

## 7. Prototype test results
TESTED: local, 2026-10-21, using the `feat/phase2` data.

| Check | Result |
|---|---|
| `node scripts/build-pins.js` | 99 pin pages + `/pins/` index + sitemap + manifest, about 0.1 s |
| `tests/seo-pages.test.js` | **16/16 PASS** (details below) |
| Browser: `dist/` served on :8092, `/pins/area-51/` | H1 and 6 sections render, no console errors; CTA → SPA detail 001 (`currentPage=detail`) |
| Lighthouse 12 on `/pins/area-51/` (local) | SEO 100, Accessibility 100 (after fixing CTA contrast), Best Practices 100. JSON: `/workspace/strangepin-dev-tools/lh/seo-pin-area-51.json` |

`tests/seo-pages.test.js` covers:
- slug rules and collision handling;
- unique titles, canonical, description length, OG and JSON-LD on all 99 pages, with `Place.geo` and no `aggregateRating`;
- hostile-data escaping (HTML, JSON-LD script close, link attributes);
- `sitemap.xml` parsing to 101 URLs;
- `html-validate` (standard preset, with `no-inline-style` and `long-title` relaxed) on 9 sample pages.

Screenshot: `docs/img/seo-pin-page.png`. It was taken before the CTA colour fix and before the `content/corrections` source fixes.

**NOT TESTED:**
- Google Search Console indexing and the Rich Results Test (needs a public URL);
- real social preview scrapers;
- the Netlify build itself.
