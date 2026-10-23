# Reviewing submissions and awarding points (owner only)

Status: implemented and TESTED on the Firestore emulator (`tests/admin-scripts.test.js`,
`tests/e2e-emulator.js`). **Never run against production without a separate, explicit
approval from the owner.** Nothing in this repository has been run against
`strangepin-4e538`.

## How it works

1. A signed-in visitor submits a location. The website stores `submissions/{id}` with
   `status: 'pending'`, `authorUid` = the visitor's uid, the form fields, and `createdAt`
   (server time). EmailJS still sends a notification e-mail; it now includes the
   `submission_id`. Visitors who are not signed in can still submit; they get the e-mail
   notification only (no Firestore document, no points).
2. The visitor sees "Thanks! Your location is pending review" and, under **Profile → My
   submissions**, the status `Pending review`, then `Approved · +N pts` or `Not approved`.
3. The owner reviews with `scripts/admin-review-submission.js` (Admin SDK). The browser can
   **never** change points, pins, a submission's status or review fields, or the
   `pointAwards` ledger: `firestore.rules` denies all of these (TESTED).
4. Publishing an approved location on the map is still the existing manual content process
   (adding it to `index.html` / `scripts/build-pins.js`); approval does not publish anything.

## Points

| Event | Points | Pins |
|---|---|---|
| Approved location | +10 | +1 |
| Approved location that came with a photo | +5 extra | – |
| Rejected | 0 | 0 |

`--points=N` (0–100) overrides the default for a single approval.

## One decision = one transaction

`approve` / `reject` run in a single Firestore transaction that:

- refuses unless the submission exists and `status == 'pending'` (`NOT_PENDING`);
- refuses if `pointAwards/{submissionId}` already exists (`ALREADY_AWARDED`); the ledger entry
  is written with `create()`, which fails if it exists, so two simultaneous approvals award
  once (TESTED: 8 concurrent approvals → exactly one award);
- on approve: reads `users/{uid}`; refuses if `points`/`pins` are not plain non-negative
  integers (`BAD_LEGACY_VALUE`, nothing written; fix by hand); sets the new totals on
  `users/{uid}` (only `points` and `pins` change) and mirrors them to `publicProfiles/{uid}`
  (creating it with a generated nickname "Explorer-XXXX" if missing);
- writes on the submission: `status`, `decision`, `reviewedAt` (server time), `reviewedBy`,
  `pointsAwarded`, `reviewNote`;
- writes the ledger `pointAwards/{submissionId}`: `submissionId, uid, decision, points, pins,
  reviewedBy, at`.

A rejection also writes a ledger entry (0 points), so a rejected submission can never be
approved later by mistake.

## Usage

Dry run is the default: without `--write` the script only reads and prints what it would do.

Against the emulator (always try here first):

```bash
npm ci --prefix tests
./tests/node_modules/.bin/firebase emulators:start --only firestore --project demo-strangepin
# in another shell
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 GCLOUD_PROJECT=demo-strangepin NODE_PATH=tests/node_modules
node scripts/admin-review-submission.js list                         # pending, oldest first
node scripts/admin-review-submission.js list --status=approved --limit=50
node scripts/admin-review-submission.js approve <id> --reviewer=effie            # dry run
node scripts/admin-review-submission.js approve <id> --reviewer=effie --write    # apply
node scripts/admin-review-submission.js reject  <id> --reviewer=effie --note="Duplicate of pin 012" --write
```

Against production (**only after explicit approval of that specific run**):

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/outside/the/repo/strangepin-admin-key.json
NODE_PATH=tests/node_modules node scripts/admin-review-submission.js list --project=strangepin-4e538 --confirm
NODE_PATH=tests/node_modules node scripts/admin-review-submission.js approve <id> --reviewer=effie --project=strangepin-4e538 --confirm --write
```

Safety guard (`scripts/lib/guard.js`, TESTED): the script refuses to start unless either
`FIRESTORE_EMULATOR_HOST` is set with a `demo-*` project id, or **both**
`--project=strangepin-4e538` and `--confirm` are given together with
`GOOGLE_APPLICATION_CREDENTIALS`. Exit codes: 0 done, 1 error/refused to start, 3 refused
decision (already reviewed, ledger exists, bad value), 64 usage.

## How the owner finds pending submissions

- `list` (above) prints id, time (UTC), category, name, country, photo yes/no, author uid and
  the first 160 characters of the story. It never prints e-mail addresses.
- The EmailJS notification e-mail contains `submission_id`; use it with `approve` / `reject`.
- Firebase console → Firestore → `submissions`, filter `status == pending` (read-only browsing;
  do not edit review fields by hand, or the ledger and totals get out of sync).

## Service account key (owner)

- Create it in Firebase console → Project settings → Service accounts → "Generate new private
  key". Store it **outside** the repository (e.g. `~/secrets/`), never commit it, never paste it
  into chat or issues. `.gitignore` does not protect files outside the repo; gitleaks runs in CI.
- Delete the key in Google Cloud console → IAM → Service accounts → Keys when it is no longer
  needed.

## Spark (free) plan

Everything here works on Spark: the Admin SDK is a normal client of Firestore; no Cloud
Functions, no Blaze. Daily free quota (Firebase pricing page, checked 2026-10-22): 50,000
document reads, 20,000 writes, 20,000 deletes; 1 GiB stored; 10 GiB/month egress.

| Operation | Reads | Writes |
|---|---|---|
| `list` (n pending) | n (min. 1) | 0 |
| approve | 4 (submission, ledger, user, profile) | 4 |
| reject | 2 | 2 |
| dry run | same reads, 0 writes | 0 |

Hundreds of reviews per day stay far below the free quota.

## Residual risks

- Points are only as correct as the reviewer's decision; there is no automated duplicate
  detection (the reviewer should search existing pins by name/coordinates).
- Editing `users.points` by hand in the console bypasses the ledger and leaves the public
  mirror stale; use the script or update both documents.
- The script prints the submission story (user content) to the terminal; it is plain text, but
  avoid piping it into tools that interpret markup.
