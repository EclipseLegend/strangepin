# StrangePin — Pin the Unexplained

A cinematic exploration platform for mysterious, haunted, and unexplained locations worldwide.

**Live site:** [strangepin.com](https://strangepin.com)

---

## Architecture

StrangePin is a single-file vanilla JavaScript SPA. No build system. No framework. No bundler.

| File | Purpose |
|---|---|
| `index.html` | Entire application — HTML, CSS, routing, render functions, Firebase integration |
| `locations.js` | Extracted reference copy of the `LOCATIONS[]` pin data array (SP-001 schema) |
| `manifest.json` | PWA manifest — standalone display, shortcuts, theme colour |
| `og-image.html` | Open Graph image source — rendered to `og-image.png` externally |

### Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript SPA (no framework) |
| Map | Leaflet 1.9.4 (CDN) |
| Auth | Firebase Authentication (Google sign-in) |
| Database | Firebase Firestore (community submissions) |
| Image uploads | Cloudinary (unsigned upload) |
| Pin submissions | EmailJS |
| Translation | Google Translate widget (hidden, custom UI) |
| Hosting | Netlify (auto-deploy from GitHub) |
| PWA | Web App Manifest + theme-color |

---

## Product Specifications

All implementation decisions follow the documents in `/specs/`:

| Document | Status | Purpose |
|---|---|---|
| `SP-001` — Pin Knowledge Model | ✅ Draft 1.0 | Data schema for every Pin |
| `SP-002` — Pin Experience PRD | 🟡 Draft 1.0 | Pin Detail page sections 1–9 |
| `Doc 011` — Design System | 🟡 Draft 1.0 | Visual language and component rules |

---

## Sprint History

### Sprint 0 — Architecture Review
Full audit of the existing codebase. Identified technical debt, data schema gaps, and phased migration plan.

### Sprint 1A — Pin Hero Foundation
- Fixed production syntax bug (Pin #099 embedded in `REACTION_TYPES`)
- Extracted SP Component Library: `SP_Badge`, `SP_Button`, `SP_SectionTitle`, `SP_QuickFacts`, `SP_PinHero`
- Redesigned Pin Detail hero per SP-002 §1 and Doc 011
- Applied CSS design tokens throughout new components

### Sprint 1 — Schema + Typography
- Extended all 10 Featured/Full Report pins with complete SP-001 fields: `difficulty`, `tags`, `era`, `timeline[]`, `sources[]`, `connections{}`, `media{}`
- Added empty stubs to all 99 Short Pins for schema-forward compatibility
- Improved Story section typography: 68ch reading width, increased line-height and padding
- Replaced emoji section labels with minimal monospace text labels per Doc 011
- Extended `SP_QuickFacts` with Era, Depth, Read, and Open Maps chips

### Performance Fix 1 — Script Defer
- Added `defer` to 5 external script tags (Leaflet, EmailJS, Firebase ×3)
- Eliminates render-blocking on all six external scripts
- Firebase load order preserved; Google Translate untouched (next sprint)

---

## Engineering Principles

- Refactor before rewrite
- Small, safe, incremental improvements
- Never sacrifice stability for speed
- Keep code maintainable for long-term development

---

## Roadmap

| Sprint | Scope |
|---|---|
| Performance Fix 2 | Google Translate moved to `</body>` + `fonts.gstatic.com` preconnect |
| Sprint 2 | Discovery Engine (SP-002 §7) — 6 reason-tagged related pins |
| Sprint 3 | Timeline section (SP-002 §4) + Sources section (SP-002 §8) |
| Sprint 4 | Interactive Map on Pin Detail page (SP-002 §6) |
| Sprint 5 | Data infrastructure — unify `LOCATIONS[]` and Firestore |

---

## Known Technical Debt

- Credentials (Firebase, Cloudinary, EmailJS) are hardcoded in `index.html` — rotate before scaling
- `LOCATIONS[]` and Firestore community pins are separate, never-reconciled data sources
- `pinPos` field on every location is vestigial (leftover from a pre-Leaflet map implementation)
- `city` field on many Featured pins is set to the country name rather than an actual city
- Homepage activity feed and Active Pinners section are hardcoded placeholder data
- Google Translate integration uses DOM-hacking patterns that are fragile under CSP
