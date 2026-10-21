// Firestore security-rules tests for the PROPOSED firestore.rules.
// Runs ONLY against the local Firestore emulator (project id "demo-strangepin";
// the "demo-" prefix makes the SDK refuse to talk to any real project).
//
//   npx firebase-tools emulators:exec --only firestore --project demo-strangepin "node tests/rules.test.js"
//
// Requires: @firebase/rules-unit-testing@3, firebase@10 (see tests/README.md).
'use strict';
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, writeBatch,
        serverTimestamp, increment, query, orderBy, limit, Timestamp, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');

const results = [];
async function t(name, fn) {
  try { await fn(); results.push([name, true]); console.log('PASS -', name); }
  catch (e) { results.push([name, false]); console.log('FAIL -', name, '::', e.message.split('\n')[0]); }
}

function newUser(uid, extra = {}) {
  return Object.assign({ uid, displayName: 'User ' + uid, email: uid + '@example.com', photoURL: '',
    points: 0, pins: 0, badges: [], achievements: [], followers: 0, following: 0, verified: false,
    country: '', bio: '', website: '', joinedAt: serverTimestamp(), lastActive: serverTimestamp(),
    notifications: { newComment: true, newReaction: true, weeklyDigest: true }, _schemaVersion: 2 }, extra);
}
function newPublic(uid) { return { displayName: 'User ' + uid, photoURL: '', points: 0, pins: 0, updatedAt: serverTimestamp() }; }
async function createAccount(db, uid) {
  const b = writeBatch(db);
  b.set(doc(db, 'users', uid), newUser(uid));
  b.set(doc(db, 'publicProfiles', uid), newPublic(uid));
  await b.commit();
}
function award(db, uid, pts, pins) {
  const b = writeBatch(db);
  b.update(doc(db, 'users', uid), { points: increment(pts), pins: increment(pins), lastPointsAt: serverTimestamp() });
  b.update(doc(db, 'publicProfiles', uid), { points: increment(pts), pins: increment(pins), updatedAt: serverTimestamp() });
  return b.commit();
}

(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-strangepin',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8085 },
  });
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  const anon = env.unauthenticatedContext().firestore();

  // Accounts
  await t('owner can create own user + public profile (batch)', () => assertSucceeds(createAccount(alice, 'alice')));
  await t('cannot create a user doc for someone else', () => assertFails(setDoc(doc(alice, 'users', 'mallory'), newUser('mallory'))));
  await t('cannot create own user doc with points > 0', () => assertFails(setDoc(doc(bob, 'users', 'bob'), newUser('bob', { points: 999 }))));
  await t('cannot create own user doc with verified=true', () => assertFails(setDoc(doc(bob, 'users', 'bob'), newUser('bob', { verified: true }))));
  await t('cannot create user doc with javascript: photoURL', () => assertFails(setDoc(doc(bob, 'users', 'bob'), newUser('bob', { photoURL: 'javascript:alert(1)' }))));
  await t('bob creates his account', () => assertSucceeds(createAccount(bob, 'bob')));

  // Privacy
  await t('owner can read own private doc', () => assertSucceeds(getDoc(doc(alice, 'users', 'alice'))));
  await t('other user cannot read private doc (email)', () => assertFails(getDoc(doc(bob, 'users', 'alice'))));
  await t('anonymous cannot list users', () => assertFails(getDocs(collection(anon, 'users'))));
  await t('anyone can read leaderboard (publicProfiles orderBy points)', () => assertSucceeds(getDocs(query(collection(anon, 'publicProfiles'), orderBy('points', 'desc'), limit(20)))));

  // Profile updates
  await t('owner can update lastActive', () => assertSucceeds(updateDoc(doc(alice, 'users', 'alice'), { lastActive: serverTimestamp() })));
  await t('owner cannot set verified=true', () => assertFails(updateDoc(doc(alice, 'users', 'alice'), { verified: true })));
  await t('owner cannot set badges', () => assertFails(updateDoc(doc(alice, 'users', 'alice'), { badges: ['admin'] })));

  // Points
  await t('award +15 points / +1 pin in a mirrored batch', () => assertSucceeds(award(alice, 'alice', 15, 1)));
  await t('second award within 30 s cooldown is denied', () => assertFails(award(alice, 'alice', 10, 1)));
  await t('bob: award +1000 points is denied', () => assertFails(award(bob, 'bob', 1000, 0)));
  await t('bob: award +2 pins is denied', () => assertFails(award(bob, 'bob', 10, 2)));
  await t('bob: set points directly on private doc only (no mirror) is denied', () =>
    assertFails(updateDoc(doc(bob, 'users', 'bob'), { points: 10, lastPointsAt: serverTimestamp() })));
  await t('bob: set public points without private doc is denied', () =>
    assertFails(updateDoc(doc(bob, 'publicProfiles', 'bob'), { points: 500, updatedAt: serverTimestamp() })));
  await t('bob: cannot touch alice public profile', () =>
    assertFails(updateDoc(doc(bob, 'publicProfiles', 'alice'), { displayName: 'pwned', updatedAt: serverTimestamp() })));
  await t('bob: decreasing points is denied', async () => {
    await env.withSecurityRulesDisabled(async c => { const f = c.firestore(); await updateDoc(doc(f, 'users', 'bob'), { points: 50, lastPointsAt: Timestamp.fromMillis(0) }); await updateDoc(doc(f, 'publicProfiles', 'bob'), { points: 50 }); });
    await assertFails(award(bob, 'bob', -10, 0));
  });
  await t('bob: award after cooldown is allowed', () => assertSucceeds(award(bob, 'bob', 10, 1)));

  // Saved pins
  await t('owner can save a pin', () => assertSucceeds(setDoc(doc(alice, 'users', 'alice', 'saved', '001'), { pinId: '001', at: serverTimestamp() })));
  await t('other user cannot read saved pins', () => assertFails(getDoc(doc(bob, 'users', 'alice', 'saved', '001'))));
  await t('owner can unsave', () => assertSucceeds(deleteDoc(doc(alice, 'users', 'alice', 'saved', '001'))));

  // Pins
  await t('anyone can read pins', () => assertSucceeds(getDocs(collection(anon, 'pins'))));
  await t('client cannot create pin docs', () => assertFails(setDoc(doc(alice, 'pins', '999'), { name: 'x' })));

  // Reactions
  const rAlice = doc(alice, 'pins', '001', 'reactions', 'alice');
  await t('user can set own reaction', () => assertSucceeds(setDoc(rAlice, { type: 'creepy', uid: 'alice', at: serverTimestamp() })));
  await t('unknown reaction type is denied', () => assertFails(setDoc(rAlice, { type: '<script>', uid: 'alice', at: serverTimestamp() })));
  await t('cannot write reaction as someone else', () => assertFails(setDoc(doc(bob, 'pins', '001', 'reactions', 'alice'), { type: 'ufo', uid: 'alice', at: serverTimestamp() })));
  await t('anonymous can read reactions', () => assertSucceeds(getDocs(collection(anon, 'pins', '001', 'reactions'))));
  await t('anonymous cannot react', () => assertFails(setDoc(doc(anon, 'pins', '001', 'reactions', 'x'), { type: 'ufo', uid: 'x', at: serverTimestamp() })));

  // Comments
  const cRef = doc(alice, 'pins', '001', 'comments', 'c1');
  const comment = (uid, extra = {}) => Object.assign({ uid, displayName: 'A', photoURL: '', text: 'hello', likes: 0, at: serverTimestamp() }, extra);
  await t('signed-in user can comment', () => assertSucceeds(setDoc(cRef, comment('alice'))));
  await t('cannot comment as someone else', () => assertFails(setDoc(doc(bob, 'pins', '001', 'comments', 'c2'), comment('alice'))));
  await t('cannot create comment with likes > 0', () => assertFails(setDoc(doc(bob, 'pins', '001', 'comments', 'c3'), comment('bob', { likes: 99 }))));
  await t('cannot create 5,000-char comment', () => assertFails(setDoc(doc(bob, 'pins', '001', 'comments', 'c4'), comment('bob', { text: 'x'.repeat(5000) }))));
  await t('anonymous cannot comment', () => assertFails(setDoc(doc(anon, 'pins', '001', 'comments', 'c5'), comment('anon'))));
  await t('other user cannot edit comment text', () => assertFails(updateDoc(doc(bob, 'pins', '001', 'comments', 'c1'), { text: 'pwned' })));
  await t('author can edit own comment text', () => assertSucceeds(updateDoc(cRef, { text: 'edited' })));
  const like = db => { const b = writeBatch(db); b.set(doc(db, 'pins', '001', 'comments', 'c1', 'likes', db === bob ? 'bob' : 'alice'), { at: serverTimestamp() }); b.update(doc(db, 'pins', '001', 'comments', 'c1'), { likes: increment(1) }); return b.commit(); };
  await t('bob can like once (marker + increment)', () => assertSucceeds(like(bob)));
  await t('bob cannot like twice', () => assertFails(like(bob)));
  await t('increment likes without marker is denied', () => assertFails(updateDoc(doc(alice, 'pins', '001', 'comments', 'c1'), { likes: increment(1) })));
  await t('likes +5 is denied', () => assertFails(updateDoc(doc(alice, 'pins', '001', 'comments', 'c1'), { likes: increment(5) })));
  await t('other user cannot delete comment', () => assertFails(deleteDoc(doc(bob, 'pins', '001', 'comments', 'c1'))));
  await t('author can delete comment', () => assertSucceeds(deleteDoc(cRef)));

  // Default deny
  await t('unknown collection is closed', () => assertFails(setDoc(doc(alice, 'admin', 'x'), { a: 1 })));

  await env.cleanup();
  const failed = results.filter(r => !r[1]).length;
  console.log(`\n${results.length - failed}/${results.length} rules tests passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
