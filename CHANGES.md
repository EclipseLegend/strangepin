# Branch `fix/audit-critical`: change summary

- **Base:** `origin/main` @ 728e8f5 (byte-identical to production on 2026-10-21).
- **Status:** local only. Not pushed, no PR, nothing deployed, no accounts touched.
- **Patches:** `patches/` (`git format-patch origin/main..fix/audit-critical`).

> **Ship rule:** commits 1 (escaping) and 2 (Firebase init) must go to production together.
> Fixing Firebase alone would switch on stored-XSS paths that are dormant today.

## Commits

| # | Commit | What | Files |
|---|---|---|---|
| 1 | security: escape user-controlled data | See "Commit 1 detail" below | index.html |
| 2 | fix: initialise Firebase after deferred SDK scripts | The inline init ran before the `defer`red SDK, causing `firebase is not defined`. Now runs on `DOMContentLoaded`, with an idempotency guard | index.html |
| 3 | fix(data): stop placeholder stubs overriding authored fields | Pins 001–010 lost their authored `difficulty/tags/era/timeline/sources/connections/media` to a later empty stub. Removed the stubs and the duplicated block on 010. A field-level diff confirms that only those 7 fields changed, on those 10 pins | index.html |
| 4 | fix(ui): word-boundary previews | `truncateAtWord` and `previewText` re-derive the 12 mid-word-cut previews from `fullStory`. Used in cards, nearby, hero, map popup and meta description. Stored text is unchanged | index.html |
| 5 | seo: robots.txt + sitemap.xml | Sitemap lists the homepage only (see TODO) | robots.txt, sitemap.xml |
| 6 | fix(routing): deep links | See "Commit 6 detail" below | index.html |
| 7 | a11y + CLS | All submit-form labels linked with `for`/`id`. aria-labels on the language select, hamburger, comment box and map search. `#mainContent` gets `min-height:100vh` | index.html |
| 8 | assets | `og-image.png` rendered from the existing `og-image.html`. **Placeholder** `favicon.png`, `icon-192.png` and `icon-512.png` (white pin on the brand gradient). Manifest now uses the square icons. apple-touch-icon now points to the 192 px icon | *.png, manifest.json, index.html |
| 9 | tests | `tests/helpers.test.js` (no deps) and `tests/browser-smoke.js` (puppeteer-core) | tests/ |
| 10 | docs | `docs/content-corrections.md`: sourced factual and sensitivity proposals. **None applied** | docs/ |
| 11 | fix: SDK guard | Init no longer throws if one Firebase compat script fails to load | index.html, tests |

**Commit 1 detail.** New helpers: `escapeHtml`, `safeHttpsUrl` (https only), `avatarInitial`, `safeDocId`, `avatarHtml` and `spAvatarFallback`. They are applied to:
- comments (text, name, id, likes)
- home live pinners and latest community pins
- profile and leaderboard names and avatars
- the upload file name
- EmailJS error text
- the reflected map search value

Inline `onerror` handlers no longer contain user data. The leaderboard no longer falls back to other users' email local part.

**Commit 6 detail.** `parseHashRoute` runs on load and on state-less `popstate`. Supported routes:
- `#detail/<id>` and `#detail/<slug>`
- `#map`, including `#map?q=` from the JSON-LD SearchAction
- `#nearby`, `#submit`, `#leaderboard`, `#about`, `#profile`

Unknown routes fall back to home.

## Test results (local, 2026-10-21 ~15:45–16:00 Europe/Madrid)
- `node tests/helpers.test.js`: **7/7 pass**.
- `tests/browser-smoke.js` against `python3 -m http.server 8080`: **18/18 pass**. Covered:
  - no `firebase is not defined`; `window._db` and `fbSignIn` present
  - `#detail/001`, `#detail/area-51`, `#map` and `#nearby` open the right page; `#detail/999` falls back to home
  - 10 featured timelines are present
  - XSS payload `<img src=x onerror=…>` pushed through the real `renderCommentsList`, leaderboard listener, profile page and home live sections (mocked Firestore/auth) renders as text: 0 injected `<img>`, 0 executions, 0 dialogs
  - avatar fallback works
  - a missing Firestore SDK doesn't throw
- **Control run:** the same suite against the original production `index.html` fails 12 checks, including the injected `<img>` elements and the handler injection.
- All production back-ends (Firestore, Firebase Auth, EmailJS, Cloudinary, Nominatim) were **blocked** during the tests. Firestore and auth data were mocked in the page.
- **Lighthouse 12** (mobile, local http, same blocked URLs, single run each; treat as indicative):

| Run | Perf | A11y | Best practices | SEO | CLS | FCP | LCP |
|---|---|---|---|---|---|---|---|
| original | 53 | 91 | 79 | 100 | 0.813 | 3.9 s | 4.1 s |
| this branch | 67 | 94 | 79 | 100 | **0** | 3.0 s | 6.9 s |

  - **LCP looks worse but is a measurement artefact:** the element measured changed from the footer disclaimer (painted early, then shoved down) to the home stats bar. The remaining render delay comes from render-blocking Google Translate and fonts, which this branch doesn't change.
  - Best practices sits at 79 because the test ran over local http with blocked requests.

## Known limits / TODO (needs owner decision or later work)
- **Map tiles still show "API KEY REQUIRED".** The CARTO basemap needs a key or another provider. That means an account sign-up and possibly cost, so it's the owner's decision.
- **`timeline` and `sources` are restored in the data but not rendered.** The detail page has no Timeline/Sources section yet (README roadmap, Sprint 3).
- **Per-pin URLs:** pins only exist at hash routes. Search engines need clean paths (e.g. `/pins/area-51/`, via static pages or Netlify rewrites) before they can go in `sitemap.xml`.
- **Placeholder icons** need a final logo. The og-image tagline font falls back to a serif in headless rendering, so re-render from a desktop browser if needed. og-image.html still says "14 languages", while the widget lists 16.
- **Not changed (needs dashboard access or approval):**
  - Firestore security rules (client-side points/likes)
  - EmailJS `to_email` / allowed origins / reCAPTCHA
  - Cloudinary unsigned preset limits
  - security headers (`_headers`)
  - Firebase API-key referrer restrictions
- **Remaining a11y issues:** about 60 colour-contrast failures; emoji-only buttons elsewhere.
- **Protocol-relative Google Translate URL** (`//translate.google.com`): harmless on https, but could be made explicit `https://` in a follow-up.
