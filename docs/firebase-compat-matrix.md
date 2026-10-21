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
Chrome, every Firebase/Google back-end request aborted, 2026-10-21 ~20:00 Europe/Lisbon):

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

## 3. Backfill (`scripts/backfill-public-profiles.js`) — NOT RUN against production

- Purpose: create `publicProfiles/{uid}` from `users/{uid}` for existing users.
- Safety: dry run by default; writing needs `--write --confirm-project=<projectId>` matching the
  project of the credentials (TESTED on the emulator: missing or wrong `--confirm-project`
  → exit 2, nothing written). Uses Admin SDK default credentials (service account, owner only).
- Idempotency (TESTED on the emulator: two consecutive `--write` runs → identical documents,
  only `updatedAt` differs): `set(..., {merge:true})`, each profile rebuilt from the
  *current* `users/{uid}` inside a transaction, so a concurrent point award cannot be
  overwritten with stale data.
- Sanitising (TESTED): non-https `photoURL` → `''`; non-integer points/pins → 0; displayName
  cut to 80 chars.
- Caveats (EXPECTED): (a) `users` documents with non-integer `points` get a mirror of 0, and the
  new rules require the mirror to equal `users.points` on later awards, so those users cannot
  earn points until fixed; (b) points inflated under the permissive rules are copied to the
  public leaderboard — review the dry-run output for outliers first; (c) reads every user
  document once (Firestore read cost ≈ number of users).

## 4. Safe, reversible migration plan (NOT EXECUTED; owner action)

1. **Capture the live rules**: console → Firestore → Rules, copy into
   `tests/fixtures/rules-live.rules`, rerun the matrix against it. Note the current rules
   version in the console history (that is the rollback target).
2. **Deploy the new client** (technical PR → Netlify). It works with both rule sets
   (scenario 2). Rollback: Netlify → Deploys → previous deploy → "Publish deploy".
3. **Backfill**: dry run, review, then `--write --confirm-project=strangepin-4e538`. Rollback:
   not normally needed (the new collection is additive; old rules ignore it); if necessary,
   delete `publicProfiles` with admin tooling.
4. **Deploy the new rules** (`firebase deploy --only firestore:rules`, owner only), then smoke
   test: sign in, react, comment, like, save, leaderboard. Rollback: console → Firestore →
   Rules → history → select the previous version → publish (takes effect within ~1 minute,
   EXPECTED per Firebase docs).
5. **Backfill again** (idempotent) to cover users who signed in between steps 3 and 4.
6. Rollback ordering rule: **rules first, then client**; never run an older client against
   the new rules longer than necessary (scenario 4).
