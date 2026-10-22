// Security-audit tests (2026-10-22) for the Firestore rules. Firestore EMULATOR ONLY,
// project demo-strangepin. Default target: firestore.rules (v2 on audit/firebase-rules).
// RULES_FILE=tests/fixtures/rules-v1-pr1.rules runs the same cases against PR #1's rules to
// show which gaps v1 leaves open (failures there are findings, not regressions).
//   firebase emulators:exec --only firestore --project demo-strangepin "node tests/rules-v2-audit.test.js"
'use strict';
const fs = require('fs'), path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, addDoc, collection, collectionGroup, writeBatch,
        serverTimestamp, increment, query, orderBy, limit, Timestamp, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');

const RULES_FILE = process.env.RULES_FILE || path.join(__dirname, '..', 'firestore.rules');
const GOOGLE = { firebase: { sign_in_provider: 'google.com' }, email: 'x@example.com', email_verified: true };
const results = [];
async function t(group, name, fn) {
  try { await fn(); results.push([group, name, true]); console.log('PASS -', `[${group}]`, name); }
  catch (e) { results.push([group, name, false]); console.log('FAIL -', `[${group}]`, name, '::', String(e.message).split('\n')[0].slice(0, 120)); }
}
const userDoc = (uid, extra = {}) => Object.assign({ uid, displayName: 'User ' + uid, email: uid + '@example.com', photoURL: '',
  points: 0, pins: 0, badges: [], achievements: [], followers: 0, following: 0, verified: false, country: '', bio: '', website: '',
  joinedAt: serverTimestamp(), lastActive: serverTimestamp(), notifications: { newComment: true, newReaction: true, weeklyDigest: true }, _schemaVersion: 2 }, extra);
const pubDoc = (uid, extra = {}) => Object.assign({ displayName: 'User ' + uid, photoURL: '', points: 0, pins: 0, updatedAt: serverTimestamp() }, extra);
const createAccount = (db, uid, u = {}, p = {}) => { const b = writeBatch(db); b.set(doc(db, 'users', uid), userDoc(uid, u)); b.set(doc(db, 'publicProfiles', uid), pubDoc(uid, p)); return b.commit(); };
const comment = (uid, extra = {}) => Object.assign({ uid, displayName: 'N', photoURL: '', text: 'hello', likes: 0, at: serverTimestamp() }, extra);
const likeBatch = (db, uid, cid = 'c1', inc = 1, marker = true) => { const b = writeBatch(db); if (marker) b.set(doc(db, 'pins', '001', 'comments', cid, 'likes', uid), { at: serverTimestamp() }); if (inc) b.update(doc(db, 'pins', '001', 'comments', cid), { likes: increment(inc) }); return b.commit(); };
const awardV1 = (db, uid, pts) => { const b = writeBatch(db); b.update(doc(db, 'users', uid), { points: increment(pts), pins: increment(1), lastPointsAt: serverTimestamp() }); b.update(doc(db, 'publicProfiles', uid), { points: increment(pts), pins: increment(1), updatedAt: serverTimestamp() }); return b.commit(); };

(async () => {
  console.log('rules file:', path.relative(process.cwd(), RULES_FILE));
  const env = await initializeTestEnvironment({ projectId: 'demo-strangepin', firestore: { rules: fs.readFileSync(RULES_FILE, 'utf8'), host: '127.0.0.1', port: 8085 } });
  const ctx = uid => env.authenticatedContext(uid, GOOGLE).firestore();
  const alice = ctx('alice'), bob = ctx('bob'), anon = env.unauthenticatedContext().firestore();
  const anonProvider = env.authenticatedContext('ghost', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  const pwProvider = env.authenticatedContext('bot', { firebase: { sign_in_provider: 'password' }, email: 'bot@spam.example' }).firestore();
  await env.clearFirestore();
  // Seed: alice + bob accounts, a comment by alice, a community pin doc with a non-curated id.
  await env.withSecurityRulesDisabled(async c => {
    const a = c.firestore();
    for (const u of ['alice', 'bob']) {
      await setDoc(doc(a, 'users', u), Object.assign(userDoc(u), { joinedAt: Timestamp.now(), lastActive: Timestamp.now() }));
      await setDoc(doc(a, 'publicProfiles', u), Object.assign(pubDoc(u), { updatedAt: Timestamp.now() }));
    }
    await setDoc(doc(a, 'pins', '001', 'comments', 'c1'), Object.assign(comment('alice'), { at: Timestamp.now() }));
    await setDoc(doc(a, 'pins', 'AbC123community', ), { name: 'Community pin', country: 'PT' });
    await setDoc(doc(a, 'users', 'alice', 'saved', '002'), { pinId: '002', at: Timestamp.now() });
  });

  // ── Legitimate flows (must keep working) ──────────────────────────────────
  const carol = ctx('carol');
  await t('legit', 'new user creates users + publicProfiles in one batch', () => assertSucceeds(createAccount(carol, 'carol')));
  await t('legit', 'owner reads own private doc', () => assertSucceeds(getDoc(doc(alice, 'users', 'alice'))));
  await t('legit', 'owner updates lastActive (server time)', () => assertSucceeds(updateDoc(doc(alice, 'users', 'alice'), { lastActive: serverTimestamp() })));
  await t('legit', 'owner edits bio/country/website', () => assertSucceeds(updateDoc(doc(alice, 'users', 'alice'), { bio: 'I like ruins', country: 'Portugal', website: 'https://example.com' })));
  await t('legit', 'owner updates public displayName', () => assertSucceeds(updateDoc(doc(alice, 'publicProfiles', 'alice'), { displayName: 'Alice', updatedAt: serverTimestamp() })));
  await t('legit', 'save a curated pin', () => assertSucceeds(setDoc(doc(alice, 'users', 'alice', 'saved', '001'), { pinId: '001', at: serverTimestamp() })));
  await t('legit', 'unsave', () => assertSucceeds(deleteDoc(doc(alice, 'users', 'alice', 'saved', '001'))));
  await t('legit', 'react, change reaction, remove reaction', async () => {
    await assertSucceeds(setDoc(doc(bob, 'pins', '001', 'reactions', 'bob'), { type: 'creepy', uid: 'bob', at: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(bob, 'pins', '001', 'reactions', 'bob'), { type: 'ufo', uid: 'bob', at: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(bob, 'pins', '001', 'reactions', 'bob')));
  });
  await t('legit', 'comment (addDoc) on a curated pin', () => assertSucceeds(addDoc(collection(bob, 'pins', '001', 'comments'), comment('bob'))));
  await t('legit', 'comment on an existing community pin document', () => assertSucceeds(addDoc(collection(bob, 'pins', 'AbC123community', 'comments'), comment('bob'))));
  await t('legit', 'author edits own comment text', () => assertSucceeds(updateDoc(doc(alice, 'pins', '001', 'comments', 'c1'), { text: 'edited' })));
  await t('legit', 'bob likes alice comment once (marker + increment)', () => assertSucceeds(likeBatch(bob, 'bob')));
  await t('public-read', 'anonymous reads leaderboard (publicProfiles orderBy points)', () => assertSucceeds(getDocs(query(collection(anon, 'publicProfiles'), orderBy('points', 'desc'), limit(50)))));
  await t('public-read', 'anonymous lists pins (home stats)', () => assertSucceeds(getDocs(collection(anon, 'pins'))));
  await t('public-read', 'anonymous reads comments (orderBy at desc)', () => assertSucceeds(getDocs(query(collection(anon, 'pins', '001', 'comments'), orderBy('at', 'desc'), limit(20)))));
  await t('public-read', 'anonymous reads reactions', () => assertSucceeds(getDocs(collection(anon, 'pins', '001', 'reactions'))));

  // ── Public read boundaries ────────────────────────────────────────────────
  await t('private-read', 'anonymous cannot read a users doc', () => assertFails(getDoc(doc(anon, 'users', 'alice'))));
  await t('private-read', 'signed-in user cannot list users (emails)', () => assertFails(getDocs(collection(bob, 'users'))));
  await t('private-read', "bob cannot read alice's saved pins", () => assertFails(getDocs(collection(bob, 'users', 'alice', 'saved'))));
  await t('private-read', 'collection-group query over all saved pins is denied', () => assertFails(getDocs(collectionGroup(bob, 'saved'))));
  await t('private-read', 'anonymous cannot read an unknown collection', () => assertFails(getDocs(collection(anon, 'admin'))));

  // ── Unauthenticated / non-Google writes ───────────────────────────────────
  await t('unauth', 'anonymous cannot create a profile', () => assertFails(createAccount(anon, 'x')));
  await t('unauth', 'anonymous cannot comment', () => assertFails(addDoc(collection(anon, 'pins', '001', 'comments'), comment('x'))));
  await t('unauth', 'anonymous cannot react', () => assertFails(setDoc(doc(anon, 'pins', '001', 'reactions', 'x'), { type: 'ufo', uid: 'x', at: serverTimestamp() })));
  await t('unauth', 'anonymous cannot like', () => assertFails(likeBatch(anon, 'x')));
  await t('provider', 'Firebase anonymous-auth user cannot comment', () => assertFails(addDoc(collection(anonProvider, 'pins', '001', 'comments'), comment('ghost'))));
  await t('provider', 'email/password user cannot create a profile', () => assertFails(createAccount(pwProvider, 'bot')));
  await t('provider', 'email/password user cannot react', () => assertFails(setDoc(doc(pwProvider, 'pins', '001', 'reactions', 'bot'), { type: 'ufo', uid: 'bot', at: serverTimestamp() })));

  // ── Cross-user modification ───────────────────────────────────────────────
  await t('cross-user', "bob cannot update alice's private doc", () => assertFails(updateDoc(doc(bob, 'users', 'alice'), { bio: 'pwned' })));
  await t('cross-user', "bob cannot update alice's public profile", () => assertFails(updateDoc(doc(bob, 'publicProfiles', 'alice'), { displayName: 'pwned', updatedAt: serverTimestamp() })));
  await t('cross-user', 'bob cannot create a profile for mallory', () => assertFails(createAccount(bob, 'mallory')));
  await t('cross-user', "bob cannot write a reaction under alice's uid", () => assertFails(setDoc(doc(bob, 'pins', '001', 'reactions', 'alice'), { type: 'ufo', uid: 'alice', at: serverTimestamp() })));
  await t('cross-user', "bob cannot delete alice's reaction", async () => {
    await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'pins', '001', 'reactions', 'alice'), { type: 'creepy', uid: 'alice', at: Timestamp.now() }));
    await assertFails(deleteDoc(doc(bob, 'pins', '001', 'reactions', 'alice')));
  });
  await t('cross-user', "bob cannot save into alice's saved list", () => assertFails(setDoc(doc(bob, 'users', 'alice', 'saved', '003'), { pinId: '003', at: serverTimestamp() })));
  await t('cross-user', "bob cannot edit alice's comment", () => assertFails(updateDoc(doc(bob, 'pins', '001', 'comments', 'c1'), { text: 'pwned' })));
  await t('cross-user', "bob cannot delete alice's comment", () => assertFails(deleteDoc(doc(bob, 'pins', '001', 'comments', 'c1'))));
  await t('cross-user', 'bob cannot post a comment with uid alice', () => assertFails(addDoc(collection(bob, 'pins', '001', 'comments'), comment('alice'))));
  await t('cross-user', "bob cannot create alice's like marker", () => assertFails(setDoc(doc(bob, 'pins', '001', 'comments', 'c1', 'likes', 'alice'), { at: serverTimestamp() })));

  // ── Admin / server-owned field tampering ──────────────────────────────────
  for (const [k, v] of [['verified', true], ['badges', ['admin']], ['achievements', ['x']], ['followers', 9999], ['following', 1], ['email', 'boss@strangepin.com'], ['uid', 'bob'], ['joinedAt', Timestamp.fromMillis(0)], ['role', 'admin'], ['isAdmin', true]])
    await t('admin-fields', `owner cannot change users.${k}`, () => assertFails(updateDoc(doc(alice, 'users', 'alice'), { [k]: v })));
  await t('admin-fields', 'cannot create own users doc with role: admin', () => assertFails(setDoc(doc(ctx('dave'), 'users', 'dave'), userDoc('dave', { role: 'admin' }))));
  await t('admin-fields', 'cannot add verified to public profile', () => assertFails(updateDoc(doc(alice, 'publicProfiles', 'alice'), { verified: true, updatedAt: serverTimestamp() })));
  await t('admin-fields', 'cannot create a comment pre-approved/pinned', () => assertFails(addDoc(collection(bob, 'pins', '001', 'comments'), comment('bob', { pinned: true }))));
  await t('admin-fields', 'cannot publish/approve a pin document', () => assertFails(setDoc(doc(bob, 'pins', '100'), { name: 'x', status: 'approved' })));
  await t('admin-fields', 'cannot modify an existing community pin', () => assertFails(updateDoc(doc(bob, 'pins', 'AbC123community'), { name: 'defaced' })));
  await t('admin-fields', 'cannot write a submissions doc', () => assertFails(setDoc(doc(bob, 'submissions', 's1'), { status: 'approved' })));
  await t('admin-fields', 'cannot write an admin/config doc', () => assertFails(setDoc(doc(bob, 'admin', 'config'), { admins: ['bob'] })));
  await t('admin-fields', 'cannot delete own users doc (admin process)', () => assertFails(deleteDoc(doc(alice, 'users', 'alice'))));
  await t('admin-fields', 'cannot delete own public profile', () => assertFails(deleteDoc(doc(alice, 'publicProfiles', 'alice'))));

  // ── Points and ranking integrity ──────────────────────────────────────────
  await t('points', 'v1-style mirrored award (+10, 1 pin) is denied', () => assertFails(awardV1(bob, 'bob', 10)));
  await t('points', 'v1-style mirrored award (+35, max per call) is denied', () => assertFails(awardV1(alice, 'alice', 35)));
  await t('points', 'set users.points directly is denied', () => assertFails(updateDoc(doc(bob, 'users', 'bob'), { points: 10000 })));
  await t('points', 'set publicProfiles.points directly is denied', () => assertFails(updateDoc(doc(bob, 'publicProfiles', 'bob'), { points: 10000, updatedAt: serverTimestamp() })));
  await t('points', 'create public profile with points > 0 is denied', () => assertFails((() => { const e = ctx('erin'); const b = writeBatch(e); b.set(doc(e, 'users', 'erin'), userDoc('erin')); b.set(doc(e, 'publicProfiles', 'erin'), pubDoc('erin', { points: 500 })); return b.commit(); })()));
  await t('points', 'create public profile without a users doc is denied', () => assertFails(setDoc(doc(ctx('frank'), 'publicProfiles', 'frank'), pubDoc('frank'))));
  await t('points', 'cannot reset lastPointsAt cooldown field', () => assertFails(updateDoc(doc(bob, 'users', 'bob'), { lastPointsAt: Timestamp.fromMillis(0) })));
  await t('points', 'cannot change pins counter', () => assertFails(updateDoc(doc(bob, 'users', 'bob'), { pins: 50 })));

  // ── Likes integrity ───────────────────────────────────────────────────────
  await t('likes', 'bob cannot like twice', () => assertFails(likeBatch(bob, 'bob')));
  await t('likes', 'increment without marker is denied', () => assertFails(updateDoc(doc(ctx('gina'), 'pins', '001', 'comments', 'c1'), { likes: increment(1) })));
  await t('likes', '+5 in one batch is denied', () => assertFails(likeBatch(ctx('hank'), 'hank', 'c1', 5)));
  await t('likes', 'decrement is denied', () => assertFails(likeBatch(ctx('ivan'), 'ivan', 'c1', -1)));
  await t('likes', 'marker without the +1 is denied (no orphan markers)', () => assertFails(likeBatch(ctx('judy'), 'judy', 'c1', 0)));
  await t('likes', 'like marker on a non-existent comment is denied', () => assertFails(setDoc(doc(ctx('kim'), 'pins', '001', 'comments', 'nope', 'likes', 'kim'), { at: serverTimestamp() })));
  await t('likes', 'bob cannot delete his marker to like again', () => assertFails(deleteDoc(doc(bob, 'pins', '001', 'comments', 'c1', 'likes', 'bob'))));
  await t('likes', 'author cannot change likes while editing text', () => assertFails(updateDoc(doc(alice, 'pins', '001', 'comments', 'c1'), { text: 'x', likes: 999 })));

  // ── Schema validation ─────────────────────────────────────────────────────
  const fresh = () => ctx('zed');
  await t('schema', 'users create missing email is denied', () => { const u = userDoc('zed'); delete u.email; const z = fresh(); const b = writeBatch(z); b.set(doc(z, 'users', 'zed'), u); b.set(doc(z, 'publicProfiles', 'zed'), pubDoc('zed')); return assertFails(b.commit()); });
  await t('schema', 'users create with numeric displayName is denied', () => assertFails(createAccount(fresh(), 'zed', { displayName: 123 })));
  await t('schema', 'users create with 81-char displayName is denied', () => assertFails(createAccount(fresh(), 'zed', { displayName: 'x'.repeat(81) })));
  await t('schema', 'users create with client-supplied joinedAt is denied', () => assertFails(createAccount(fresh(), 'zed', { joinedAt: Timestamp.fromMillis(0) })));
  await t('schema', 'users create with 100 kB email is denied', () => assertFails(createAccount(fresh(), 'zed', { email: 'x'.repeat(100000) })));
  await t('schema', 'users create with oversized notifications map is denied', () => assertFails(createAccount(fresh(), 'zed', { notifications: { newComment: true, junk: 'x'.repeat(5000) } })));
  await t('schema', 'users create with javascript: website is denied', () => assertFails(createAccount(fresh(), 'zed', { website: 'javascript:alert(1)' })));
  await t('schema', 'users create with lastPointsAt is denied', () => assertFails(createAccount(fresh(), 'zed', { lastPointsAt: Timestamp.fromMillis(0) })));
  await t('schema', 'bio of 501 chars is denied', () => assertFails(updateDoc(doc(alice, 'users', 'alice'), { bio: 'x'.repeat(501) })));
  await t('schema', 'http:// website is denied', () => assertFails(updateDoc(doc(alice, 'users', 'alice'), { website: 'http://example.com' })));
  await t('schema', 'lastActive with a client time is denied', () => assertFails(updateDoc(doc(alice, 'users', 'alice'), { lastActive: Timestamp.fromMillis(0) })));
  await t('schema', 'empty comment is denied', () => assertFails(addDoc(collection(bob, 'pins', '001', 'comments'), comment('bob', { text: '' }))));
  await t('schema', 'non-string comment is denied', () => assertFails(addDoc(collection(bob, 'pins', '001', 'comments'), comment('bob', { text: 42 }))));
  await t('schema', 'comment with client timestamp is denied', () => assertFails(addDoc(collection(bob, 'pins', '001', 'comments'), comment('bob', { at: Timestamp.fromMillis(0) }))));
  await t('schema', 'comment missing displayName is denied', () => { const c = comment('bob'); delete c.displayName; return assertFails(addDoc(collection(bob, 'pins', '001', 'comments'), c)); });
  await t('schema', 'reaction with client Date is denied', () => assertFails(setDoc(doc(bob, 'pins', '001', 'reactions', 'bob'), { type: 'ufo', uid: 'bob', at: new Date() })));
  await t('schema', 'reaction with unknown type is denied', () => assertFails(setDoc(doc(bob, 'pins', '001', 'reactions', 'bob'), { type: 'admin', uid: 'bob', at: serverTimestamp() })));
  await t('schema', 'saved doc with mismatched pinId is denied', () => assertFails(setDoc(doc(bob, 'users', 'bob', 'saved', '001'), { pinId: '002', at: serverTimestamp() })));

  // ── Invented pin ids (storage spam) ───────────────────────────────────────
  await t('pin-ids', 'comment on an invented pin id is denied', () => assertFails(addDoc(collection(bob, 'pins', 'buy-cheap-pills', 'comments'), comment('bob'))));
  await t('pin-ids', 'reaction on an invented pin id is denied', () => assertFails(setDoc(doc(bob, 'pins', 'x'.repeat(300), 'reactions', 'bob'), { type: 'ufo', uid: 'bob', at: serverTimestamp() })));
  await t('pin-ids', 'saving an invented pin id is denied', () => assertFails(setDoc(doc(bob, 'users', 'bob', 'saved', 'spam'), { pinId: 'spam', at: serverTimestamp() })));

  // ── Default deny ──────────────────────────────────────────────────────────
  await t('catch-all', 'unknown top-level collection write denied', () => assertFails(setDoc(doc(alice, 'anything', 'x'), { a: 1 })));
  await t('catch-all', 'unknown sub-collection under users denied', () => assertFails(setDoc(doc(alice, 'users', 'alice', 'private', 'x'), { a: 1 })));
  await t('catch-all', 'unknown sub-collection under pins denied', () => assertFails(setDoc(doc(alice, 'pins', '001', 'votes', 'alice'), { v: 1 })));

  await env.cleanup();
  const failed = results.filter(r => !r[2]);
  const groups = {};
  for (const [g, , ok] of results) { groups[g] = groups[g] || [0, 0]; groups[g][ok ? 0 : 1]++; }
  console.log('\nby group:', Object.entries(groups).map(([g, [p, f]]) => `${g} ${p}/${p + f}`).join(', '));
  console.log(`${results.length - failed.length}/${results.length} audit rules tests passed (${path.basename(RULES_FILE)})`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
