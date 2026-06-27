# StrangePin 📍

**The world's first global mystery story map.**

> Every mystery has a place. Every Pin tells a story.

🌐 Live site: [strangepin.com](https://strangepin.com)

---

## What is StrangePin?

StrangePin is a community-powered mystery story map where every pin is a real location with a verified story. Users can explore haunted places, UFO sightings, ancient mysteries, energy spots, and unexplained phenomena from every country — and submit their own.

---

## Architecture

This is a **single-file HTML application**. No build step required.

```
strangepin/
├── index.html        ← Entire app (HTML + CSS + JavaScript)
├── manifest.json     ← PWA manifest
├── og-image.png      ← Social share preview image (1200×630)
├── README.md         ← This file
└── .gitignore        ← Git ignore rules
```

### Why single-file?

- Zero dependencies — no npm, no build tools, no Node.js
- Deploy anywhere that serves static files
- Edit one file, deploy one file
- Works offline as a PWA

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | Vanilla JavaScript (SPA with hash routing) |
| Maps | Leaflet.js v1.9.4 + CartoDB dark tiles |
| Auth | Firebase Authentication (Google Sign-In) |
| Database | Firebase Firestore |
| Image Upload | Cloudinary (unsigned upload) |
| Email | EmailJS |
| Translation | Google Translate widget |
| Hosting | Netlify (auto-deploy from GitHub) |
| PWA | Web App Manifest + geolocation |

---

## index.html Structure

The file is organized into clearly labelled sections:

```
Line 1–122      HTML <head> — meta tags, SEO, PWA, external CDN scripts
Line 122–600    <style> — all CSS (~475 lines)
Line 700–2400   LOCATIONS data — 99 mystery pins (JSON-like JS objects)
Line 2400–2454  Supporting data (LEADERBOARD, BADGE_STYLE, CAT_BADGE, CATEGORIES, LANGS)
Line 2454–2480  App state variables
Line 2480–2582  Google Translate integration
Line 2582–2664  Navigation (showPage, history API, popstate)
Line 2664–2743  Firebase stats (live pin/pinner counts)
Line 2743–2952  Reactions, Comments, Save/Favourite, Score helpers
Line 2952–3195  Nearby page (GPS geolocation)
Line 3195–3386  Profile page, Helpers, CAT_COVER
Line 3386–3414  renderPage() router
Line 3414–3648  renderHome()
Line 3648–3826  renderMap() + Leaflet map init
Line 3826–4175  renderSubmit() + EmailJS form
Line 4175–4405  renderDetail() — story page (The Story / What We Know / The Mystery)
Line 4405–4545  renderLeaderboard()
Line 4545–4838  renderAbout() + initApp()
```

---

## Deployment

Hosted on **Netlify** with automatic deployment from this GitHub repository.

- **Branch:** `main`
- **Build command:** *(none)*
- **Publish directory:** *(root)*

Every commit to `main` triggers an automatic deploy to [strangepin.com](https://strangepin.com).

---

## Content Model

Each location in the `LOCATIONS` array has:

```javascript
{
  id: "001",
  name: "Area 51",
  slug: "area-51",
  pinSeries: "Strange Pin #001",
  status: "Featured Story",        // Featured Story | Full Report | Short Pin | Community Submitted
  hook: "One-line attention hook",
  theStory: "Narrative summary",
  whatWeKnow: "Verified facts only",
  theMystery: "What remains unexplained",
  contentFlags: ["Sensitive", "Restricted Area"],
  safetyNote: "Public safety warning if needed",
  category: "UFO",
  coordinates: { lat: 37.235, lng: -115.811 },
  mysteryScore: 9.5,
}
```

---

## Firebase Config

Firebase credentials are embedded in `index.html`. The project uses:
- **Project ID:** `strangepin-4e538`
- **Auth:** Google Sign-In
- **Firestore:** users, points, badges collections
- **Authorized domains:** strangepin.com, strangepin.netlify.app

---

## Social

| Platform | Handle |
|---|---|
| TikTok | [@strangepins](https://tiktok.com/@strangepins) |
| Instagram | [@strange.pins](https://instagram.com/strange.pins) |
| X / Twitter | [@strangepin](https://x.com/strangepin) |
| YouTube | [@StrangePin](https://youtube.com/@StrangePin) |
| Email | thestrangepin@gmail.com |

---

## License

© 2026 StrangePin. All rights reserved.
