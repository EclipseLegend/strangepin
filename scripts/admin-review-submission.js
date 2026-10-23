#!/usr/bin/env node
// Owner-only tool: review location submissions and award points (Admin SDK).
//
// Points are never written by the website. A signed-in user's submission is stored as
// submissions/{id} with status "pending"; the owner approves or rejects it here. Each
// decision runs in ONE Firestore transaction that
//   1. refuses unless the submission exists and is still "pending",
//   2. refuses if pointAwards/{submissionId} already exists (ledger, created only if absent),
//   3. on approve: adds the points and +1 pin to users/{uid} and mirrors the new totals to
//      publicProfiles/{uid} (creating it with a generated nickname if it is missing),
//   4. writes the review fields on the submission: status, decision, reviewedAt, reviewedBy,
//      pointsAwarded, reviewNote.
// Running the same approval twice, or two approvals at the same time, awards points once.
//
// DRY RUN BY DEFAULT: without --write nothing is written; the plan is printed.
// See docs/admin-review.md for the full procedure and the Spark (free plan) quota.
//
// Usage (emulator):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 GCLOUD_PROJECT=demo-strangepin node scripts/admin-review-submission.js list
//   ... approve <submissionId> --reviewer=effie [--points=10] [--note="..."] [--write]
//   ... reject  <submissionId> --reviewer=effie [--note="..."] [--write]
// Production needs --project=strangepin-4e538 --confirm and GOOGLE_APPLICATION_CREDENTIALS.
'use strict';
const { parseArgs, resolveTarget, initAdmin, banner } = require('./lib/guard');
const { defaultNickname } = require('./lib/nickname');

const POINTS_PIN = 10;    // an approved location
const POINTS_PHOTO = 5;   // ... that came with a photo
const MAX_POINTS = 100;

class ReviewError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

function intOrZero(v, field) {
  if (v === undefined || v === null) return 0;
  if (!Number.isInteger(v) || v < 0) throw new ReviewError('BAD_LEGACY_VALUE', 'users.' + field + ' is not a non-negative integer; fix it by hand first');
  return v;
}

/**
 * Approve or reject one submission. Returns the plan/result object.
 * opts: { decision: 'approved'|'rejected', reviewer, points?, note?, write }
 */
async function review(admin, db, submissionId, opts) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(String(submissionId || ''))) throw new ReviewError('BAD_ID', 'invalid submission id');
  if (!['approved', 'rejected'].includes(opts.decision)) throw new ReviewError('BAD_DECISION', 'decision must be approved or rejected');
  const reviewer = String(opts.reviewer || '').trim();
  if (!/^[A-Za-z0-9 ._@-]{1,60}$/.test(reviewer)) throw new ReviewError('NO_REVIEWER', '--reviewer=<your name> is required');
  const note = String(opts.note || '').slice(0, 500);
  const FieldValue = admin.firestore.FieldValue;

  const subRef = db.collection('submissions').doc(submissionId);
  const awardRef = db.collection('pointAwards').doc(submissionId);

  return db.runTransaction(async tx => {
    const [sub, award] = await Promise.all([tx.get(subRef), tx.get(awardRef)]);
    if (!sub.exists) throw new ReviewError('NOT_FOUND', 'submission not found');
    const s = sub.data();
    if (s.status !== 'pending') throw new ReviewError('NOT_PENDING', 'submission is already "' + s.status + '"');
    if (award.exists) throw new ReviewError('ALREADY_AWARDED', 'pointAwards/' + submissionId + ' already exists; refusing to award twice');
    const uid = s.authorUid;
    if (typeof uid !== 'string' || !uid) throw new ReviewError('NO_AUTHOR', 'submission has no authorUid');

    let points = 0; let pins = 0; let totals = null;
    const userRef = db.collection('users').doc(uid);
    const pubRef = db.collection('publicProfiles').doc(uid);
    let user = null; let pub = null;
    if (opts.decision === 'approved') {
      points = opts.points !== undefined ? Number(opts.points) : POINTS_PIN + (s.imageUrl ? POINTS_PHOTO : 0);
      if (!Number.isInteger(points) || points < 0 || points > MAX_POINTS) throw new ReviewError('BAD_POINTS', '--points must be an integer 0..' + MAX_POINTS);
      pins = 1;
      [user, pub] = await Promise.all([tx.get(userRef), tx.get(pubRef)]);
      if (!user.exists) throw new ReviewError('NO_USER', 'users/' + uid + ' does not exist');
      const u = user.data();
      totals = { points: intOrZero(u.points, 'points') + points, pins: intOrZero(u.pins, 'pins') + pins };
    }

    const plan = { submissionId, uid, decision: opts.decision, pointsAwarded: points, newTotals: totals, write: !!opts.write };
    if (!opts.write) return plan;

    const now = FieldValue.serverTimestamp();
    // Ledger first: create() fails if it already exists, so a racing transaction cannot pass.
    tx.create(awardRef, { submissionId, uid, decision: opts.decision, points, pins, reviewedBy: reviewer, at: now });
    if (opts.decision === 'approved') {
      tx.update(userRef, { points: totals.points, pins: totals.pins });   // only these two fields
      if (pub.exists) tx.update(pubRef, { points: totals.points, pins: totals.pins, updatedAt: now });
      else tx.create(pubRef, { nickname: defaultNickname(uid), points: totals.points, pins: totals.pins, updatedAt: now });
    }
    tx.update(subRef, { status: opts.decision, decision: opts.decision, reviewedAt: now, reviewedBy: reviewer, pointsAwarded: points, reviewNote: note });
    return plan;
  });
}

async function listSubmissions(db, status, limit) {
  const snap = await db.collection('submissions').where('status', '==', status).limit(limit).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => ((a.createdAt && a.createdAt.toMillis()) || 0) - ((b.createdAt && b.createdAt.toMillis()) || 0));
}

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const [cmd, id] = positional;
  if (!['list', 'approve', 'reject'].includes(cmd)) {
    console.error('usage: admin-review-submission.js list [--status=pending] [--limit=25]\n' +
      '       admin-review-submission.js approve <id> --reviewer=<name> [--points=N] [--note=...] [--write]\n' +
      '       admin-review-submission.js reject  <id> --reviewer=<name> [--note=...] [--write]');
    process.exit(64);
  }
  const target = resolveTarget(flags);
  const admin = initAdmin(target);
  const db = admin.firestore();
  banner(target, 'admin-review-submission ' + cmd);

  if (cmd === 'list') {
    const status = typeof flags.status === 'string' ? flags.status : 'pending';
    const limit = Math.min(100, Math.max(1, parseInt(flags.limit, 10) || 25));
    const rows = await listSubmissions(db, status, limit);
    console.log(rows.length + ' submission(s) with status "' + status + '" (max ' + limit + ')');
    for (const r of rows) {
      const when = r.createdAt && r.createdAt.toDate ? r.createdAt.toDate().toISOString() : '?';
      console.log('- ' + r.id + ' | ' + when + ' | ' + r.category + ' | ' + JSON.stringify(String(r.name || '').slice(0, 60)) +
        ', ' + JSON.stringify(String(r.country || '').slice(0, 40)) + ' | photo: ' + (r.imageUrl ? 'yes' : 'no') + ' | author uid: ' + r.authorUid);
      console.log('    ' + JSON.stringify(String(r.story || '').slice(0, 160)));
    }
    return;
  }
  try {
    const res = await review(admin, db, id, {
      decision: cmd === 'approve' ? 'approved' : 'rejected',
      reviewer: flags.reviewer, note: flags.note,
      points: flags.points === undefined ? undefined : Number(flags.points),
      write: target.write,
    });
    console.log((target.write ? 'DONE: ' : 'DRY RUN, would do: ') + JSON.stringify(res));
    if (!target.write) console.log('Nothing was written. Re-run with --write to apply.');
  } catch (e) {
    if (e instanceof ReviewError) { console.error('REFUSED (' + e.code + '): ' + e.message); process.exit(3); }
    throw e;
  }
}

module.exports = { review, listSubmissions, ReviewError, POINTS_PIN, POINTS_PHOTO };
if (require.main === module) main().catch(e => { console.error(e.message || e); process.exit(1); });
