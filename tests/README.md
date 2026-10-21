# Tests

Local-only checks; nothing here talks to production Firebase, EmailJS or Cloudinary.

| File | What it checks | How to run |
|---|---|---|
| `helpers.test.js` | `escapeHtml`, `safeHttpsUrl`, `avatarInitial`, `safeDocId`, `avatarHtml`, `truncateAtWord`, `previewText` | `node tests/helpers.test.js` |
| `browser-smoke.js` | Firebase initialises (no `firebase is not defined`), deep links (`#detail/001`, `#detail/area-51`, `#map`, `#nearby`), featured timelines present, XSS payloads rendered through the real render functions (comments, leaderboard, profile, home live sections) stay inert, avatar fallback works | `python3 -m http.server 8080` in the repo root, then `npm i --no-save puppeteer-core` and `CHROME_PATH=/path/to/chrome node tests/browser-smoke.js` |

The browser test aborts requests to Firestore, Firebase Auth, EmailJS, Cloudinary and
Nominatim, and mocks Firestore/auth data in the page.
