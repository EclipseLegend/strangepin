# Public profile backfill: procedure (owner only)

Script: `scripts/backfill-public-profiles.js`. Status: TESTED on the Firestore emulator
(`tests/admin-scripts.test.js`, backfill group). **NOT run against production.**

## What it does

For every `users/{uid}` document it creates `publicProfiles/{uid}` **only if that profile does
not exist yet**:

```
publicProfiles/{uid} = { nickname: "Explorer-XXXX", points: <users.points or 0>, pins: <users.pins or 0>, updatedAt: <server time> }
```

- `users/{uid}` is only read; nothing in it changes (TESTED: points, pins, email,
  displayName, photoURL, joinedAt, uid identical before and after).
- The e-mail, Google name and Google photo are **never** copied. The nickname is generated from
  the uid (same algorithm as the website); users can change it on their profile page.
- Existing profiles are never modified (TESTED, including a profile in the old
  `displayName/photoURL` shape, which is only counted as `existingWithNonPublicFields`).
- Users whose `points` or `pins` are not plain non-negative integers are skipped and counted
  (`skippedBadValues`) so the owner can look at them by hand.
- Re-running is idempotent (TESTED: the second run creates 0 and changes nothing).
- Output is counts only: no uids, names or e-mail addresses (TESTED).

Not strictly required: once the v3 website is live, every user who signs in gets a public
profile automatically (created in a transaction, mirroring their existing points; TESTED with
a doc shaped exactly like the owner's: points 25, pins 2, email, displayName, joinedAt,
photoURL, uid). The backfill only makes users who have not signed in since then appear in the
rankings and home statistics.

## Procedure

1. **Emulator first** (no approval needed, nothing leaves the machine):
   ```bash
   npm ci --prefix tests
   ./tests/node_modules/.bin/firebase emulators:exec --only firestore --project demo-strangepin \
     "node tests/admin-scripts.test.js"
   ```
2. **Production dry run: only after a separate, explicit approval from the owner.** It READS
   every `users` document and every matching `publicProfiles` document (no writes), using a
   service account key that the owner creates and keeps outside the repository (never
   committed, never shared):
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/path/outside/the/repo/strangepin-admin-key.json
   NODE_PATH=tests/node_modules node scripts/backfill-public-profiles.js --project=strangepin-4e538 --confirm
   ```
   Expected output: one JSON line of counts, e.g.
   `{"users":N,"created":0,"wouldCreate":N,"existing":0,"existingWithNonPublicFields":0,"skippedBadValues":0,"vanished":0}`.
3. Review the counts. If `skippedBadValues` > 0, fix those documents by hand first.
4. **Write run: only after a further explicit approval**, and after the v3 rules are
   deployed: add `--write`. Then re-run the dry run: `wouldCreate` must be 0.

The script refuses to start unless `FIRESTORE_EMULATOR_HOST` is set (with a `demo-*` project)
or both `--project=strangepin-4e538` and `--confirm` are given (TESTED).

## Spark (free) plan

Works on Spark: the Admin SDK reads and writes like any client; no Cloud Functions, no Blaze.
Cost: dry run ≈ 2 reads per user; write run ≈ 2 reads per user + 1 write per created profile.
With the free quota of 50,000 reads/day, up to ~25,000 users fit in one day.

What would need Blaze: a **managed export/backup** (`gcloud firestore export`, scheduled
backups, PITR) before the write run. On Spark, a backup is not possible through Google's
managed tools. Because the backfill only *creates* documents that do not exist and never
changes `users`, a backup is not required for rollback: deleting the created
`publicProfiles` documents restores the previous state. If the owner nevertheless wants a
backup, options are (a) enable Blaze temporarily (paid service, needs owner decision), or (b) a
read-only Admin SDK dump of `users` to a local JSON file kept private (contains e-mails; PII).

## Rollback

Delete the `publicProfiles` documents created by the run (they are identifiable by
`nickname` starting with `Explorer-` and `updatedAt` at the run time). The `users` collection is
untouched, so no point or pin data can be lost by the backfill.
