# StrangePin — Firebase production security audit

> **Current status:** see [`STATUS.md`](STATUS.md). Rules v3 are live in production and the v3 client
> is deployed (PR #1). The audit below is a historical record from before that release.
>
> **Update (rules v3 / PR #1):** the findings below are addressed by rules v3 and the v3 client;
> `tests/rules-v2-audit.test.js` was merged into `tests/rules.test.js` (all cases kept, adapted to v3).
> See `FIREBASE-SECURITY-FIX-REPORT.md` (delivered outside the repo), `docs/admin-review.md`,
> `docs/backfill-dry-run.md`, `docs/account-deletion.md`, `docs/third-party-hardening.md`.

- Date: 2026-10-22, 01:05–02:45 WEST (Europe/Lisbon, UTC+1)
- Scope: audit only. **Nothing was deployed, merged, pushed or changed in production.** No request
  was sent to any production Firebase service (Firestore, Identity Toolkit, Secure Token,
  Installations) or to the project `strangepin-4e538`. All rules/UI tests ran on the local
  Firebase Emulator Suite with the project `demo-strangepin`.
- Sources compared: `main` 728e8f5 (production branch), PR #1 `pr/technical` 4986199,
  PR #2 `pr/content` 7d7f7c8, and the live HTML of https://strangepin.com (curl, no JS).
- Local branch created (NOT pushed): `audit/firebase-rules`, based on `pr/technical` 4986199
  (SHA in the final summary / `git log audit/firebase-rules`).
- The public web `apiKey` is only referred to by its last 4 characters (`…VTuI`).

Labels used for every claim:
**VERIFIED** (by code, test or curl, today) · **OWNER-REPORTED** (from Effie's Firebase console, not
verified by us) · **ASSUMPTION** (reasoned, not checked) · **NOT TESTED**.

---

## A. Firebase project verification

### A1. Is `strangepin-4e538` the production project?
**VERIFIED.** The only Firebase config served by https://strangepin.com points to `strangepin-4e538`.

| Field | main 728e8f5 | live strangepin.com (curl) | strangepin.netlify.app (curl) | PR #1 4986199 | PR #2 7d7f7c8 |
|---|---|---|---|---|---|
| projectId | strangepin-4e538 | same | same | same | same |
| authDomain | strangepin-4e538.firebaseapp.com | same | same | same | same |
| storageBucket | strangepin-4e538.firebasestorage.app | same | same | same | same |
| messagingSenderId | 254898349595 | same | same | same | same |
| appId | 1:254898349595:web:1a20cc9c8d4ced1796fabe | same | same | same | same |
| apiKey | AIza…VTuI | same | same | same | same |
| sha256(config block), first 12 | 93d79067610f | 93d79067610f | 93d79067610f | 93d79067610f | 93d79067610f |

- **VERIFIED:** the live `index.html` at https://strangepin.com is byte-identical to `main` 728e8f5
  (`cmp`). strangepin.netlify.app serves the same file plus a 3-line HTML comment injected by Netlify.
- **OWNER-REPORTED:** the console shows project `strangepin-4e538` — consistent with the code.
- Database: **VERIFIED** (code) the client calls `firebase.firestore()` without a database id, i.e. the
  **`(default)`** database of `strangepin-4e538`. No named databases are referenced anywhere.

### A2. Do main and PR #1 match the project? 
**VERIFIED:** yes, identical config in main, PR #1, PR #2 and the live site (table above).

### A3. Conflicting project IDs or configs?
**VERIFIED: none.** `git grep` across `main`, `pr/technical`, `pr/content` and `git log -G projectId|authDomain`
over all history found only `strangepin-4e538` (production) and `demo-strangepin` (emulator):
- `locations.js`, `og-image.html`, `download`, `README.md`, `PROJECT_HANDBOOK.md`, `manifest.json`: no Firebase config.
- There is **no `.firebaserc`** on any branch (so `firebase deploy` has no default project and must be given
  `--project` explicitly — a safety plus). `firebase.json` (PR #1) only references `firestore.rules` and emulator ports.
- No `storage.rules`, `firestore.indexes.json` or `database.rules.json` exist.
- `demo-strangepin` is dev-only. **VERIFIED (code):** in PR #1 `index.html` the emulator switch runs only when
  `location.hostname` is `localhost` or `127.0.0.1` **and** the URL has `?emulator=1`; it then replaces projectId,
  apiKey and authDomain with demo values and calls `useEmulator`. It cannot activate on strangepin.com. All test
  files and the CI workflow use `--project demo-strangepin` / `projectId: 'demo-strangepin'` only.
- Mentions of `strangepin-4e538` outside `index.html` in PR #1 are documentation (`RELEASE-CANDIDATE.md`, backfill
  usage text), the CSP `frame-src` in `_headers`, and the backfill script's `--confirm-project` guard.

### A4. Google Authentication for strangepin.com
- **VERIFIED (code):** both main and PR #1 use `signInWithPopup(new GoogleAuthProvider())` (compat SDK 10.12.0);
  no `signInWithRedirect` / `getRedirectResult`. authDomain = `strangepin-4e538.firebaseapp.com`.
- **VERIFIED (curl -I):** `https://strangepin-4e538.firebaseapp.com/__/auth/handler` → HTTP 200 (the auth helper
  exists). The root of `strangepin-4e538.firebaseapp.com` and `.web.app` → 404 (no Hosting content; expected).
- **OWNER-REPORTED:** `strangepin.com` is an authorized domain.
- **NOT VERIFIABLE without the console (not tested):** that the Google provider is enabled, its support e-mail, and the
  OAuth consent screen's publishing status. Owner check: Authentication → Sign-in method → Google = Enabled.
- Popup vs third-party storage: Firebase documents that the problem with browsers blocking third-party storage
  (Safari 16.1+, Firefox 109+, Chrome M115+) affects `signInWithRedirect`; switching to `signInWithPopup` is their
  "Option 2" fix (firebase.google.com/docs/auth/web/redirect-best-practices). So the popup choice is correct.
  **ASSUMPTION/NOT TESTED:** popups can be blocked or awkward on mobile and inside an installed iOS home-screen PWA.
- PR #1 `_headers` sets `Cross-Origin-Opener-Policy: same-origin-allow-popups` — compatible with the popup
  (`same-origin` would break it). **VERIFIED (file); NOT TESTED in production** (headers not deployed).
- Today the live site cannot sign anyone in at all (see B2).

### A5. www.strangepin.com and other origins
- **VERIFIED (curl -sI):** `https://www.strangepin.com/` → **301** `location: https://strangepin.com/` from Netlify
  (path and query are preserved: `/some/path?x=1` → `https://strangepin.com/some/path?x=1`). The redirect happens at
  the edge before any HTML/JS, so sign-in never runs on www and **www does not need to be an authorized domain**.
- **NOT TESTED:** plain `http://` for apex and www — port 80 connections from the audit machine timed out. Netlify
  normally redirects HTTP→HTTPS; HSTS is sent on the apex (`max-age=31536000`, no `includeSubDomains`).
- **VERIFIED:** `https://strangepin.netlify.app/` → **200** and serves the full site (no redirect). It is an
  authorized domain (OWNER-REPORTED), so sign-in would work there too. It is a duplicate public origin (SEO and
  phishing-lookalike surface). Recommendation: Netlify 301 from `strangepin.netlify.app/*` to `https://strangepin.com/:splat`,
  then consider removing it from authorized domains (owner decision; nothing changed).
- `localhost` is authorized (OWNER-REPORTED; Firebase default). PR #1's local development uses the emulator with the
  `demo-` project, which does not need `localhost` authorized on the real project. Optional hardening: remove it.

---

## B. Current Firestore security status

### B1. Are the expired rules active?
- **OWNER-REPORTED:** the console shows
  `match /{document=**} { allow read, write: if request.time < timestamp.date(2026, 7, 4); }`.
- **NOT VERIFIED by us** — reading production rules needs the console or the Rules API, which was out of scope.
- **VERIFIED (emulator):** with exactly that text, every operation of the old and new clients is denied today
  (`tests/expired-rules.test.js`: **44/44 denied**, signed-in and anonymous; `compat-matrix` column `prod-expired`:
  23/23 DENY). The Admin SDK / console bypass rules and are unaffected.
- **ASSUMPTION:** test-mode rules are created with a 30-day window, so the database was probably created around
  2026-06-04; open read/write access existed until 2026-07-04 00:00 UTC.

### B2. Does the production website depend on this Firestore database?
- **VERIFIED (headless Chrome, `tests/live-main-firebase-probe.js`):** the deployed client (curl copy of
  strangepin.com = main) throws `ReferenceError: firebase is not defined` on every route (#home, #detail/001,
  #leaderboard, #profile); `firebase.apps.length = 0`, `window._db` unset, `window.fbSignIn` undefined; clicking
  "Sign In" opens nothing; **0 requests** to any Firebase/Google back end were even attempted (all such hosts were
  also made unresolvable and aborted). Cause (VERIFIED, code): the SDK `<script defer>` tags run after the inline
  `initFirebase()` IIFE. This is deterministic per the HTML spec, so it affects every browser.
- Therefore **today the expired rules have no user-visible effect**: the live site never reaches Firestore.
  The 99 curated pins are static data in `index.html` and do not depend on Firestore.
- **VERIFIED (git history):** the first two commits of `index.html` (9d76df4, cd449f9; 2026-06-27 PDT) loaded the
  SDK **without** `defer`, so that client did initialise Firebase. `defer` arrived in 07a5b60 (2026-06-27 23:43 PDT =
  2026-06-28 07:43 WEST). **ASSUMPTION:** if one of those versions (or an earlier pre-git upload) was deployed, real
  users may have signed in and written `users/{uid}` documents (with **e-mail addresses**), comments, reactions and
  saves before 2026-07-04 — and under test mode **anyone could read them** in that window. We cannot see whether
  any data exists. Owner check: console → Firestore → Data (and Usage) and Authentication → Users.

### B3. What happens per feature
(i) **Current live site (main):** nothing Firebase-related works, independent of the rules (VERIFIED, B2).
(ii) **PR #1 merged with the expired rules still live** — **VERIFIED on the emulator**
(`tests/e2e-expired-rules.js`, **15/15**, 0 production requests):

| Feature | Behaviour under the expired rules (PR #1 client) | User-visible |
|---|---|---|
| Google sign-in | **Works** (Auth is independent of Firestore rules). Nav shows "Sign Out" | yes |
| User profile (`users/{uid}` + `publicProfiles/{uid}`) | Creation **denied**; caught; `spData = {}`; nav shows "0 pts"; no document written | silent |
| Comments (read) | Denied; list stays on "Loading..." | stuck spinner |
| Comments (post) | Denied; caught; **the typed text is cleared and lost**, no error shown | silent data loss |
| Reactions | Denied; kept only in localStorage (button highlighted, no count) | silent |
| Comment likes | Denied (permission-denied is caught and logged) | silent |
| Save pin | Denied; localStorage only | silent |
| Points | Denied; submit flow catches it; EmailJS submission itself still succeeds | no "+pts" |
| Leaderboard | Read denied; stays on "⏳ Loading live rankings..." | stuck spinner |
| Home stats | Fall back to static values (99 pins, "—" explorers) | fine |
| Pin submission | EmailJS + Cloudinary, **not Firestore** — unaffected by rules (NOT TESTED against the real services) | — |
| Page errors | 0 uncaught errors; 3 console warnings `permission-denied` | — |

---

## C. Every Firestore path the code uses (VERIFIED, code)

| Path / operation | main 728e8f5 (old client) | PR #1 (new client) |
|---|---|---|
| `users/{uid}` get / set (19 fields incl. **email**) on first sign-in | yes (`_schemaVersion 1`) | yes (`_schemaVersion 2`, batch with publicProfiles) |
| `users/{uid}` update `lastActive` | yes | yes |
| `users/{uid}` update `points`, `pins` (increment) | yes (points award after submission) | yes + `lastPointsAt`, mirrored to publicProfiles |
| `users` list (home stats) / `users orderBy points` (leaderboard) | yes — would expose every user's e-mail | no (uses `publicProfiles`) |
| `users where savedPins array-contains` | yes (dead code) | removed |
| `users/{uid}/saved/{pinId}` set / delete | yes (client `Date`) | yes (server time) |
| `publicProfiles/{uid}` set / update / list orderBy points (live listener) | — | yes |
| `pins` list (home stats, "latest pins") | yes | yes |
| `pins/{pinId}/reactions/{uid}` list / set / delete | yes | yes |
| `pins/{pinId}/comments` list orderBy at / add | yes | yes |
| `pins/{pinId}/comments/{cid}` update `likes` +1 | yes (no per-user marker → unlimited likes) | batch with `likes/{uid}` marker |
| Firebase Storage | **not used** (SDK not loaded; `storageBucket` only in config) | not used |
| App Check | **not used** (no SDK) | not used |
| Pin submissions | EmailJS → `thestrangepin@gmail.com`; image → Cloudinary unsigned upload | same |

---

## D. PR #1 rules coverage (critical review)

**VERIFIED:** PR #1 contains `firestore.rules` and `firebase.json` (rules path + emulator ports), no `.firebaserc`.
PR #1 rules: 46/46 own tests, 42 matrix cells, 22/22 UI e2e (re-run today on 4986199, all pass).

What PR #1 already does well (VERIFIED by emulator tests): `users/{uid}` private (owner-only read → e-mails no longer
listable); `verified`/`badges`/`achievements`/`followers` not client-writable; `pins` read-only for clients (no
self-publishing); comments author-only edit (text only) and delete; one like per user via marker; reactions one per
user with a type allow-list; server timestamps on reactions, saves and comments; default-deny catch-all.

**Gaps found (VERIFIED: the 97-case audit suite run against PR #1's rules → 84/97; the 13 failures are the gaps):**

| # | Gap in PR #1 rules | Severity | Evidence |
|---|---|---|---|
| G1 | **Self-awarded points.** Any signed-in user can call the SDK directly and add up to +35 points every 30 s (≈100,800/day) with a mirrored batch; no submission is required. Leaderboard and levels are manipulable. | **High** (integrity of the public ranking) | `[points]` 2 fails; matrix `self-award +35 … v1-pr1 = ALLOW` |
| G2 | **Any sign-in provider accepted.** If Anonymous or Email/Password sign-in is (or gets) enabled in the console, scripts can mass-create accounts with the public API key and write comments/reactions/profiles. | Medium (conditional; provider list NOT VERIFIED) | `[provider]` 3 fails |
| G3 | **Invented pin ids.** Comments, reactions and saves can be written under any `pins/{anything}` path (storage/cost spam, hidden content). | Medium | `[pin-ids]` 3 fails; matrix `comment on an invented pin id … v1-pr1 = ALLOW` |
| G4 | Like markers can be created without the +1 and on non-existent comments (orphan data). | Low | `[likes]` 2 fails |
| G5 | Schema: `users` create does not require all fields (e.g. no email), does not bound `email`, `notifications`, `joinedAt`/`lastActive` (client times accepted). | Low | `[schema]` 2 fails (+ size checks) |
| G6 | `publicProfiles` can be created without a `users` doc. | Low | `[points]` 1 fail |

Not rule-fixable / remaining by design (both v1 and v2):
- R1 **Comment display name is free text** (≤80 chars), not tied to the profile → a user can post as "StrangePin Team". Low–medium. Fix: derive the name server-side or require it to equal `publicProfiles/{uid}.displayName` (needs a client change).
- R2 **No rate limiting** of comments/reactions (spam, cost). Medium. Rules alone cannot rate-limit without a client change (e.g. `users/{uid}.lastCommentAt` written in the same batch). Recommend App Check + moderation.
- R3 **Public real names.** `publicProfiles` publishes each user's Google display name and photo on the leaderboard by default; reaction/like docs are keyed by uid and therefore linkable to names. Privacy/consent (EU users, GDPR). Product change: opt-in or alias.
- R4 Users cannot delete their own data (`delete: false`) → account deletion must be an admin process (GDPR erasure requests).
- R5 Users may like their own comments (product decision).
- R6 **Rules version pitfall (VERIFIED on the emulator):** a comment placed *above* `rules_version = '2';` made the emulator silently evaluate the file as rules v1, which denied legitimate batches. Keep `rules_version = '2';` as the first line when pasting into the console.

---

## E. Proposed rules v2 and tests (local branch `audit/firebase-rules`, NOT pushed)

`firestore.rules` v2 closes G1–G6:
1. **Points and pins are server-owned** (no client write path on `users` or `publicProfiles`); only the owner via
   Admin SDK/console. **Required client change (documented, not done):** PR #1 still calls `fbAddPoints()` after a
   submission; under v2 it is denied, PR #1 catches it (submission succeeds, no "+pts" toast; VERIFIED e2e). The client
   should drop the call and say "points are added after review"; points are then awarded by an owner-run script after
   reviewing the e-mailed submission (or a Cloud Function later; requires the Blaze plan). Until then the leaderboard
   stays at 0 for everyone. **Alternative (owner decision):** keep PR #1's capped self-award and accept G1.
2. Writes only from `sign_in_provider == 'google.com'`.
3. Full schema: `hasAll` + `hasOnly`, types, sizes (email ≤254, notifications only 3 booleans, bio ≤500, https-only
   URLs), `joinedAt`/`lastActive`/`at`/`updatedAt` must equal `request.time`.
4. Reactions/comments/saves only for curated ids `^[0-9]{3}$` or an existing `pins/{pinId}` document.
   (If curated pins ever exceed 999 or use another id format, the rule must be updated.)
5. Like marker requires an existing comment and the +1 in the same batch.
6. `publicProfiles` create requires the `users` doc (same batch or existing).

Compatibility of v2 (VERIFIED, emulator):
- **PR #1 client:** sign-in/profile, comments, edit/delete own comment, likes, reactions, saves, leaderboard and home
  stats work (e2e 22/22 with v2); only point awards are denied (by design).
- **Currently deployed main client:** cannot initialise Firebase at all (B2), so no change for users.
- **Rolled-back / hypothetical working old client:** sign-in and comment add ALLOW; points, client-Date reactions/saves,
  markerless likes, listing `users` DENY (matrix column `new`). Data stays protected; features degrade.
- Legacy `users` docs (schema 1, if any): `lastActive` update works if the doc's existing fields are valid (validation
  tolerates missing optional fields via `.get()`); they lack `publicProfiles` until the backfill runs (ASSUMPTION based on code).

### Test results (all on the emulator, project demo-strangepin, 2026-10-22 ~02:40 WEST)
| Suite | Rules | Result |
|---|---|---|
| `rules.test.js` (PR #1 original) | PR #1 v1 (on 4986199) | **46/46** |
| `compat-matrix.test.js` (original) | assumed-old + v1 | **42 cells, 0 unexpected** |
| `e2e-emulator.js` (original, UI) | v1 | **22/22** |
| `rules.test.js` (updated: Google token; 2 award tests now expect DENY) | **v2** | **46/46** |
| `rules-v2-audit.test.js` (new, 97 cases in 12 groups) | **v2** | **97/97** |
| `rules-v2-audit.test.js` | PR #1 v1 (comparison) | **84/97** — the 13 failures are gaps G1–G6 |
| `compat-matrix.test.js` (extended: 4 rule sets × 23) | assumed-old, prod-expired, v1, v2 | **92 cells, 0 unexpected** |
| `e2e-emulator.js` (updated: v2 points expectations, stricter host blocking) | **v2** | **22/22** |
| `expired-rules.test.js` (new) | owner-reported expired | **44/44 denied** |
| `e2e-expired-rules.js` (new, UI) | owner-reported expired | **15/15** |
| `live-main-firebase-probe.js` (new) | live HTML (no emulator) | 4 routes; **0 back-end attempts**; `firebase is not defined` |

Audit group breakdown (v2): legit 12/12, public-read 4/4, private-read 5/5, unauth 4/4, provider 3/3, cross-user 10/10,
admin-fields 19/19, points 8/8, likes 8/8, schema 18/18, pin-ids 3/3, catch-all 3/3.

Zero production requests — how it was ensured:
- **VERIFIED:** every browser test aborts and counts requests to `*.googleapis.com` Firebase APIs, `*.firebaseapp.com`,
  `*.web.app`, `accounts.google.com`, EmailJS and Cloudinary; the new tests additionally make those hosts unresolvable
  in Chrome (`--host-resolver-rules`). All counters = 0. (`apis.google.com/js/api.js`, the public gapi loader, is
  allowed in `e2e-emulator.js` because the popup flow needs it even with the emulator — VERIFIED; it is a static
  library, not a project API.)
- **VERIFIED (grep):** all tests and the CI workflow use only `demo-strangepin`; Node tests connect to 127.0.0.1:8085/9099.
- **ASSUMPTION:** firebase-tools itself made no production call (demo- projects run offline). The only outbound
  attempt observed in logs was the Google Cloud metadata probe `169.254.169.254` (credential auto-detection; timed out).

Missing tests / not tested: real Google sign-in on strangepin.com; behaviour with the real console rules (only the
owner-reported text was emulated); Firestore indexes in production (the queries used are single-field
`orderBy` → automatic indexes, ASSUMPTION); EmailJS/Cloudinary real sends; iOS PWA popup; App Check; production data contents.

---

## F. Recommended fixes, in priority order

1. **(Owner, console, read-only) Confirm facts we could not verify:** Firestore → Rules text and history;
   Firestore → Data: do `users`, `publicProfiles`, `pins`, comments exist?; Authentication → Users count;
   Sign-in method: only Google enabled (disable Email/Password and Anonymous if on); Google provider enabled.
2. **Keep the expired rules for now.** They are safe (deny everything) and the live site does not use Firestore.
   **Never extend the date or restore test mode.**
3. **Decide the points model** (v2 server-owned, recommended; or PR #1 capped self-award with known abuse).
4. **Adopt rules v2** (after review) as the rules shipped with PR #1 — via a new PR from `audit/firebase-rules`
   (needs approval to push), or by updating PR #1.
5. **Deploy order** (each step needs approval; see G): backup → (backfill if users exist) → deploy rules v2 →
   smoke test → merge PR #1 → deploy site. Rules first is safe because the live client does not use Firestore.
   **(Done with rules v3: rules published by the owner, then PR #1 and PR #2 deployed; no backfill was run.)**
6. **Client follow-ups (separate PR):** remove client `fbAddPoints` call (v2); show an error and keep the typed comment
   when posting fails; show "community features unavailable" instead of endless "Loading..."; optional display-name
   binding for comments.
7. **API key restrictions** (Google Cloud console → Credentials): HTTP referrers `https://strangepin.com/*`,
   `https://strangepin-4e538.firebaseapp.com/*` (auth handler), optionally `https://strangepin.netlify.app/*`;
   API restrictions to Identity Toolkit, Token Service, Cloud Firestore, Firebase Installations. (NOT TESTED; test
   sign-in right after.)
8. **App Check** with reCAPTCHA (v3/Enterprise) for Firestore — first in monitoring mode, then enforce. NOT TESTED.
9. **Auth settings:** enable e-mail enumeration protection; review authorized domains (www not needed; consider removing
   `localhost`, and `strangepin.netlify.app` after a 301 is in place).
10. **Third-party exposure (dashboards, NOT VERIFIED):**
    - Cloudinary unsigned preset (cloud `dz9p5t4sj`, preset in public HTML): anyone can upload to the account. Restrict
      formats (jpg/png/webp), max size, a dedicated folder, enable moderation, consider signed uploads.
    - EmailJS: set allowed origins to strangepin.com; enable rate limiting; **make sure the template's "To" address is
      hard-coded**, not `{{to_email}}` — a `{{to_email}}` template would let anyone send mail to arbitrary addresses
      through your account. (Update, v3 client in PR #1: the client keeps sending `to_email` as the fixed constant
      `thestrangepin@gmail.com` for compatibility; see docs/third-party-hardening.md.)
11. Privacy: public profile opt-in/alias; account-deletion process (R3, R4); update the privacy notice.
12. Netlify: 301 `strangepin.netlify.app` → `strangepin.com`.

---

## G. Production safety plan (historical; executed with rules v3 instead of v2, see `STATUS.md`)

- **Target:** project `strangepin-4e538`, Cloud Firestore database `(default)`.
- **Impact on existing users/data:** rules changes do not modify data. Under the expired rules no client write could
  succeed since 2026-07-04 (VERIFIED by emulation of the owner-reported text). Any existing `users` docs come from the
  open test-mode window (ASSUMPTION B2). With v2, existing users can sign in; their points/pins are preserved but frozen
  (server-owned); they appear on the leaderboard only after the backfill.
- **Compatibility:** v2 vs deployed main = no effect (main never reaches Firestore). v2 vs PR #1 = all features except
  client point awards. v2 vs a rolled-back working old client = partial (see E).

Steps:
1. **Backup (read-only):** copy the current rules text from Firestore → Rules (already provided by the owner) and note
   the history entry. Data: if collections exist, either a managed export
   (`gcloud firestore export gs://<bucket> --project strangepin-4e538`, needs the Blaze plan + a bucket — owner decision,
   may incur cost) or a manual review in the console. If no data exists, no backup/backfill is needed.
2. **Backfill (only if `users` docs exist):** `scripts/backfill-public-profiles.js` dry run first, review outliers
   (points inflated during test mode), then `--write --confirm-project=strangepin-4e538` with an owner-held service
   account. Note: its dry run also reads production — owner-run only.
3. **Deploy rules v2 — never from an unmerged PR branch.** After the rules are merged into `main`, from a clean checkout
   of `main` at the merged SHA: `firebase deploy --only firestore:rules --project strangepin-4e538` (no `.firebaserc`
   exists, so `--project` is mandatory), or paste the merged file into the console (keep `rules_version = '2';` on
   line 1). Propagation: up to ~1 minute (Firebase docs).
4. **Smoke test** (owner, real account): sign in, comment, like, react, save, leaderboard; Firestore → Usage/Rules
   monitoring for denied requests.
5. **Then merge PR #1 and deploy the site** (separate approval). Because the live client never reaches Firestore,
   deploying rules before the site has no user-visible effect.
6. **Rollback:**
   - Rules: console → Firestore → Rules → history → select the previous version → Publish (or redeploy the previous
     file). Rolling back to the expired rules simply denies everything again (safe). **Never roll back to open test
     mode or extend its date.**
   - Site: Netlify → Deploys → previous deploy → "Publish deploy"; or revert the PR. If the client is rolled back,
     roll back the rules first (or together) — matrix column `new` shows which old-client features v2 denies.
7. **Monitoring:** Firestore usage graphs (reads/writes/denies), Authentication → Users growth (bot accounts), App Check
   metrics once enabled, Cloudinary/EmailJS usage.

### Exact changes requiring Effie's approval
1. Push local branch `audit/firebase-rules` to GitHub and open a PR (rules v2 + tests + CI step), or apply v2 into PR #1.
2. The points model decision (v2 server-owned vs PR #1 capped self-award) and the related client change.
3. Any production Firestore backup/export (may need Blaze plan → cost).
4. Running the backfill against production (service account, writes `publicProfiles`).
5. Deploying firestore rules v2 to `strangepin-4e538` (after merge, from `main`).
6. Merging PR #1 / PR #2 and deploying to Netlify.
7. Console/dashboard hardening: disabling unused auth providers, e-mail enumeration protection, authorized-domain
   changes, API key restrictions, App Check, Cloudinary preset limits, EmailJS template/origin settings, Netlify 301.
