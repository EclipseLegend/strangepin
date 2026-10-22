// Tests for the owner's Admin SDK scripts (scripts/admin-review-submission.js and
// scripts/backfill-public-profiles.js). Firestore EMULATOR ONLY (demo-strangepin).
//   firebase emulators:exec --only firestore --project demo-strangepin "node tests/admin-scripts.test.js"
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('FIRESTORE_EMULATOR_HOST is not set: run inside firebase emulators:exec'); process.exit(2); }
process.env.GCLOUD_PROJECT = 'demo-strangepin';
const ROOT = path.join(__dirname, '..');
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'demo-strangepin' });
const db = admin.firestore();
const { Timestamp } = admin.firestore;
const { review, ReviewError } = require('../scripts/admin-review-submission.js');
const { backfill } = require('../scripts/backfill-public-profiles.js');
const guard = require('../scripts/lib/guard.js');
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const cf = require('firebase/firestore');
cf.setLogLevel('silent');

const results = [];
async function t(group, name, fn) {
  try { await fn(); results.push([group, name, true]); console.log('PASS -', `[${group}]`, name); }
  catch (e) { results.push([group, name, false]); console.log('FAIL -', `[${group}]`, name, '::', String(e && e.message || e).split('\n')[0].slice(0, 160)); }
}
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const get = async p => { const s = await db.doc(p).get(); return s.exists ? s.data() : null; };
const refused = async (p, code) => { try { await p; } catch (e) { if (e instanceof ReviewError && e.code === code) return; throw new Error('expected ' + code + ', got ' + (e.code || e.message)); } throw new Error('expected ' + code + ', but it succeeded'); };
const clear = () => fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-strangepin/databases/(default)/documents`, { method: 'DELETE' });
const JOINED = Timestamp.fromDate(new Date('2026-05-01T10:00:00Z'));
const legacy = uid => ({ uid, email: uid + '@gmail.example', displayName: 'Private Name ' + uid, photoURL: 'https://lh3.googleusercontent.com/a/' + uid, points: 25, pins: 2, joinedAt: JOINED });
const sub = (uid, extra = {}) => Object.assign({ authorUid: uid, status: 'pending', createdAt: Timestamp.now(), name: 'Old mill', country: 'Portugal', city: '', address: '',
  lat: 38.7, lng: -9.1, category: 'Haunted', story: 'Lights.', storyLang: 'en', date: '', intensity: 5, imageUrl: '', username: 'Mira' }, extra);
const R = 'effie';

(async () => {
  await clear();
  // ── Seed ────────────────────────────────────────────────────────────────
  await db.doc('users/owner').set(legacy('owner'));
  await db.doc('publicProfiles/owner').set({ nickname: 'Explorer-OWNR', points: 25, pins: 2, updatedAt: Timestamp.now() });
  await db.doc('users/noprofile').set(legacy('noprofile'));
  await db.doc('users/weird').set(Object.assign(legacy('weird'), { points: '25' }));
  await db.doc('submissions/s-photo').set(sub('owner', { imageUrl: 'https://res.cloudinary.com/dz9p5t4sj/image/upload/v1/a.jpg' }));
  await db.doc('submissions/s-reject').set(sub('owner'));
  await db.doc('submissions/s-conc').set(sub('owner'));
  await db.doc('submissions/s-tamper').set(sub('owner'));
  await db.doc('pointAwards/s-tamper').set({ submissionId: 's-tamper', uid: 'owner', points: 0, pins: 0, decision: 'approved', at: Timestamp.now() });
  await db.doc('submissions/s-noprofile').set(sub('noprofile'));
  await db.doc('submissions/s-weird').set(sub('weird'));
  await db.doc('submissions/s-client').set(sub('owner'));

  // ── Guard ───────────────────────────────────────────────────────────────
  await t('guard', 'refuses without FIRESTORE_EMULATOR_HOST and without --project/--confirm', () => { let threw = false; try { guard.resolveTarget({}, {}); } catch (e) { threw = /refusing/.test(e.message); } ok(threw); });
  await t('guard', 'refuses production with --project but no --confirm', () => { let threw = false; try { guard.resolveTarget({ project: 'strangepin-4e538' }, { GOOGLE_APPLICATION_CREDENTIALS: '/x' }); } catch (e) { threw = true; } ok(threw); });
  await t('guard', 'refuses production with --confirm but wrong project', () => { let threw = false; try { guard.resolveTarget({ project: 'other', confirm: true }, { GOOGLE_APPLICATION_CREDENTIALS: '/x' }); } catch (e) { threw = true; } ok(threw); });
  await t('guard', 'refuses production without a credentials file', () => { let threw = false; try { guard.resolveTarget({ project: 'strangepin-4e538', confirm: true }, {}); } catch (e) { threw = true; } ok(threw); });
  await t('guard', 'refuses emulator host with a non-demo project id', () => { let threw = false; try { guard.resolveTarget({}, { FIRESTORE_EMULATOR_HOST: 'x:1', GCLOUD_PROJECT: 'strangepin-4e538' }); } catch (e) { threw = true; } ok(threw); });
  await t('guard', 'production target is only resolved with --project=strangepin-4e538 --confirm + credentials (resolution only, no connection)', () => {
    const r = guard.resolveTarget({ project: 'strangepin-4e538', confirm: true }, { GOOGLE_APPLICATION_CREDENTIALS: '/outside/repo/key.json' });
    eq([r.projectId, r.emulator, r.write], ['strangepin-4e538', false, false]);
  });
  await t('guard', 'emulator target is dry run unless --write', () => { eq(guard.resolveTarget({}, { FIRESTORE_EMULATOR_HOST: 'x:1' }).write, false); eq(guard.resolveTarget({ write: true }, { FIRESTORE_EMULATOR_HOST: 'x:1' }).write, true); });
  await t('guard', 'CLI exits non-zero and touches nothing when FIRESTORE_EMULATOR_HOST is unset', () => {
    const env = Object.assign({}, process.env, { NODE_PATH: path.join(__dirname, 'node_modules') }); delete env.FIRESTORE_EMULATOR_HOST; delete env.GOOGLE_APPLICATION_CREDENTIALS;
    for (const args of [['scripts/admin-review-submission.js', 'list'], ['scripts/admin-review-submission.js', 'approve', 's-photo', '--reviewer=x', '--write'], ['scripts/backfill-public-profiles.js', '--write']]) {
      let code = 0; try { execFileSync('node', args, { cwd: ROOT, env, stdio: 'pipe' }); } catch (e) { code = e.status; }
      ok(code !== 0, args.join(' ') + ' should refuse');
    }
  });

  // ── Review: list, dry run, approve ──────────────────────────────────────
  const cli = (...args) => execFileSync('node', ['scripts/admin-review-submission.js', ...args], { cwd: ROOT, env: Object.assign({}, process.env, { NODE_PATH: path.join(__dirname, 'node_modules') }) }).toString();
  await t('review', 'list mode shows the pending submissions', () => { const out = cli('list'); ok(/7 submission\(s\) with status "pending"/.test(out), out.split('\n')[1]); ok(out.includes('s-photo') && !out.includes('@gmail.example'), 'no e-mail in list output'); });
  await t('review', 'approve without --write is a dry run (nothing written)', async () => {
    const out = cli('approve', 's-photo', '--reviewer=effie');
    ok(/DRY RUN/.test(out), out);
    eq((await get('submissions/s-photo')).status, 'pending'); eq((await get('users/owner')).points, 25); eq(await get('pointAwards/s-photo'), null);
  });
  await t('review', 'approve (with photo) awards +15 points and +1 pin atomically', async () => {
    const r = await review(admin, db, 's-photo', { decision: 'approved', reviewer: R, write: true });
    eq(r.pointsAwarded, 15);
    const u = await get('users/owner'), p = await get('publicProfiles/owner'), s = await get('submissions/s-photo'), l = await get('pointAwards/s-photo');
    eq([u.points, u.pins, p.points, p.pins], [40, 3, 40, 3]);
    eq([s.status, s.decision, s.reviewedBy, s.pointsAwarded], ['approved', 'approved', 'effie', 15]);
    ok(s.reviewedAt instanceof Timestamp, 'reviewedAt');
    eq([l.uid, l.points, l.pins, l.decision], ['owner', 15, 1, 'approved']);
    eq([u.email, u.displayName, u.photoURL, u.joinedAt.toMillis()], ['owner@gmail.example', 'Private Name owner', 'https://lh3.googleusercontent.com/a/owner', JOINED.toMillis()], 'other user fields untouched');
    eq(p.nickname, 'Explorer-OWNR', 'nickname untouched');
  });
  await t('review', 'duplicate approve is refused (NOT_PENDING) and awards nothing', async () => {
    await refused(review(admin, db, 's-photo', { decision: 'approved', reviewer: R, write: true }), 'NOT_PENDING');
    eq((await get('users/owner')).points, 40);
  });
  await t('review', 'duplicate approve via CLI exits 3 (refused)', () => { let code = 0; try { cli('approve', 's-photo', '--reviewer=effie', '--write'); } catch (e) { code = e.status; } eq(code, 3); });
  await t('review', 'reject: status rejected, 0 points, ledger written, points unchanged', async () => {
    await review(admin, db, 's-reject', { decision: 'rejected', reviewer: R, note: 'Duplicate of pin 012', write: true });
    const s = await get('submissions/s-reject'), l = await get('pointAwards/s-reject'), u = await get('users/owner');
    eq([s.status, s.decision, s.pointsAwarded, s.reviewNote, s.reviewedBy], ['rejected', 'rejected', 0, 'Duplicate of pin 012', 'effie']);
    eq([l.decision, l.points], ['rejected', 0]); eq([u.points, u.pins], [40, 3]);
  });
  await t('review', 'approve after reject is refused', () => refused(review(admin, db, 's-reject', { decision: 'approved', reviewer: R, write: true }), 'NOT_PENDING'));
  await t('review', 'concurrent approvals (8 at once) award exactly once', async () => {
    const before = (await get('users/owner')).points;
    const rs = await Promise.allSettled(Array.from({ length: 8 }, () => review(admin, db, 's-conc', { decision: 'approved', reviewer: R, write: true })));
    const okCount = rs.filter(r => r.status === 'fulfilled').length;
    const u = await get('users/owner'), p = await get('publicProfiles/owner');
    eq(okCount, 1, 'fulfilled');
    eq([u.points - before, p.points, u.pins, p.pins], [10, before + 10, 4, 4]);
    ok(rs.filter(r => r.status === 'rejected').every(r => ['NOT_PENDING', 'ALREADY_AWARDED'].includes(r.reason.code) || /ALREADY_EXISTS|already exists/i.test(String(r.reason.message))), rs.map(r => r.reason && (r.reason.code || r.reason.message)).join(','));
  });
  await t('review', 'ledger tampering: an existing pointAwards entry blocks the award (ALREADY_AWARDED)', async () => {
    const before = await get('users/owner');
    await refused(review(admin, db, 's-tamper', { decision: 'approved', reviewer: R, write: true }), 'ALREADY_AWARDED');
    eq((await get('users/owner')).points, before.points); eq((await get('submissions/s-tamper')).status, 'pending');
  });
  await t('review', 'approve for a user without a public profile creates one (generated nickname, no PII)', async () => {
    await review(admin, db, 's-noprofile', { decision: 'approved', reviewer: R, write: true });
    const p = await get('publicProfiles/noprofile');
    eq(Object.keys(p).sort(), ['nickname', 'pins', 'points', 'updatedAt']); ok(/^Explorer-[0-9A-Z]{4}$/.test(p.nickname), p.nickname); eq([p.points, p.pins], [35, 3]);
  });
  await t('review', 'non-integer legacy points are refused, nothing written', async () => {
    await refused(review(admin, db, 's-weird', { decision: 'approved', reviewer: R, write: true }), 'BAD_LEGACY_VALUE');
    eq((await get('users/weird')).points, '25'); eq((await get('submissions/s-weird')).status, 'pending'); eq(await get('pointAwards/s-weird'), null);
  });
  await t('review', 'unknown submission and bad --points are refused', async () => {
    await refused(review(admin, db, 'nope', { decision: 'approved', reviewer: R, write: true }), 'NOT_FOUND');
    await refused(review(admin, db, 's-client', { decision: 'approved', reviewer: R, points: 1000, write: true }), 'BAD_POINTS');
    await refused(review(admin, db, 's-client', { decision: 'approved', reviewer: '', write: true }), 'NO_REVIEWER');
  });

  // ── Non-admin clients (through firestore.rules) ─────────────────────────
  const env = await initializeTestEnvironment({ projectId: 'demo-strangepin', firestore: { rules: fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8085 } });
  const owner = env.authenticatedContext('owner', { firebase: { sign_in_provider: 'google.com' } }).firestore();
  const mallory = env.authenticatedContext('mallory', { firebase: { sign_in_provider: 'google.com' } }).firestore();
  await t('client', 'author cannot approve own submission', () => assertFails(cf.updateDoc(cf.doc(owner, 'submissions', 's-client'), { status: 'approved', decision: 'approved', pointsAwarded: 10, reviewedBy: 'owner', reviewedAt: cf.serverTimestamp() })));
  await t('client', 'author cannot award points with a ledger + users update batch', () => { const b = cf.writeBatch(owner); b.set(cf.doc(owner, 'pointAwards', 's-client'), { submissionId: 's-client', uid: 'owner', points: 10, pins: 1 }); b.update(cf.doc(owner, 'users', 'owner'), { points: cf.increment(10), pins: cf.increment(1) }); return assertFails(b.commit()); });
  await t('client', 'another user cannot approve or reject', () => assertFails(cf.updateDoc(cf.doc(mallory, 'submissions', 's-client'), { status: 'rejected' })));
  await t('client', 'client cannot pre-create a ledger entry to block an award', () => assertFails(cf.setDoc(cf.doc(mallory, 'pointAwards', 's-client'), { decision: 'rejected' })));
  await t('client', 'client cannot delete a ledger entry to allow a second award', () => assertFails(cf.deleteDoc(cf.doc(owner, 'pointAwards', 's-photo'))));
  await t('client', 'client cannot read the ledger', () => assertFails(cf.getDoc(cf.doc(owner, 'pointAwards', 's-photo'))));
  await t('client', 'client cannot raise publicProfiles points', () => assertFails(cf.updateDoc(cf.doc(owner, 'publicProfiles', 'owner'), { points: 9999, updatedAt: cf.serverTimestamp() })));
  await t('client', 'after the client attempts, s-client is still pending and points unchanged', async () => { eq((await get('submissions/s-client')).status, 'pending'); eq((await get('users/owner')).points, 50); });
  await env.cleanup();

  // ── Backfill ────────────────────────────────────────────────────────────
  await clear();
  const seedUsers = {
    legacyA: legacy('legacyA'),                                                          // owner-shaped legacy doc
    legacyB: { uid: 'legacyB', email: 'b@gmail.example', displayName: 'B Private', joinedAt: JOINED },   // no points/pins fields
    legacyC: Object.assign(legacy('legacyC'), { pins: 1.5 }),                           // bad value → skipped
    custom: { uid: 'custom', email: 'c@gmail.example', displayName: 'C Private', photoURL: '', points: 10, pins: 1, joinedAt: JOINED, _schemaVersion: 3 },
    v1shape: legacy('v1shape'),
  };
  for (const [id, d] of Object.entries(seedUsers)) await db.doc('users/' + id).set(d);
  await db.doc('publicProfiles/custom').set({ nickname: 'Ghost Hunter', points: 10, pins: 1, updatedAt: JOINED });
  await db.doc('publicProfiles/v1shape').set({ displayName: 'Private Name v1shape', photoURL: 'https://x', points: 25, pins: 2 });
  const snapshot = async () => { const out = {}; for (const c of ['users', 'publicProfiles']) for (const d of (await db.collection(c).get()).docs) out[c + '/' + d.id] = d.data(); return JSON.stringify(out); };
  const before = await snapshot();
  await t('backfill', 'dry run counts only and writes nothing', async () => {
    const c = await backfill(admin, db, { write: false, pageSize: 2 });
    eq(c, { users: 5, created: 0, wouldCreate: 2, existing: 2, existingWithNonPublicFields: 1, skippedBadValues: 1, vanished: 0 });
    eq(await snapshot(), before, 'database changed during dry run');
  });
  await t('backfill', 'dry-run CLI output has counts only (no uids, e-mails, names)', () => {
    const out = execFileSync('node', ['scripts/backfill-public-profiles.js'], { cwd: ROOT, env: Object.assign({}, process.env, { NODE_PATH: path.join(__dirname, 'node_modules') }) }).toString();
    ok(/"wouldCreate":2/.test(out) && /DRY RUN/.test(out), out);
    ok(!/legacyA|legacyB|gmail|Private|lh3|Ghost Hunter/.test(out), out);
  });
  await t('backfill', 'write creates the 2 missing profiles: nickname + score only, points/pins preserved', async () => {
    const c = await backfill(admin, db, { write: true, pageSize: 2 });
    eq([c.created, c.existing, c.skippedBadValues], [2, 2, 1]);
    const a = await get('publicProfiles/legacyA'), b = await get('publicProfiles/legacyB');
    eq(Object.keys(a).sort(), ['nickname', 'pins', 'points', 'updatedAt']);
    eq([a.points, a.pins, b.points, b.pins], [25, 2, 0, 0]);
    ok(/^Explorer-[0-9A-Z]{4}$/.test(a.nickname) && a.nickname !== b.nickname, a.nickname + ' ' + b.nickname);
    eq(await get('publicProfiles/legacyC'), null, 'bad legacy values are skipped');
  });
  await t('backfill', 'users docs are untouched (points, pins, email, name, photo, joinedAt)', async () => {
    for (const [id, d] of Object.entries(seedUsers)) eq(JSON.stringify(await get('users/' + id)), JSON.stringify((await db.doc('users/' + id).get()).data()), id); // read twice for shape
    const now = JSON.parse(await snapshot()), was = JSON.parse(before);
    for (const id of Object.keys(seedUsers)) eq(now['users/' + id], was['users/' + id], 'users/' + id);
  });
  await t('backfill', 'existing profiles (custom nickname, old v1 shape) are not modified', async () => {
    const now = JSON.parse(await snapshot()), was = JSON.parse(before);
    eq(now['publicProfiles/custom'], was['publicProfiles/custom']); eq(now['publicProfiles/v1shape'], was['publicProfiles/v1shape']);
  });
  await t('backfill', 're-run is idempotent: creates nothing, changes nothing', async () => {
    const mid = await snapshot();
    const c = await backfill(admin, db, { write: true, pageSize: 2 });
    eq([c.created, c.existing, c.skippedBadValues], [0, 4, 1]);
    eq(await snapshot(), mid);
  });

  const failed = results.filter(r => !r[2]);
  const groups = {};
  for (const [g, , okk] of results) { groups[g] = groups[g] || [0, 0]; groups[g][okk ? 0 : 1]++; }
  console.log('\nby group:', Object.entries(groups).map(([g, [p, f]]) => `${g} ${p}/${p + f}`).join(', '));
  console.log(`${results.length - failed.length}/${results.length} admin script tests passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
