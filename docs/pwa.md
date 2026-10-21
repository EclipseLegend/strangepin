# PWA: service worker, manifest, and test checklist

## What was added
- **`sw.js`**: a minimal service worker. See the header comment for the exact strategy.
  - Precaches the app shell.
  - Navigations: network-first, then the cached shell, then `/offline.html`.
  - Other same-origin requests: network-first. Pin data is inline in `index.html` (the stale `locations.js` copy was removed).
  - Same-origin images: cache-first.
  - Version-pinned Leaflet/MapLibre library URLs are cache-first.
  - **All other cross-origin requests are never intercepted.** That covers Firebase Auth/Firestore, `*.googleapis.com`, gstatic, EmailJS, Cloudinary, tiles, fonts and translate.
  - Same-origin `/__/auth/` and `/__/firebase/` paths are also excluded.
- **`offline.html`**: the fallback page (noindex).
- **Registration** in `index.html`:
  - only in a secure context (HTTPS, or `localhost`);
  - skipped with `?emulator=1` or `?nosw=1`, so local tests never run from cache.
- **`manifest.json`**:
  - added `id`, `scope`, `lang`, `dir`;
  - added a `maskable` 512 icon (`icon-maskable-512.png`: the existing icon on a padded `#07070e` background).
- **Apple touch icon**: `apple-touch-icon.png` (180×180, opaque) is now referenced relatively.
- **Release step:** bump `SP_SW_VERSION` in `sw.js` whenever precached files change. `_headers` serves `sw.js` with `Cache-Control: no-cache`.

## TESTED
Local `python3 -m http.server`, headless Google Chrome, 2026-10-21.

| Test | Result |
|---|---|
| `tests/pwa-offline.js` | **13/13 PASS** (details below) |
| `tests/pwa-installability.js` | **11/11 PASS** (details below) |

`tests/pwa-offline.js`:
- The service worker registers and controls the page.
- The shell files are precached and Leaflet is runtime-cached.
- **No** Firebase, googleapis, gstatic, EmailJS, Cloudinary, tile or translate URL is in any cache.
- **True offline check:** the server was killed and Chrome was relaunched with every host unresolvable.
  - `/#map` loads from cache and shows 99 markers.
  - An uncached path shows `offline.html`.
  - No page errors.

`tests/pwa-installability.js`:
- Chrome's own `Page.getInstallabilityErrors` returns `[]`.
- The manifest parses with no errors.
- Each icon fetched is a PNG of its declared size.
- All 3 shortcuts resolve to valid hash routes.

**Lighthouse:** Lighthouse 12 no longer has a PWA category, so the CDP installability check above was used instead. That is the same check DevTools' Application panel uses.

## EXPECTED (not verified)
- **Offline map:** shows markers on an empty background, because tiles are deliberately not cached. Sign-in, comments, reactions and submissions need the network.
- **Firestore offline:** Firestore's own offline persistence is not enabled, so offline reads of Firestore data fail gracefully (the console shows warnings).
- **`orientation`:** `portrait-primary` is kept unchanged. It locks installed Android apps to portrait, which the owner may prefer to change to `any` for the map.

## NOT TESTED: manual device checklist

### Android (Chrome)
1. Open the Netlify **deploy preview** URL (HTTPS) in Chrome on Android.
2. ⋮ menu → "Install app" / "Add to Home screen" should be offered.
3. Install, then check:
   - the icon looks correct (maskable, not cropped);
   - the name is "StrangePin".
4. Launch from the home screen and check:
   - it opens standalone (no URL bar);
   - the splash/background is dark `#07070e`.
5. Long-press the icon: the 3 shortcuts (Nearby, Map, Pin It) appear and open the right tab.
6. Turn on airplane mode and relaunch: the app shell and map markers load; the "offline" behaviour is acceptable.
7. Back online: sign-in with Google works from the installed app. The popup/redirect returns to the app.
8. Deploy a new version (bump `SP_SW_VERSION`), relaunch twice, and confirm the new version is served.

### iOS (Safari)
1. Open the preview URL in Safari, then Share → "Add to Home Screen".
2. Check:
   - the icon (apple-touch-icon 180) is opaque and not blank;
   - the title is "StrangePin".
3. Launch: standalone, the status bar style is black-translucent, and content is not hidden under the notch.
4. Google sign-in inside the standalone web app (a known iOS pain point): confirm the popup works or note the failure.
5. Airplane mode relaunch: the cached shell loads.
6. Check that the "Pin a Location" geolocation permission prompt works in standalone mode.

### Desktop
1. Chrome/Edge: the install icon appears in the address bar, and the app opens in its own window.
2. DevTools → Application → Service Workers / Cache Storage: only `sp-shell-<version>` and `sp-runtime-<version>` exist (currently v2), with no googleapis entries.
