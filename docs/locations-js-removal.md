# Removal of `locations.js`

- **Owner-approved** in Phase 3.
- Removed in a normal `git rm` commit on the technical branch. The file stays in git history: `git show 728e8f5:locations.js`.

## Evidence that nothing used it (TESTED, 2026-10-21 19:10 CEST)

| Check | Method | Result |
|---|---|---|
| App code (`index.html`, `offline.html`, `og-image.html`) | `rg "locations\.js"` | No `<script>`, `fetch`, `import` or other reference |
| Build/test scripts (`scripts/*.js`, `tests/*.js`) | `rg` | None. `scripts/build-pins.js` reads the inline `LOCATIONS` array from `index.html` |
| Service worker (`sw.js`) | `rg` + reading the precache list | Not precached. Only a code comment mentioned it, and that comment was updated |
| `manifest.json`, `sitemap.xml`, `robots.txt`, `_headers`, `firebase.json` | `rg` | No reference |
| Netlify config | `netlify.toml` did not exist before this phase. The new one does not reference it | — |
| Runtime | Headless Chrome with the service worker enabled; routes `#home #map #detail/001 #nearby #submit #leaderboard #about`; all requests logged (`/workspace/strangepin-dev-tools/no-locations-req.js`) | 89 requests, **0 to `locations.js`** |
| All branches | `git grep -l "locations\.js" <branch>` on `main`, `feat/phase2`, `perf/lcp` | Only docs (`README.md`, `PROJECT_HANDBOOK.md`, RC/docs). Those were updated in the same commit |

**NOT TESTED:** whether any external site or crawler links to `https://strangepin.com/locations.js`. After the deploy it returns 404, or whatever Netlify serves for missing files. EXPECTED impact: none for users.
