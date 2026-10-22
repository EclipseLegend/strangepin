# StrangePin — Project Handbook

**Version:** Post Performance Fix 1
**Last Updated:** 2026-06-28
**Status:** Active development
**Live site:** strangepin.com

> This document reflects the current implementation only.
> It is generated from a direct audit of the source code.
> Do not add speculative or future content to this document.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Current Database Structure](#2-current-database-structure)
3. [Existing Components](#3-existing-components)
4. [Routing](#4-routing)
5. [Current Features](#5-current-features)
6. [Sprint History](#6-sprint-history)
7. [Current Engineering Rules](#7-current-engineering-rules)
8. [Known Technical Debt](#8-known-technical-debt)
9. [Approved Future Roadmap](#9-approved-future-roadmap)
10. [Current File Structure](#10-current-file-structure)

---

## 1. Project Overview

### What StrangePin Is

A cinematic exploration platform for mysterious, haunted, and unexplained locations worldwide. Users can browse curated Pins, submit their own, react to content, leave comments, and track their activity on a leaderboard.

### Overall Architecture

StrangePin is a **monolithic single-page application** delivered as one HTML file. There is no build system, no module bundler, no framework, and no server-side rendering. The entire product — routing, data, CSS, render logic, and Firebase integration — lives inside `index.html`.

```
Browser requests strangepin.com
    → Netlify serves index.html (one file, ~320 KB)
    → Browser parses HTML and inline CSS
    → Browser downloads 6 external scripts (deferred, in parallel)
    → DOMContentLoaded fires → initApp() runs → renderHome() paints
    → Firebase IIFE initialises auth and Firestore in background
```

### Technology Stack

| Layer | Technology | Version | How loaded |
|---|---|---|---|
| Map rendering | Leaflet | 1.9.4 | CDN (unpkg), `defer` |
| Authentication | Firebase Auth (compat SDK) | 10.12.0 | CDN (gstatic), `defer` |
| Database | Firebase Firestore (compat SDK) | 10.12.0 | CDN (gstatic), `defer` |
| Image uploads | Cloudinary | — | Unsigned upload via `fetch()` |
| Pin submissions | EmailJS | 4.x | CDN (jsdelivr), `defer` |
| Translation | Google Translate widget | — | CDN (translate.google.com), **blocking** |
| Fonts | Google Fonts | — | CDN, `display=swap` |
| Hosting | Netlify | — | Auto-deploy from GitHub |
| PWA | Web App Manifest | — | `manifest.json` |

### Fonts in Use

| Family | Weights loaded | Used for |
|---|---|---|
| Syne | 400, 600, 700, 800 | All headings, logo, titles |
| DM Sans | 300, 400, 500, 600 | Body text, UI labels |
| JetBrains Mono | 400, 500 | Coordinates, scores, mono labels, section headers |

### Current Deployment

- **Repository:** GitHub (connected to Netlify for auto-deploy)
- **Hosting:** Netlify
- **Deploy trigger:** Every push to the main branch
- **No build step:** Netlify serves `index.html` directly
- **Domain:** strangepin.com
- **PWA:** Configured as `display: standalone`, theme colour `#07070e`

### Folder Structure (current repository root)

```
/
├── index.html          ← Entire application
├── manifest.json       ← PWA manifest
├── og-image.html       ← Open Graph image source (rendered externally to og-image.png)
├── README.md           ← Repository documentation
└── .gitignore
```

---

## 2. Current Database Structure

### Two Separate Data Sources

StrangePin currently has a **split data architecture**. Curated pins and community-submitted pins are in separate, unreconciled stores.

| Source | What it contains | How accessed |
|---|---|---|
| `LOCATIONS[]` in `index.html` | All 99 curated Pins | JavaScript array, in-memory at load |
| Firestore `pins` collection | Community-submitted Pins | Async Firestore queries |

These two sources are never merged. The map, detail page, and all card rendering only use `LOCATIONS[]`. Community submissions go to Firestore but have no public detail page.

---

### Pin Data Structure (LOCATIONS[] schema)

Every entry in `LOCATIONS[]` follows this structure. Fields marked **SP-001** were added in Sprint 1.

```js
{
  // ── Identity ─────────────────────────────────────────────────────────
  id:          "001",                    // String, zero-padded, unique
  name:        "Area 51",               // Display name (may be localised)
  nameEn:      "Area 51",               // English canonical name
  slug:        "area-51",               // URL-safe identifier
  pinSeries:   "Strange Pin #001",      // Series label (Featured/Full only)
  status:      "Featured Story",        // See Pin Status values below

  // ── Location ─────────────────────────────────────────────────────────
  country:     "USA",
  countryCode: "US",                    // ISO 2-letter or "--" for ocean
  city:        "USA",                   // NOTE: often equals country (known debt)
  coordinates: { lat: 37.235, lng: -115.8111 },

  // ── Classification ───────────────────────────────────────────────────
  category:      "UFO",                 // See Category values below
  categoryColor: "teal",               // See Category Color values below
  verified:      true,                  // Boolean
  featured:      true,                  // Boolean — appears on homepage
  contentFlags:  [],                   // Array of strings — see Content Flags below

  // ── Metrics ──────────────────────────────────────────────────────────
  reports:      280,                    // Community report count
  mysteryScore: 9.5,                   // 0–10 float
  intensityAvg: 9.0,                   // Average strangeness rating 0–10

  // ── Content ──────────────────────────────────────────────────────────
  hook:         "The U.S. government denied this place existed for 60 years.",
  shortPreview: "A classified U.S. Air Force base...",  // ~160 chars
  fullStory:    "A classified U.S. Air Force base...",  // Same as shortPreview on most pins
  theStory:     "In the remote Nevada desert...",       // Long narrative (Featured/Full only)
  whatWeKnow:   "Area 51 is a classified...",           // Verified facts (Featured/Full only)
  theMystery:   "What is tested there today...",        // Open questions (Featured/Full only)
  safetyNote:   "Active military installation...",      // Optional safety note

  // ── SP-001 Schema Extension (added Sprint 1) ─────────────────────────
  difficulty:   "Deep",                // "Easy" | "Moderate" | "Deep" | null (Short Pins)
  tags:         ["government","UFO"],  // String array; empty [] on Short Pins
  era:          "1955 – present",      // Human-readable period; "" on Short Pins
  timeline: [                          // Empty [] on Short Pins
    { date: "1955", event: "Base established to test the U-2 spy plane." },
  ],
  sources: [                           // Empty [] on Short Pins
    { type: "Government Document", title: "CIA Declassified History...", url: "https://..." },
  ],
  connections: {                       // All empty arrays on Short Pins
    relatedPinIds:  ["008","017","003"],
    relatedTopics:  ["Cold War secrecy","UFO phenomena"],
    relatedPeople:  ["Bob Lazar","Annie Jacobsen"],
    relatedEvents:  ["Roswell Incident (1947)"],
  },
  media: {
    heroImageUrl: "",                  // Empty string — no images yet
    gallery:      [],                  // Empty array — no images yet
  },

  // ── Community ────────────────────────────────────────────────────────
  stories:   [],                       // Community reports — always empty (not yet populated)
  dateAdded: "2026-06-04",

  // ── Vestigial (technical debt) ────────────────────────────────────────
  pinPos:    { left: "50%", top: "50%" }, // Leftover from pre-Leaflet map, unused
}
```

### Pin Status Values

| Value | Count | Meaning |
|---|---|---|
| `"Featured Story"` | 5 | Full content: theStory, whatWeKnow, theMystery, Sprint 1 schema |
| `"Full Report"` | 5 | Full content: same fields as Featured Story |
| `"Short Pin"` | 89 | shortPreview only; Sprint 1 schema stubs (empty arrays) |

### Pin Category Values

| Category | Count | CSS color variant |
|---|---|---|
| `"Strange Experience"` | 46 | purple |
| `"UFO"` | 15 | teal |
| `"Haunted"` | 15 | purple |
| `"Energy Spot"` | 14 | amber |
| `"Urban Legend"` | 9 | amber |

### Content Flag Values

String values that can appear in `contentFlags[]`:

- `"Dangerous Location"` — triggers a safety warning banner
- `"Restricted Area"` — triggers a safety warning banner
- `"Sensitive"` — triggers a safety warning banner
- `"Tragic Event"` — triggers a safety warning banner
- `"Legend Only"` — disputed content notice
- `"Disputed Claim"` — disputed content notice

### Firestore Collections

| Collection | Purpose | Status |
|---|---|---|
| `users` | User profiles, points, badge, history | Active |
| `pins` | Community-submitted Pins | Active (write only — no public read UI) |
| `pins/{id}/reactions` | Per-pin reaction counts by type | Active |
| `pins/{id}/comments` | Per-pin discussion comments | Active |

### User Document Schema (Firestore `users` collection)

```js
{
  uid:         "...",
  displayName: "...",
  email:       "...",
  photoURL:    "...",
  points:      0,
  pins:        0,           // count of submitted pins
  badge:       "Curious",
  // Future-ready fields (not yet active in UI):
  badges:      [],
  followers:   [],
  achievements:[],
  country:     "",
  createdAt:   Timestamp,
  lastActive:  Timestamp,
  version:     "1.0",
}
```

### Gamification: Points and Levels

Defined in the Firebase IIFE via `window.SP_POINTS` and `window.SP_LEVELS`.

**Points per action:**

| Action | Points |
|---|---|
| Submit a pin | 10 |
| Add a photo | 5 |
| Add a video | 20 |
| Verify a pin | 5 |

**Level thresholds:**

| Level | Min points | Icon |
|---|---|---|
| Curious | 0 | 🔍 |
| Witness | 50 | 👁️ |
| Seeker | 150 | 🌀 |
| Strange Keeper | 350 | 📍 |
| Phantom | 700 | 👻 |
| Legend | 1200 | ⚡ |

### Leaderboard

`const LEADERBOARD` is a **hardcoded array** of 10 placeholder users. The live leaderboard reads from Firestore `users` collection ordered by `points desc`, but the fallback display is this static data. Real-time updates are triggered by `startLiveLeaderboard()` via `onSnapshot`.

### i18n / Language System

`const LANGS` contains UI string translations for **4 languages**:

| Key | Language |
|---|---|
| `en` | English |
| `ja` | Japanese |
| `ko` | Korean |
| `es` | Spanish |

Selected language stored in `localStorage` as `sp_lang`. Google Translate widget handles page-level translation for all other languages.

---

## 3. Existing Components

All components are JavaScript functions that return HTML strings. They are compatible with the existing `innerHTML` render model.

### SP Component Library (Sprint 1A)

These are the formal reusable components introduced in Sprint 1A. All use CSS custom properties from `:root` — no hardcoded hex values.

---

#### `SP_Badge(text, variant, prefix)`

**Purpose:** Renders a typed pill-shaped label.

**Parameters:**
- `text` — label string
- `variant` — `'purple'` | `'teal'` | `'amber'` | `'green'` | `'muted'` | `'orange'`
- `prefix` — optional emoji or character prepended to text

**CSS classes:** `.sp-badge`, `.sp-badge--{variant}`

**Used in:** `SP_PinHero()`, `renderDetail()`

---

#### `SP_Button(label, onclick, variant, sm, extraCss)`

**Purpose:** Renders a token-driven button with consistent hover states.

**Parameters:**
- `label` — button text (may include emoji)
- `onclick` — JS expression string
- `variant` — `'primary'` | `'secondary'` | `'ghost'`
- `sm` — boolean, compact size
- `extraCss` — optional inline style string

**CSS classes:** `.sp-btn`, `.sp-btn--{variant}`, `.sp-btn--sm`

**Used in:** `SP_PinHero()`, `renderDetail()`

---

#### `SP_SectionTitle(title, subtitle, action)`

**Purpose:** Renders a consistent section heading with optional subtitle and right-side action element.

**Parameters:**
- `title` — main heading text
- `subtitle` — optional subtitle paragraph
- `action` — optional HTML for right side (e.g. a count badge)

**CSS classes:** `.sp-section-header`, `.sp-section-title`

**Used in:** `renderDetail()` (Community Reports, Nearby Pins headings)

---

#### `SP_QuickFact(icon, label, value)`

**Purpose:** Renders a single metadata chip. Returns empty string if `value` is falsy (chips are suppressed when data is missing).

**Parameters:**
- `icon` — emoji
- `label` — short uppercase label (e.g. `'Country'`)
- `value` — display value

**CSS classes:** `.sp-quick-fact`, `.sp-quick-fact-icon`, `.sp-quick-fact-label`, `.sp-quick-fact-value`

**Used in:** `SP_QuickFacts()`

---

#### `SP_QuickFacts(loc)`

**Purpose:** Renders the full metadata chip strip below the hero on the Pin Detail page. Conditionally shows: Country, Region, Category, Era, Depth (difficulty), Mystery Score, Reports, Read time, Coordinates, and an Open Maps anchor link.

**Reading time:** Computed from `fullStory` word count at 200 wpm. Minimum 1 minute. Only shown if word count > 30.

**Maps link:** Deep links to `https://www.google.com/maps/search/?api=1&query={lat},{lng}`. Rendered as an `<a>` tag, not a plain chip.

**CSS classes:** `.sp-quick-facts` (wrapping flex container)

**Used in:** `renderDetail()`

---

#### `SP_PinHero(loc, saved)`

**Purpose:** Full-bleed cinematic hero section for the Pin Detail page. Implements SP-002 §1. Internally composes `SP_Badge()` and `SP_Button()`.

**Visual structure:**
1. Background layer — category gradient (`CAT_COVER`) + dot-grid texture + 4-stop vignette
2. Decorative category emoji (large, low-opacity, blurred)
3. Mystery score badge — glassmorphism, top-right corner
4. Explorer Gold accent line — bottom edge
5. Content layer — badges row, title (H1), location line, hook/pull-quote, stats row, CTA actions

**Primary CTA:** "📡 Start Exploring Nearby" → `showPage('nearby')`

**Ghost CTAs:** Save Pin (with live saved state), Add Report, Share (via `navigator.share`)

**CSS classes:** `.pin-hero`, `.pin-hero__*` (scoped BEM naming)

**Used in:** `renderDetail()`

---

### Legacy Components (Pre-Sprint 1A)

These exist in the codebase but predate the SP Component Library. They are not token-driven and are not part of the formal component system.

---

#### `locationCard(loc, compact)`

**Purpose:** Renders a Pin card for use in grids on the Homepage, Map sidebar, and Nearby page. The only reusable component from the original codebase.

**Renders:** Category colour bar, card image placeholder (emoji), title, location meta, shortPreview text, mystery score, reports count, and a "Read more →" link.

**Parameters:**
- `loc` — a LOCATIONS entry
- `compact` — boolean; when true, omits the preview text

**Used in:** `renderHome()`, `renderMap()`, `renderNearby()`

---

#### `scoreRing(score, color, size)`

**Purpose:** Renders an SVG circular progress ring displaying a mystery score.

**Used in:** `renderLeaderboard()`, `renderProfile()`

---

#### `renderCommentsList(pinId)`

**Purpose:** Fetches and renders comments from Firestore for a given pin. Called after `renderDetail()` paints the page.

**Used in:** `renderDetail()` (called via `setTimeout` after render)

---

## 4. Routing

### Router Architecture

StrangePin uses a **manual client-side hash router**. There is no routing library. The entire routing system is implemented in two functions: `showPage()` and `renderPage()`.

### `showPage(page, data)`

The single entry point for all navigation. Does five things in order:

1. Sets `currentPage` and optionally `currentDetail`
2. Calls `updateSEO(page, data)` — updates `<title>`, meta description, OG tags
3. Updates `.active` class on nav links and bottom tab bar buttons
4. Calls `window.history.pushState()` to update the URL hash
5. Calls `renderPage()` then scrolls to top

### `renderPage()`

Reads `currentPage` and calls the matching render function. Also manages cleanup: destroys the Leaflet map instance when leaving the map page, destroys the submit map when leaving the submit page, and unsubscribes the Firestore leaderboard listener when leaving the leaderboard.

### Route Table

| `currentPage` value | URL hash | Render function | Notes |
|---|---|---|---|
| `'home'` | `#` | `renderHome(lang)` | Default page |
| `'map'` | `#map` | `renderMap(lang)` | Initialises Leaflet after render |
| `'submit'` | `#submit` | `renderSubmit(lang)` | Initialises submit map after render |
| `'detail'` | `#detail/{id}` | `renderDetail(lang)` | Requires `currentDetail` to be set |
| `'leaderboard'` | `#leaderboard` | `renderLeaderboard(lang)` | Starts Firestore live listener |
| `'about'` | `#about` | `renderAbout(lang)` | Static content |
| `'profile'` | `#profile` | `renderProfile()` | Requires Firebase auth |
| `'nearby'` | `#nearby` | `renderNearby()` | Requests geolocation |

### Deep Links and Back Button

`window.addEventListener('popstate')` handles browser back/forward. When the user presses back, the handler reads `event.state.page` and `event.state.detailId`, restores `currentPage` and `currentDetail`, and calls `renderPage()`. Deep links to pin detail pages are restored by looking up the pin by ID in `LOCATIONS`.

### Navigation Entry Points

| Element | Location | Action |
|---|---|---|
| Logo click | Desktop nav | `showPage('home')` |
| Nav link buttons | Desktop nav | `showPage(page)` |
| Mobile hamburger menu | Mobile nav | Opens mobile menu |
| Mobile menu links | Mobile menu | `showPage(page)` then `closeMobile()` |
| Bottom tab bar | Mobile (fixed, 5 tabs) | `showPage(page)` |
| Footer links | All pages | `showPage(page)` |
| `locationCard` click | Homepage, Map, Nearby | `showPage('detail', loc)` |
| Nearby big card click | Nearby page | `showPage('detail', loc)` |
| Hero CTA button | Homepage | `showPage('map')` |

---

## 5. Current Features

### Homepage

- Cinematic hero section with animated text, tagline, and two CTA buttons (Explore Map, Pin a Location)
- Animated background orbs (CSS keyframes)
- Category filter pills — filters the pin grid by category
- Featured Pins section — `LOCATIONS.filter(l => l.featured)` — shows featured pins in a 3-column card grid
- Trending section — `[...LOCATIONS].sort((a,b) => b.reports - a.reports).slice(0, 3)`
- Latest section — `[...LOCATIONS].sort((a,b) => new Date(b.dateAdded) - ...).slice(0, 4)`
- Stats bar — shows total pin count, country count, and community metrics (reads Firestore)
- "How it works" 4-step explainer
- CTA section with "Pin a Mystery" button
- Footer with navigation links, social links, and legal disclaimer
- Mobile: horizontal scroll card rows (Netflix-style), bottom tab bar navigation

### Map Page

- Full-width Leaflet map with CARTO dark tile layer
- All 99 LOCATIONS pins rendered as Leaflet markers with category-coloured icons
- Click marker → popup with pin name, category badge, and "View Pin" button
- Search input — filters displayed markers and sidebar list by name/country/category
- Category filter buttons — filter markers and list
- Sidebar card list — scrollable, shows filtered pins
- Map and list stay in sync — filtering updates both simultaneously
- Mobile: map stacks above card list

### Pin Detail Page

- **`SP_PinHero`** — cinematic full-bleed hero with category gradient, mystery score badge, hook/pull-quote, stats (reports, strangeness, mystery score), primary CTA, and ghost action buttons (Save, Add Report, Share)
- **`SP_QuickFacts`** — metadata chip strip: Country, Region, Category, Era, Depth, Mystery Score, Reports, Read time, Coordinates, Open Maps link
- Story section — "The Story" narrative text (Featured/Full pins only)
- "What We Know" section — verified facts (Featured/Full pins only)
- "The Mystery" section — open questions (Featured/Full pins only)
- Location section — city + country + coordinates
- Safety warning banner — shown when `contentFlags` contains danger-related values
- Reactions bar — 5 reaction types (Interesting, Creepy, UFO, Unexplained, Favorite); state persisted in `localStorage`; counts synced to Firestore
- Community Reports — renders `loc.stories[]` (currently always empty)
- Discussion / Comments — fetches from Firestore `pins/{id}/comments`; authenticated users can post
- Nearby Pins — `getNearbyPins(loc, 3)` — 3 geographically nearest pins by Haversine distance

### Submit Page

- Multi-step pin submission form
- Category selector (6 visual category buttons)
- Location picker — embedded Leaflet map; click to place pin; reverse geocodes via OSM Nominatim
- Strangeness intensity slider (0–10)
- Image upload — Cloudinary unsigned upload
- Form validation with error display
- On submit: sends email via EmailJS to `thestrangepin@gmail.com` and writes to Firestore `pins` collection
- Success state with confirmation message

### Nearby Page

- "Find Mysteries Near Me" button — requests browser geolocation
- On permission granted: sorts all 99 LOCATIONS by Haversine distance from user, shows nearest pins with distance badges
- Distance filter tabs (5km, 25km, 100km, 500km, All)
- Pin cards with category icon, name, distance, city/country, and mystery score

### Leaderboard Page

- Live leaderboard from Firestore — reads `users` ordered by `points desc`, limit 20
- Shows rank, username, badge, pin count, points, country
- Hardcoded fallback data (`const LEADERBOARD`) shown if Firestore hasn't loaded
- User level system displayed with `scoreRing` SVG component
- Real-time updates via Firestore `onSnapshot`

### Profile Page

- Only accessible when signed in (redirects to home if not authenticated)
- Shows user avatar, display name, badge, points, level progress
- Saved Pins section — pins saved to `localStorage` under `sp_saved`
- Level progress bar showing points to next level

### About Page

- Static informational page about StrangePin
- Mission statement, feature overview, category descriptions, CTA

### Authentication

- Google sign-in via Firebase Auth (`signInWithPopup`)
- Sign-in/out state reflected in nav button
- On sign-in: creates or updates user document in Firestore `users` collection
- Points, badge, and level info loaded from Firestore on auth state change

### Save Pins

- Save/unsave any pin from the Detail page
- State persisted in `localStorage` under key `sp_saved` as a JSON array of pin IDs
- Saved pin IDs readable from `renderProfile()`

### Reactions

- 5 reaction types per pin
- User's reaction state persisted in `localStorage` under `sp_reactions`
- Reaction counts written to and read from Firestore `pins/{id}/reactions` subcollection
- UI updates immediately on click; Firestore sync is background

### Comments / Discussion

- Per-pin comment thread
- Reads from Firestore `pins/{id}/comments`
- Write requires Firebase Auth sign-in
- Comments include display name, timestamp, and text
- Rendered by `renderCommentsList(pinId)` called after page paint

### SEO and Meta

- `updateSEO(page, data)` called on every navigation
- Updates: `<title>`, `meta[name="description"]`, `meta[property="og:title"]`, `meta[property="og:description"]`
- Per-pin SEO: title becomes `"{Pin Name} — {Category} Mystery | StrangePin"`; description is the first 160 chars of `shortPreview`
- JSON-LD structured data for the site in `<head>`
- Canonical URL set to `https://strangepin.com/`
- Open Graph and Twitter Card meta tags in `<head>`

### Internationalisation

- 4 languages in `const LANGS`: English, Japanese, Korean, Spanish
- Language preference stored in `localStorage` under `sp_lang`
- Google Translate widget handles page-level translation for all other languages
- Custom translate bar UI — hides Google's native widget, shows a minimal branded bar
- Language selection available in desktop dropdown and mobile grid

### Progressive Web App

- `manifest.json` defines: name, short name, description, `display: standalone`, `background_color: #07070e`, `theme_color: #07070e`, portrait orientation
- 3 PWA shortcuts: Nearby Mysteries, Explore Map, Pin a Location
- Apple PWA meta tags for iOS home screen support
- No service worker currently registered

### Page Transition Animation

- `@keyframes fadeUp` — every page fades in from `translateY(10px)` to `translateY(0)` over 0.35s
- Applied via `.page` class set on `#mainContent` at the start of every `renderPage()` call

---

## 6. Sprint History

### Sprint 0 — Architecture Review

**Goal:** Understand the system before changing anything. No code changes.

**What was assessed:**
- Full audit of `index.html` (4,838 lines at the time)
- Technology stack identified
- All render functions catalogued
- Data model gaps vs. SP-001 documented
- Pin Detail page sections mapped against SP-002

**Key findings:**
- Monolithic single-file SPA architecture
- Production syntax bug found: Pin #099 embedded inside `REACTION_TYPES` array with a double comma
- `LOCATIONS[]` and Firestore are separate, unreconciled data sources
- Six blocking external scripts in `<head>` (no `defer` or `async`)
- Discovery Engine (SP-002 §7) had no implementation — showed only geographically nearest pins with no reason tags
- 6 of 8 MVP Pin Detail sections missing
- `pinPos` field on every pin is vestigial

**Deliverable:** Written gap analysis, phased migration plan, no code changes.

---

### Sprint 1A — Pin Hero Foundation

**Goal:** Fix the production bug, extract reusable components, redesign only the Pin Detail hero section.

**Files changed:** `index.html`

**What changed:**

1. **Production bug fixed:** Removed double comma from `REACTION_TYPES`. Moved Pin #099 (Point Pleasant — Mothman Bridge) from inside `REACTION_TYPES` to its correct position at the end of `LOCATIONS[]`.

2. **SP Component Library created** — five new JS functions, all returning HTML strings, all using CSS custom properties:
   - `SP_Badge(text, variant, prefix)`
   - `SP_Button(label, onclick, variant, sm, extraCss)`
   - `SP_SectionTitle(title, subtitle, action)`
   - `SP_QuickFact(icon, label, value)`
   - `SP_QuickFacts(loc)`
   - `SP_PinHero(loc, saved)`

3. **CSS component library added** — new CSS block `/* SP COMPONENT LIBRARY — Sprint 1A */` with scoped classes for all new components.

4. **Pin Detail hero redesigned** — replaced the old 200px gradient strip + card body pattern (`detail-header`) with `SP_PinHero`:
   - Full-bleed cinematic layout (min-height 420px)
   - Category gradient + dot-grid texture + 4-stop vignette
   - Title overlaid at documentary scale (up to 2.6rem)
   - Hook/pull-quote inside hero with Explorer Gold left border
   - Primary CTA: "📡 Start Exploring Nearby" in orange
   - Glassmorphism mystery score badge
   - Save/Add Report/Share as ghost buttons

5. **`SP_QuickFacts` strip added** below the hero — Country, Category, Score, Reports, Coordinates chips.

**Body sections unchanged:** Story, What We Know, The Mystery, Location, Reactions, Community Reports, Discussion, Nearby Pins all unchanged.

---

### Sprint 1 — Schema Extension + Typography + Quick Facts

**Goal:** Extend the data schema to match SP-001, improve story section typography, complete the Quick Facts strip.

**Files changed:** `index.html`

**What changed:**

1. **Schema extension — 10 Featured/Full Report pins:**
   All 10 pins (IDs 001–010) received full SP-001 fields:
   - `difficulty`: `"Easy"` | `"Moderate"` | `"Deep"`
   - `tags`: array of relevant string tags
   - `era`: human-readable time period string
   - `timeline`: array of `{ date, event }` objects (3–5 per pin)
   - `sources`: array of `{ type, title, url }` objects (1–3 per pin)
   - `connections`: object with `relatedPinIds[]`, `relatedTopics[]`, `relatedPeople[]`, `relatedEvents[]`
   - `media`: `{ heroImageUrl: "", gallery: [] }`

2. **Schema stubs — all 89 Short Pins:**
   All Short Pins received empty/null values for the same fields:
   `difficulty: null, tags: [], era: "", timeline: [], sources: [], connections: { ... all empty arrays }, media: { heroImageUrl: "", gallery: [] }`
   This ensures no rendering errors and forward-compatibility for Sprint 2.

3. **Story section typography improved (Doc 011):**
   - `.story-section` padding increased: `22px 24px` → `28px 32px`
   - `.story-section` margin-bottom increased: `16px` → `20px`
   - `.story-section p` line-height increased: `1.85` → `1.9`
   - `.story-section p` reading width constrained: `max-width: 68ch` added
   - Section labels converted to text-only: all emoji icons (`📖`, `✅`, `🔍`, `🗺️`, `💭`, `💬`) replaced with minimal monospace uppercase text
   - CSS `::before` pseudo-element added to `.story-section-label` for a minimal 5px dot accent
   - Two hardcoded hex values replaced with tokens: `#22d3ee` → `var(--teal)`, `#a78bfa` → `var(--purple-glow)`

4. **`SP_QuickFacts` extended:**
   Four new chips added:
   - Era — from `loc.era`
   - Depth — from `loc.difficulty`
   - Read — reading time computed from `fullStory` word count at 200 wpm
   - Open Maps — anchor chip linking to Google Maps via coordinates

---

### Performance Fix 1 — Script Defer

**Goal:** Add `defer` to blocking external scripts to allow first paint before scripts finish loading.

**Files changed:** `index.html` — 5 lines changed, 5 characters added total.

**What changed:**

| Line | Script | Change |
|---|---|---|
| 68 | `leaflet.js` | Added `defer` |
| 69 | `email.min.js` | Added `defer` |
| 120 | `firebase-app-compat.js` | Added `defer` |
| 121 | `firebase-auth-compat.js` | Added `defer` |
| 122 | `firebase-firestore-compat.js` | Added `defer` |

**Unchanged:** Google Translate script (line 81) — left blocking per approved scope. Font and preconnect optimisations deferred to Performance Fix 2.

**Why it is safe:**
- `defer` preserves relative script order — Firebase SDK load sequence (app → auth → firestore) is guaranteed.
- The Firebase IIFE is an inline `<script>` at the bottom of `<body>`, which executes after `DOMContentLoaded`. All deferred scripts execute before `DOMContentLoaded`, so Firebase SDKs are defined before the IIFE runs.
- Leaflet is only initialised inside `setTimeout(initLeafletMap, 300)` gated behind `currentPage === 'map'` — impossible on initial load.
- EmailJS is only called inside the submit form handler — never at load time.

---

## 7. Current Engineering Rules

These rules are in force for all development on this project. They were established during Sprint 0 and reaffirmed at each subsequent sprint.

### Workflow Rules

1. **Review Product Specifications before implementation.** Always check SP-001, SP-002, and Doc 011 before writing code. Spec documents are the source of truth for design and data decisions.

2. **Explain the implementation plan before writing any code.** No surprises. Every sprint starts with a written plan that is reviewed and approved by Product before execution.

3. **Make only agreed changes.** Scope is locked before execution begins. No additions, no opportunistic refactors outside the agreed scope.

4. **Stop and wait for Product Review between sprints.** Do not continue automatically. The sprint is not complete until Product approves.

5. **Post-sprint reports must include:** files changed, summary of changes, assumptions made, testing results.

6. **One change per sprint for performance and infrastructure work.** As established during the performance audit.

7. **No implementation without a plan.** If a request arrives without going through the plan → review cycle, stop and request clarification.

### Engineering Principles

1. **Refactor before rewrite.** Improve what exists before replacing it.

2. **Small, safe, incremental improvements.** Each sprint should be reviewable and reversible.

3. **Never sacrifice stability for speed.** A working product ships before a fast product.

4. **Keep code maintainable for long-term development.** Every change should leave the codebase easier to work with, not harder.

### Code Rules

1. **CSS custom properties only in new components.** No hardcoded hex values in SP Component Library CSS or any new CSS blocks.

2. **All new components return HTML strings.** Compatible with the existing `innerHTML` render model.

3. **New component functions are prefixed `SP_`.** Example: `SP_Badge`, `SP_Button`.

4. **Do not modify existing location content** except to add new schema fields.

5. **Do not change the visual design** when implementing infrastructure or performance changes.

6. **Do not alter the homepage, map, search, or submit pages** during Pin Detail sprints.

7. **Preserve all existing URLs and routing** when making structural changes.

8. **Validate before shipping.** Run integrity checks (pin count, field coverage, UTF-8 safety) before copying output to the delivery directory.

### Decision Log

| Decision | Reason |
|---|---|
| Use `defer` not `async` for Firebase scripts | `defer` preserves relative order; `async` does not |
| Google Translate left blocking in Perf Fix 1 | Callback pattern makes deferring higher-risk; scoped to its own sprint |
| Short Pins receive empty stubs, not null objects | Forward-compatibility: rendering code can safely access `loc.timeline` without null checks |
| Reading time computed at 200 wpm | Industry standard estimate; labelled as `~N min` to signal approximation |
| Section labels text-only (no emoji) | Doc 011 spec: "simple, thin, minimal, universal — avoid playful iconography" |
| `locations.js` (stale reference copy, never loaded) was removed on 2026-10-21; the inline `LOCATIONS` array in `index.html` is the single source of pin data | Recover it from git history if Sprint 5 needs a separate data file |

---

## 8. Known Technical Debt

### 🔴 Critical

**Credentials hardcoded in source.**
Firebase API key, Firebase project ID, Cloudinary cloud name (`dz9p5t4sj`), Cloudinary upload preset (`ao9q18f9`), EmailJS service ID (`service_spyyqld`), EmailJS template ID (`template_6luvilv`), EmailJS public key, and recipient email (`thestrangepin@gmail.com`) are all in plaintext in `index.html`. Anyone who views source can extract them.
*Action required before scaling: move to environment variables or a backend proxy.*

**Split data architecture.**
`LOCATIONS[]` (in `index.html`) and Firestore `pins` collection are separate and unreconciled. Community-submitted pins have no public detail page. Stats on the homepage mix both sources. Map only shows `LOCATIONS`. This is a foundational architectural issue.
*Planned resolution: Sprint 5 (data infrastructure).*

### 🟡 Significant

**Google Translate is still blocking.**
The Google Translate script at line 81 has no `defer` and blocks first paint. It was left blocking in Performance Fix 1 because its callback pattern requires careful handling.
*Planned resolution: Performance Fix 2.*

**`shortPreview` equals `fullStory` on most pins.**
89 Short Pins have identical text for both fields. The intent of having two fields (one short, one long) is not being maintained.
*Data quality sprint needed.*

**`stories[]` arrays are all empty.**
Every pin has `stories: []`. Community reports are written to Firestore but the data is never backfilled into the array or displayed from it.
*Blocked on data infrastructure sprint.*

**Activity feed and Active Pinners are hardcoded.**
The homepage "Recent Activity" section shows hardcoded fictional entries. The "Active Pinners" section shows three hardcoded users unless Firebase returns results before render.

**`city` field often equals `country`.**
On many Featured Pins, `city` is set to the country name (e.g. `city: "Peru"`). The `SP_QuickFacts` "Region" chip suppresses itself when city equals country, preventing visual breakage, but the underlying data is incorrect.

**Schema duplication on Featured Pins.**
The Sprint 1 Python migration script added both the rich schema block AND an empty stub block to Featured Pins (001–010). This means those pins have two `difficulty:` keys, two `connections:` keys, etc. JavaScript uses the last-defined value in an object literal, so behaviour is correct — but it is messy and should be cleaned up.

**No service worker.**
The app has a `manifest.json` and PWA meta tags, but no service worker is registered. The app cannot function offline.

### 🟢 Minor / Style

**`pinPos` field is vestigial.**
Every pin has `pinPos: { left: "50%", top: "50%" }`. This is a leftover from a pre-Leaflet custom map implementation. Unused.

**Duplicate Leaflet init code.**
`initLeafletMap()` and `initSubmitMap()` share approximately 80% of identical code. A shared `createMap(elementId, options)` factory would eliminate ~60 lines of duplication.

**`setTimeout` timing hack for Leaflet.**
Both `initLeafletMap` and `initSubmitMap` are called via `setTimeout(..., 300)` to wait for the DOM. Should use a proper `requestAnimationFrame` or `MutationObserver` pattern.

**Inline event handlers.**
Many elements use `onmouseover`/`onmouseout` inline attributes. These could be CSS `:hover`.

**Font weight audit not yet done.**
DM Sans `300` weight is loaded but likely unused. Syne `400` and `600` weights loaded but only `700` and `800` are used. Cleanup deferred to Performance Fix 2.

**Missing `preconnect` for `fonts.gstatic.com`.**
The font preconnect only points to `fonts.googleapis.com`. The actual font files come from `fonts.gstatic.com`, requiring a late DNS/TLS round-trip. Deferred to Performance Fix 2.

**`window.currentPage` and `let currentPage` coexist.**
There is shadow variable risk between the module-scoped `let currentPage` and any references via `window.currentPage`.

---

## 9. Approved Future Roadmap

Only items that have been explicitly approved by Product are listed here.

### Performance Fix 2

**Approved:** Yes (identified in Performance Audit, scoped to next perf sprint after live measurement)

**Scope:**
- Move Google Translate script to bottom of `<body>` (removes one blocking domain)
- Add `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` to `<head>`
- Trim unused font weights: remove `Syne:wght@400`, `Syne:wght@600`, `DM+Sans:wght@300`

**Condition:** Implement after measuring Performance Fix 1 improvement on live site.

---

### Sprint 2 — Discovery Engine

**Approved:** Yes (Sprint 2 scope confirmed by Product)

**Scope:** Implement SP-002 §7 — "Continue Exploring" section on the Pin Detail page.

**Requirements:**
- Display 6 recommended Pins below the existing Pin Detail content
- Each recommendation must include a reason string explaining the connection
- Use `connections.relatedPinIds` data added in Sprint 1 as the data source
- Build `getRelatedPins(loc)` function that returns pins with a `reason` string derived from connection type
- Do not implement Timeline, Gallery, Sources, or other sections in this sprint

**Why this matters:** This is the primary driver of the "Pins Viewed per Session > 5" KPI. Without it, the product has no exploration loop.

---

### Sprint 3 — Timeline + Sources Sections

**Approved:** Yes (identified in Sprint 1 planning, approved as Sprint 3 scope)

**Scope:** Implement SP-002 §4 (Timeline) and SP-002 §8 (Sources) on the Pin Detail page.

**Requirements:**
- Visual chronological timeline component using `timeline[]` data
- Structured citations section using `sources[]` data
- Both sections only visible for Featured/Full Report pins that have data
- No new data needed — Sprint 1 schema extension provides the source data

---

### Sprint 4 — Interactive Map on Detail Page

**Approved:** Yes (identified in Sprint 1 planning, approved as Sprint 4 scope)

**Scope:** Implement SP-002 §6 — Interactive Map section on the Pin Detail page.

**Requirements:**
- Small Leaflet instance centred on the Pin's coordinates
- Nearby mystery markers displayed
- "Open in Maps" link to external mapping service
- Leaflet is already loaded — this is primarily a new render block

---

### Sprint 5 — Data Infrastructure

**Approved:** Yes (identified in Sprint 0, confirmed as Sprint 5 scope)

**Scope:** Close the gap between `LOCATIONS[]` and Firestore. Unify into a single data source.

**Requirements:**
- Design a unified Pin data structure that works for both curated and community-submitted pins
- Migrate `LOCATIONS[]` to Firestore
- Give community-submitted pins a public detail page
- Remove the split data source architecture
- A separate data file (the removed `locations.js` can be recovered from git history) becomes the loaded source

---

## 10. Current File Structure

### Repository Root

```
strangepin/
├── index.html          ← Entire application (6,040 lines, ~320 KB uncompressed)
├── manifest.json       ← PWA manifest
├── og-image.html       ← Open Graph image source (1,200×630 static HTML)
│                         Rendered externally to og-image.png by a screenshot tool
├── README.md           ← Repository documentation
└── .gitignore
```

### `index.html` Internal Structure

```
index.html (6,040 lines)
│
├── <head> (lines 1–122)
│   ├── SEO meta tags (title, description, keywords, canonical)
│   ├── Open Graph meta tags
│   ├── Twitter Card meta tags
│   ├── JSON-LD structured data
│   ├── PWA manifest link and Apple meta tags
│   ├── Google Fonts preconnect + stylesheet
│   ├── Leaflet CSS
│   ├── Leaflet JS (defer)
│   ├── EmailJS (defer)
│   ├── Google Translate callback + widget script (blocking)
│   ├── Google Translate suppression CSS
│   └── Firebase SDK ×3 (defer)
│
├── <style> (lines 123–1000)
│   ├── :root CSS custom properties (design tokens)
│   ├── Global reset and base styles
│   ├── Navbar, mobile menu, bottom tab bar
│   ├── Button system (.btn-primary, .btn-secondary, .btn-sm)
│   ├── Card system (.card, .loc-card, .loc-card-*)
│   ├── Badge system (.badge, .badge-*)
│   ├── Form inputs
│   ├── Homepage sections (hero, stats, grid, how-steps)
│   ├── Map page (.map-layout, .map-frame, Leaflet overrides)
│   ├── Pin Detail page (.detail-header, .story-section, .story-section-label)
│   ├── Leaderboard (.lb-table, .lb-row)
│   ├── Submit page (.submit-wrap, .cat-btn)
│   ├── Nearby page (.nearby-big-card, .locate-btn)
│   ├── Story section typography (Sprint 1 — .story-section updated)
│   ├── Status badges (.status-featured, .status-full, .status-short, ...)
│   └── SP Component Library (Sprint 1A)
│       ├── .sp-badge and variants
│       ├── .sp-btn and variants
│       ├── .sp-section-title, .sp-section-header
│       ├── .sp-quick-facts, .sp-quick-fact, .sp-quick-fact-*
│       └── .pin-hero and .pin-hero__* (BEM)
│
├── <body>
│   ├── <nav> — fixed top navigation (lines ~1020–1100)
│   │   ├── Logo (showPage('home'))
│   │   ├── Desktop nav links (Home, Explore, Pinners, About)
│   │   ├── Desktop language dropdown
│   │   ├── Desktop auth button
│   │   ├── Mobile hamburger
│   │   └── Mobile menu (nav links + language grid)
│   │
│   ├── #translateBar — sticky custom translate bar (line ~1100)
│   │
│   ├── <div id="app">
│   │   └── <main id="mainContent"> — all pages render here via innerHTML
│   │
│   ├── <footer> — links, social, disclaimer, copyright (line ~1105)
│   │
│   ├── <nav class="bottom-tab-bar"> — mobile fixed bottom (5 tabs) (line ~5862)
│   │
│   └── <script> blocks
│       │
│       ├── Main app script (lines ~1143–5860)
│       │   ├── const LOCATIONS = [...] (lines ~1145–3409, 99 pins)
│       │   ├── const LEADERBOARD = [...] (10 hardcoded users)
│       │   ├── const BADGE_STYLE, CAT_BADGE, CAT_BAR, CAT_SCORE_COLOR
│       │   ├── const LANGS = {...} (4 languages)
│       │   ├── Global state variables (currentPage, currentDetail, etc.)
│       │   ├── showPage(page, data) — router
│       │   ├── updateSEO(page, data)
│       │   ├── popstate event listener
│       │   ├── Firebase stat counters (reads users + pins collections)
│       │   ├── Reaction functions (toggleReaction, updateReactionsUI)
│       │   ├── Comment functions (renderCommentsList, submitComment)
│       │   ├── renderNearby()
│       │   ├── renderProfile()
│       │   ├── isSaved(), toggleSave()
│       │   ├── calcMysteryScore()
│       │   ├── getNearbyPins() + dist() / calcDist()
│       │   ├── requestLocation(), filterByDist()
│       │   ├── getSafeName(), getSafePoints(), getSafePins(), timeAgo()
│       │   ├── const CAT_COVER (category gradient/emoji map)
│       │   ├── scoreRing()
│       │   ├── locationCard()
│       │   ├── SP Component Library (Sprint 1A)
│       │   │   ├── SP_Badge()
│       │   │   ├── SP_Button()
│       │   │   ├── SP_SectionTitle()
│       │   │   ├── SP_QuickFact()
│       │   │   ├── SP_QuickFacts()
│       │   │   └── SP_PinHero()
│       │   ├── renderPage() — main router switch
│       │   ├── renderHome()
│       │   ├── renderMap() + initLeafletMap() + addMarkersToMap() + refreshMapPins()
│       │   ├── renderSubmit() + initSubmitMap() + clearSubmitPin() + selectCategory()
│       │   │   + previewImage() + updateIntensity()
│       │   ├── renderDetail() — Pin Detail page
│       │   ├── renderLeaderboard() + startLiveLeaderboard()
│       │   ├── renderAbout()
│       │   └── window.initApp = function() {...}
│       │       DOMContentLoaded → initApp() → renderPage()
│       │
│       └── Firebase IIFE (lines ~5890–6036)
│           ├── firebase.initializeApp(config)
│           ├── auth = firebase.auth()
│           ├── db = firebase.firestore() → window._db
│           ├── window.SP_LEVELS, window.SP_POINTS
│           ├── window.getLevelInfo()
│           ├── window.fbSignIn(), window.fbSignOut()
│           ├── window.fbAddPoints()
│           ├── window.updateNavAuth()
│           ├── startLiveLeaderboard() helper
│           └── auth.onAuthStateChanged() listener
│
└── </html>
```

### External Dependencies (CDN)

| URL | Purpose | Load strategy |
|---|---|---|
| `fonts.googleapis.com/css2?...` | Syne, DM Sans, JetBrains Mono fonts | Stylesheet (render-blocking but display=swap) |
| `unpkg.com/leaflet@1.9.4/dist/leaflet.css` | Leaflet map styles | Stylesheet |
| `unpkg.com/leaflet@1.9.4/dist/leaflet.js` | Leaflet map library | **defer** |
| `cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js` | EmailJS submission | **defer** |
| `translate.google.com/translate_a/element.js` | Google Translate widget | **blocking** ⚠️ |
| `www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js` | Firebase core | **defer** |
| `www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js` | Firebase Auth | **defer** |
| `www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js` | Firebase Firestore | **defer** |

---

*End of PROJECT_HANDBOOK.md*
*This document must be updated at the completion of every sprint.*
