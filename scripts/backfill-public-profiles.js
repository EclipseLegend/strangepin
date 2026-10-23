#!/usr/bin/env node
// One-off migration: create publicProfiles/{uid} for existing (legacy) users.
//
// * Legacy compatible: users/{uid} is only READ, never changed. Points and pins are copied
//   as they are (missing → 0); a user whose points or pins are not plain non-negative
//   integers is skipped and counted, so the owner can look at it by hand.
// * Create-if-absent: an existing public profile is never touched (idempotent; re-running
//   creates nothing new).
// * Privacy: the public profile holds ONLY { nickname, points, pins, updatedAt }. The e-mail,
//   Google name and photo are never copied; the nickname is generated ("Explorer-XXXX") and
//   users can change it on their profile page.
// * Output is counts only (no uids, names or e-mail addresses).
// * DRY RUN BY DEFAULT. Writing needs --write. Targets are guarded by scripts/lib/guard.js:
//   emulator (FIRESTORE_EMULATOR_HOST + demo-* project) or production only with
//   --project=strangepin-4e538 --confirm. See docs/backfill-dry-run.md before any production run.
'use strict';
const { parseArgs, resolveTarget, initAdmin, banner } = require('./lib/guard');
const { defaultNickname } = require('./lib/nickname');

const PAGE = 300;
const isCount = v => v === undefined || v === null || (Number.isInteger(v) && v >= 0);

async function backfill(admin, db, { write, pageSize }) {
  const FieldValue = admin.firestore.FieldValue;
  const counts = { users: 0, created: 0, wouldCreate: 0, existing: 0, existingWithNonPublicFields: 0, skippedBadValues: 0, vanished: 0 };
  let last = null;
  for (;;) {
    let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize || PAGE);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    if (page.empty) break;
    for (const doc of page.docs) {
      counts.users++;
      const uid = doc.id;
      const pubRef = db.collection('publicProfiles').doc(uid);
      if (!write) {
        const pub = await pubRef.get();
        const u = doc.data();
        if (pub.exists) { counts.existing++; if (Object.keys(pub.data()).some(k => !['nickname', 'points', 'pins', 'updatedAt'].includes(k))) counts.existingWithNonPublicFields++; }
        else if (!isCount(u.points) || !isCount(u.pins)) counts.skippedBadValues++;
        else counts.wouldCreate++;
        continue;
      }
      const result = await db.runTransaction(async tx => {
        const [u, pub] = await Promise.all([tx.get(doc.ref), tx.get(pubRef)]);
        if (!u.exists) return 'vanished';
        if (pub.exists) {
          const extra = Object.keys(pub.data()).some(k => !['nickname', 'points', 'pins', 'updatedAt'].includes(k));
          return extra ? 'existingWithNonPublicFields' : 'existing';
        }
        const d = u.data();
        if (!isCount(d.points) || !isCount(d.pins)) return 'skippedBadValues';
        tx.create(pubRef, { nickname: defaultNickname(uid), points: d.points || 0, pins: d.pins || 0, updatedAt: FieldValue.serverTimestamp() });
        return 'created';
      });
      if (result === 'existingWithNonPublicFields') { counts.existing++; counts.existingWithNonPublicFields++; }
      else counts[result]++;
    }
    last = page.docs[page.docs.length - 1];
  }
  return counts;
}

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const target = resolveTarget(flags);
  const admin = initAdmin(target);
  banner(target, 'backfill-public-profiles');
  const counts = await backfill(admin, admin.firestore(), { write: target.write });
  console.log(JSON.stringify(counts));
  if (!target.write) console.log('Dry run: nothing was written. Re-run with --write to create the missing profiles.');
}

module.exports = { backfill };
if (require.main === module) main().catch(e => { console.error(e.message || e); process.exit(1); });
