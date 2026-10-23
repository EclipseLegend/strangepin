# Firebase compatibility matrix (client × Firestore rules)

Status: analysis + emulator tests only. **Nothing was deployed, no backfill was run, nothing
was written to the real project `strangepin-4e538`.** All emulator runs use project
`demo-strangepin` (auth :9099, firestore :8085).

Labels: **TESTED** (how/where stated), **EXPECTED** (reasoning, not executed), **NOT TESTED**.

## 0. Key assumption: the production rules are unknown

There is no Firebase console access, so the rules currently live on `strangepin-4e538` are
**unknown**. "Old rules" below is an **assumption**, modelled in
`tests/fixtures/rules-assumed-old.rules`: public read, any signed-in user may write anything.
This is the most permissive setup under which the old client could have worked. If production
is stricter (e.g. default deny / test-mode rules expired), parts of the "old rules" columns
are already broken today; if it is even more open (unauthenticated writes), the exposure is
worse than described. **Before any deployment, the owner should copy the live rules from
Firebase console → Firestore → Rules (the history panel keeps earlier versions) into the repo
and rerun `tests/compat-matrix.test.js` against them.**

"New rules" = `firestore.rules` in this branch (46/46 `tests/rules.test.js`).

## 1. Important finding: the current main client never talks to Firebase

TESTED (`tests/compat-old-client.js`, main @ 728e8f5 served on http://127.0.0.1:8301, headless
Chrome, every Firebase/Google back-end request aborted, 2026-10-21 ~19:25 WEST (Europe/Lisbon, UTC+1)):

| Route | `firebase` global | apps | `_db` | errors | back-end requests attempted |
|---|---|---|---|---|---|
| #home | object (loads later) | 0 | false | `firebase is not defined` | 0 |
| #detail/001 | object | 0 | false | `firebase is not defined` | 0 |
| #leaderboard | object | 0 | false | `firebase is not defined` | 0 |

Main initialises Firebase at parse time, before the `defer`ed SDK scripts run, so
initialisation throws and sign-in, reactions, comments, saves, points and leaderboard do
nothing in the current production client, **whatever the rules are**. EXPECTED: this is also
why Lighthouse on main shows no Firestore/Identity Toolkit requests.

Consequence: the "old client" rows below describe the *request shapes* of the old code (as it
would behave if initialisation worked, e.g. an older deploy or a hot-fix of only the init bug).
They are emulated directly with `@firebase/rules-unit-testing`, not by driving the main UI.

## 2. Matrix

TESTED: `tests/compat-matrix.test.js`, 42 cells, 0 unexpected, run via
`firebase emulators:exec --only auth,firestore --project demo-strangepin "node tests/rules.test.js && node tests/compat-matrix.test.js"`
(firebase-tools 13.35.1, @firebase/rules-unit-testing 3.0.4), 2026-10-21 Europe/Lisbon.

| Operation | Old client + assumed-old rules | New client + assumed-old rules | New client + new rules | Old / rolled-back client + new rules |
|---|---|---|---|---|
| Sign-in: create `users/{uid}` | ALLOW | ALLOW (users + publicProfiles batch) | ALLOW | ALLOW |
| Sign-in: update lastActive | ALLOW | – | – | ALLOW |
| Award points | ALLOW (users only, no mirror) | ALLOW (mirrored batch) | ALLOW | **DENY** (no mirror) |
| Reaction | ALLOW (client Date) | ALLOW (server time) | ALLOW | **DENY** (client Date) |
| Comment add | ALLOW | ALLOW | ALLOW | ALLOW |
| Comment like | ALLOW (no marker) | ALLOW (marker + increment) | ALLOW | **DENY** (no marker) |
| Save pin | ALLOW (client Date) | ALLOW (server time) | ALLOW | **DENY** (client Date) |
| Home stats | ALLOW (lists `users`) | ALLOW (`publicProfiles`) | ALLOW | **DENY** (list `users`) |
| Leaderboard | ALLOW (`users` orderBy points) | ALLOW (`publicProfiles`) | ALLOW | **DENY** |
| Abuse: self-award 10,000 points | ALLOW | ALLOW | DENY | DENY |
| Abuse: read another user's private doc (email) | ALLOW | ALLOW | DENY | DENY |
| Abuse: edit another user's comment | ALLOW | ALLOW | DENY | DENY |
| Abuse: write a pin document | ALLOW | ALLOW | DENY | DENY |
| Abuse: unauthenticated comment | DENY | DENY | DENY | DENY |

### Scenario summaries

1. **Old client + old rules (today, assumed).** Features: none work in practice (finding §1).
   Exposure (TESTED against the assumed rules): any signed-in user can read every user's email,
   set any points, edit/delete anyone's comments and write pin documents. Real exposure
   depends on the unknown live rules.
2. **New client + old rules (step 1 of the migration).** All features work (TESTED cells;
   the new client's UI paths are TESTED end-to-end only against the *new* rules in
   `tests/e2e-emulator.js`, 22/22). Leaderboard/home stats read `publicProfiles`, which is
   empty for existing users until the backfill runs (EXPECTED: leaderboard shows only users
   who signed in after deploy). Exposure unchanged from scenario 1 (rules are what protect
   data, not the client). The new client also escapes all user content (XSS tests).
3. **New client + new rules (target).** All features work; all tested abuse is denied.
   Remaining exposure: `publicProfiles` and comments are public by design; points can still
   be self-awarded within the per-award cap/cooldown enforced by the rules.
4. **Rolled-back client + new rules.** Rolling back to main 728e8f5: nothing works anyway
   (§1), so the rules change nothing user-visible (TESTED for init failure; EXPECTED for the
   rest). Rolling back to a hypothetical *working* old client: sign-in and comments work;
   points, reactions, likes, saves, home stats and leaderboard are denied (TESTED cells), and
   data stays protected. **Therefore: if the client must be rolled back, roll back the rules
   first (or together).**

## 3. v3 update (local branch `pr/technical-v2`, 2026-10-22)

- Rules v3 (`firestore.rules`) replace v2: points/pins are owner-only (Admin SDK script,
  manual review), public profiles hold a nickname + score only, comment author names are the
  nickname. The matrix test now runs the v3 client shapes against v3 ("new"); 0 unexpected
  cells (TESTED).
- New compatibility consequence (TESTED): the **old client (main 728e8f5) can no longer create
  accounts or post comments under v3** (it writes the old shapes). It cannot do so today either:
  the owner-reported live rules are expired test-mode rules that deny everything (TESTED
  against `fixtures/rules-prod-expired.rules`), and main never initialises Firebase.
- Legacy users (existing `users/{uid}` with points/pins): v3 lets the owner read the legacy
  doc, update only `lastActive`, and create the public profile only with the *same* points and
  pins (TESTED; e2e with an owner-shaped doc: points 25 / pins 2 preserved).

## 4. Backfill (`scripts/backfill-public-profiles.js`) — NOT RUN against production

Rewritten for v3; see `docs/backfill-dry-run.md`. Create-if-absent only (never modifies an
existing profile or any `users` doc), generated nickname, no e-mail/name/photo copied,
counts-only output, dry run by default, guarded target (TESTED on the emulator).

## 5. Safe, reversible migration plan (NOT EXECUTED; owner action, each step needs approval)

1. **Capture the live rules** (console → Firestore → Rules → copy; note the version in the
   history = rollback target). Owner-reported today: expired test mode (deny all).
2. **EmailJS template**: fixed recipient instead of `{{to_email}}` (docs/third-party-hardening.md),
   pending owner access. Not a deploy blocker: the v3 client still sends the fixed
   `to_email: 'thestrangepin@gmail.com'` for compatibility, so notifications keep arriving.
3. **Deploy the v3 client** (merge the technical PR → Netlify). With the expired rules every
   Firestore feature still fails, but now visibly and without losing typed text (TESTED,
   `tests/e2e-expired-rules.js`). Rollback: Netlify → Deploys → previous deploy → Publish.
4. **Deploy rules v3** (`firebase deploy --only firestore:rules` from a trusted machine, owner
   only; Spark-compatible). Smoke test: sign in, nickname, comment, like, react, save,
   leaderboard, submit. Rollback: console → Rules → history → previous version → Publish.
5. **Backfill** (optional; dry run first, separate approval for each run).
6. Review submissions with `scripts/admin-review-submission.js` (docs/admin-review.md).
7. Rollback ordering: rules first, then client.
