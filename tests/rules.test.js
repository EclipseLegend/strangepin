// Firestore security-rules tests for firestore.rules v3 (manual review + admin-owned points).
// Runs ONLY against the local Firestore emulator (project "demo-strangepin"; the "demo-"
// prefix makes the SDK unable to reach any real project). Includes every case of the
// 2026-10-22 audit suite (formerly tests/rules-v2-audit.test.js), adapted to v3.
//
//   firebase emulators:exec --only firestore --project demo-strangepin "node tests/rules.test.js"
'use strict';
const fs = require('fs'), path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, addDoc, collection, collectionGroup, writeBatch,
        serverTimestamp, increment, query, orderBy, limit, where, Timestamp, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');

const RULES_FILE = process.env.RULES_FILE || path.join(__dirname, '..', 'firestore.rules');
const GOOGLE = { firebase: { sign_in_provider: 'google.com' }, email: 'x@example.com', email_verified: true };
const results = [];
async function t(group, name, fn) {
  try { await fn(); results.push([group, name, true]); console.log('PASS -', `[${group}]`, name); }
  catch (e) { results.push([group, name, false]); console.log('FAIL -', `[${group}]`, name, '::', String(e.message).split('\n')[0].slice(0, 140)); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Shapes written by the v3 client (index.html).
const userDoc = (uid, extra = {}) => Object.assign({ uid, displayName: 'User ' + uid, email: uid + '@example.com', photoURL: '',
  points: 0, pins: 0, joinedAt: serverTimestamp(), lastActive: serverTimestamp(), _schemaVersion: 3 }, extra);
const pubDoc = (nickname, extra = {}) => Object.assign({ nickname, points: 0, pins: 0, updatedAt: serverTimestamp() }, extra);
const signUp = (db, uid, nick = 'Explorer-' + uid.slice(0, 4).toUpperCase().padEnd(4, 'X'), u = {}, p = {}) => {
  const b = writeBatch(db); b.set(doc(db, 'users', uid), userDoc(uid, u)); b.set(doc(db, 'publicProfiles', uid), pubDoc(nick, p)); return b.commit();
};
const commentBatch = (db, uid, authorName, extra = {}, pin = '001', stamp = true) => {
  const b = writeBatch(db);
  b.set(doc(collection(db, 'pins', pin, 'comments')), Object.assign({ uid, authorName, text: 'hello', likes: 0, at: serverTimestamp() }, extra));
  if (stamp) b.update(doc(db, 'users', uid), { lastCommentAt: serverTimestamp() });
  return b.commit();
};
const likeBatch = (db, uid, cid = 'c1', inc = 1, marker = true) => { const b = writeBatch(db); if (marker) b.set(doc(db, 'pins', '001', 'comments', cid, 'likes', uid), { at: serverTimestamp() }); if (inc) b.update(doc(db, 'pins', '001', 'comments', cid), { likes: increment(inc) }); return b.commit(); };
const submission = (uid, extra = {}) => Object.assign({ authorUid: uid, status: 'pending', createdAt: serverTimestamp(), name: 'Old mill', country: 'Portugal',
  city: 'Sintra', address: '', lat: 38.79, lng: -9.39, category: 'Haunted', story: 'Lights at night.', storyLang: 'en', date: '', intensity: 5,
  imageUrl: '', username: 'Mira' }, extra);
const submitBatch = (db, uid, extra = {}, stamp = true, id) => {
  const b = writeBatch(db);
  b.set(id ? doc(db, 'submissions', id) : doc(collection(db, 'submissions')), submission(uid, extra));
  if (stamp) b.update(doc(db, 'users', uid), { lastSubmissionAt: serverTimestamp() });
  return b.commit();
};
// The owner's real legacy document shape (OWNER-REPORTED): points 25, pins 2, email, displayName, joinedAt, photoURL, uid.
const legacyDoc = uid => ({ uid, email: uid + '@gmail.example', displayName: 'Legacy Owner Name', photoURL: 'https://lh3.googleusercontent.com/a/legacy',
  points: 25, pins: 2, joinedAt: Timestamp.fromDate(new Date('2026-05-01T10:00:00Z')) });

(async () => {
  console.log('rules file:', path.relative(process.cwd(), RULES_FILE));
  const env = await initializeTestEnvironment({ projectId: 'demo-strangepin', firestore: { rules: fs.readFileSync(RULES_FILE, 'utf8'), host: '127.0.0.1', port: 8085 } });
  const ctx = uid => env.authenticatedContext(uid, GOOGLE).firestore();
  const alice = ctx('alice'), bob = ctx('bob'), anon = env.unauthenticatedContext().firestore();
  const anonProvider = env.authenticatedContext('ghost', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  const pwProvider = env.authenticatedContext('bot', { firebase: { sign_in_provider: 'password' }, email: 'bot@spam.example' }).firestore();
  // withSecurityRulesDisabled resolves to undefined, so capture the callback's value.
  const admin = async fn => { let out; await env.withSecurityRulesDisabled(async c => { out = await fn(c.firestore()); }); return out; };
  await env.clearFirestore();
  await admin(async a => {
    for (const u of ['alice', 'bob']) {
      await setDoc(doc(a, 'users', u), Object.assign(userDoc(u), { joinedAt: Timestamp.now(), lastActive: Timestamp.now() }));
      await setDoc(doc(a, 'publicProfiles', u), { nickname: u === 'alice' ? 'Alice' : 'Bobby', points: 0, pins: 0, updatedAt: Timestamp.now() });
    }
    await setDoc(doc(a, 'pins', '001', 'comments', 'c1'), { uid: 'alice', authorName: 'Alice', text: 'hello', likes: 0, at: Timestamp.now() });
    await setDoc(doc(a, 'pins', 'AbC123community'), { name: 'Community pin', country: 'PT' });
    await setDoc(doc(a, 'users', 'alice', 'saved', '002'), { pinId: '002', at: Timestamp.now() });
    await setDoc(doc(a, 'users', 'legacy1'), legacyDoc('legacy1'));
    await setDoc(doc(a, 'users', 'legacy2'), legacyDoc('legacy2'));
  });

  // ── Legitimate flows ─────────────────────────────────────────────────────
  await t('legit', 'new user creates users (points 0) + publicProfiles (generated nickname) in one batch', () => assertSucceeds(signUp(ctx('carol'), 'carol')));
  await t('legit', 'owner reads own private doc', () => assertSucceeds(getDoc(doc(alice, 'users', 'alice'))));
  await t('legit', 'owner updates lastActive (server time)', () => assertSucceeds(updateDoc(doc(alice, 'users', 'alice'), { lastActive: serverTimestamp() })));
  await t('legit', 'owner changes nickname', () => assertSucceeds(updateDoc(doc(alice, 'publicProfiles', 'alice'), { nickname: 'Alice B', updatedAt: serverTimestamp() })));
  await t('legit', 'save a curated pin', () => assertSucceeds(setDoc(doc(alice, 'users', 'alice', 'saved', '001'), { pinId: '001', at: serverTimestamp() })));
  await t('legit', 'unsave', () => assertSucceeds(deleteDoc(doc(alice, 'users', 'alice', 'saved', '001'))));
  await t('legit', 'react, change reaction, remove reaction', async () => {
    await assertSucceeds(setDoc(doc(bob, 'pins', '001', 'reactions', 'bob'), { type: 'creepy', uid: 'bob', at: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(bob, 'pins', '001', 'reactions', 'bob'), { type: 'ufo', uid: 'bob', at: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(bob, 'pins', '001', 'reactions', 'bob')));
  });
  await t('legit', 'comment with authorName = own nickname + lastCommentAt stamp', () => assertSucceeds(commentBatch(bob, 'bob', 'Bobby')));
  await t('legit', 'comment on an existing community pin document (after cooldown)', async () => { await sleep(15500); await assertSucceeds(commentBatch(bob, 'bob', 'Bobby', {}, 'AbC123community')); });
  await t('legit', 'author edits own comment text', () => assertSucceeds(updateDoc(doc(alice, 'pins', '001', 'comments', 'c1'), { text: 'edited' })));
  await t('legit', 'bob likes alice comment once (marker + increment)', () => assertSucceeds(likeBatch(bob, 'bob')));
  await t('public-read', 'anonymous reads leaderboard (publicProfiles orderBy points)', () => assertSucceeds(getDocs(query(collection(anon, 'publicProfiles'), orderBy('points', 'desc'), limit(50)))));
  await t('public-read', 'anonymous lists pins (home stats)', () => assertSucceeds(getDocs(collection(anon, 'pins'))));
  await t('public-read', 'anonymous reads comments (orderBy at desc)', () => assertSucceeds(getDocs(query(collection(anon, 'pins', '001', 'comments'), orderBy('at', 'desc'), limit(20)))));
  await t('public-read', 'anonymous reads reactions', () => assertSucceeds(getDocs(collection(anon, 'pins', '001', 'reactions'))));

  // ── Existing (legacy) users ──────────────────────────────────────────────
  const legacy = ctx('legacy1');
  await t('legacy', 'legacy owner can read own legacy doc', () => assertSucceeds(getDoc(doc(legacy, 'users', 'legacy1'))));
  await t('legacy', 'legacy owner updates lastActive only', () => assertSucceeds(updateDoc(doc(legacy, 'users', 'legacy1'), { lastActive: serverTimestamp() })));
  await t('legacy', 'sign-in overwrite with a fresh doc (points 0) is denied', () => assertFails(setDoc(doc(legacy, 'users', 'legacy1'), userDoc('legacy1'))));
  await t('legacy', 'merge {points: 0, pins: 0} is denied', () => assertFails(setDoc(doc(legacy, 'users', 'legacy1'), { points: 0, pins: 0 }, { merge: true })));
  await t('legacy', 'public profile with points reset to 0 is denied', () => assertFails(setDoc(doc(legacy, 'publicProfiles', 'legacy1'), pubDoc('Explorer-AAAA'))));
  await t('legacy', 'public profile with inflated points is denied', () => assertFails(setDoc(doc(legacy, 'publicProfiles', 'legacy1'), pubDoc('Explorer-AAAA', { points: 250, pins: 2 }))));
  await t('legacy', 'public profile mirroring 25 points / 2 pins is allowed', () => assertSucceeds(setDoc(doc(legacy, 'publicProfiles', 'legacy1'), pubDoc('Explorer-AAAA', { points: 25, pins: 2 }))));
  await t('legacy', 'public profile cannot carry the Google name/photo/email', () => assertFails(setDoc(doc(ctx('legacy2'), 'publicProfiles', 'legacy2'), pubDoc('Explorer-BBBB', { points: 25, pins: 2, displayName: 'Legacy Owner Name', photoURL: 'https://x' }))));
  await t('legacy', 'legacy doc still has points 25 / pins 2 / email / name after all attempts', async () => {
    const d = await admin(a => getDoc(doc(a, 'users', 'legacy1')));
    const v = d.data();
    if (!(v.points === 25 && v.pins === 2 && v.email === 'legacy1@gmail.example' && v.displayName === 'Legacy Owner Name' && v.photoURL)) throw new Error(JSON.stringify(v));
  });
  await t('legacy', 'legacy owner cannot delete own doc', () => assertFails(deleteDoc(doc(legacy, 'users', 'legacy1'))));

  // ── Public read boundaries ───────────────────────────────────────────────
  await t('private-read', 'anonymous cannot read a users doc', () => assertFails(getDoc(doc(anon, 'users', 'alice'))));
  await t('private-read', 'signed-in user cannot list users (emails)', () => assertFails(getDocs(collection(bob, 'users'))));
  await t('private-read', "bob cannot read alice's private doc", () => assertFails(getDoc(doc(bob, 'users', 'alice'))));
  await t('private-read', "bob cannot read alice's saved pins", () => assertFails(getDocs(collection(bob, 'users', 'alice', 'saved'))));
  await t('private-read', 'collection-group query over all saved pins is denied', () => assertFails(getDocs(collectionGroup(bob, 'saved'))));
  await t('private-read', 'anonymous cannot read an unknown collection', () => assertFails(getDocs(collection(anon, 'admin'))));

  // ── Auth: Google only ────────────────────────────────────────────────────
  await t('auth', 'unauthenticated cannot create a profile', () => assertFails(signUp(anon, 'x')));
  await t('auth', 'unauthenticated cannot comment', () => assertFails(addDoc(collection(anon, 'pins', '001', 'comments'), { uid: 'x', authorName: 'X', text: 'spam', likes: 0, at: serverTimestamp() })));
  await t('auth', 'unauthenticated cannot react', () => assertFails(setDoc(doc(anon, 'pins', '001', 'reactions', 'x'), { type: 'ufo', uid: 'x', at: serverTimestamp() })));
  await t('auth', 'unauthenticated cannot like', () => assertFails(likeBatch(anon, 'x')));
  await t('auth', 'unauthenticated cannot submit a location', () => assertFails(addDoc(collection(anon, 'submissions'), submission('x'))));
  await t('auth', 'anonymous-provider user cannot create a profile', () => assertFails(signUp(anonProvider, 'ghost')));
  await t('auth', 'anonymous-provider user cannot comment', () => assertFails(commentBatch(anonProvider, 'ghost', 'Ghost')));
  await t('auth', 'anonymous-provider user cannot submit', () => assertFails(submitBatch(anonProvider, 'ghost')));
  await t('auth', 'email/password user cannot create a profile', () => assertFails(signUp(pwProvider, 'bot')));
  await t('auth', 'email/password user cannot react', () => assertFails(setDoc(doc(pwProvider, 'pins', '001', 'reactions', 'bot'), { type: 'ufo', uid: 'bot', at: serverTimestamp() })));
  await t('auth', 'email/password user cannot submit', () => assertFails(submitBatch(pwProvider, 'bot')));
  await t('auth', 'email/password user cannot request deletion', () => assertFails(setDoc(doc(pwProvider, 'deletionRequests', 'bot'), { uid: 'bot', status: 'requested', requestedAt: serverTimestamp() })));

  // ── Cross-user modification ──────────────────────────────────────────────
  await t('cross-user', "bob cannot update alice's private doc", () => assertFails(updateDoc(doc(bob, 'users', 'alice'), { lastActive: serverTimestamp() })));
  await t('cross-user', "bob cannot change alice's nickname", () => assertFails(updateDoc(doc(bob, 'publicProfiles', 'alice'), { nickname: 'pwned', updatedAt: serverTimestamp() })));
  await t('cross-user', 'bob cannot create a profile for mallory', () => assertFails(signUp(bob, 'mallory')));
  await t('cross-user', "bob cannot write a reaction under alice's uid", () => assertFails(setDoc(doc(bob, 'pins', '001', 'reactions', 'alice'), { type: 'ufo', uid: 'alice', at: serverTimestamp() })));
  await t('cross-user', "bob cannot delete alice's reaction", async () => {
    await admin(a => setDoc(doc(a, 'pins', '001', 'reactions', 'alice'), { type: 'creepy', uid: 'alice', at: Timestamp.now() }));
    await assertFails(deleteDoc(doc(bob, 'pins', '001', 'reactions', 'alice')));
  });
  await t('cross-user', "bob cannot save into alice's saved list", () => assertFails(setDoc(doc(bob, 'users', 'alice', 'saved', '003'), { pinId: '003', at: serverTimestamp() })));
  await t('cross-user', "bob cannot edit alice's comment", () => assertFails(updateDoc(doc(bob, 'pins', '001', 'comments', 'c1'), { text: 'pwned' })));
  await t('cross-user', "bob cannot delete alice's comment", () => assertFails(deleteDoc(doc(bob, 'pins', '001', 'comments', 'c1'))));
  await t('cross-user', 'bob cannot post a comment with uid alice', () => assertFails(commentBatch(bob, 'alice', 'Alice B', {}, '001', false)));
  await t('cross-user', "bob cannot create alice's like marker", () => assertFails(setDoc(doc(bob, 'pins', '001', 'comments', 'c1', 'likes', 'alice'), { at: serverTimestamp() })));

  // ── Server-owned fields: points, pins, roles ─────────────────────────────
  for (const [k, v] of [['points', 10000], ['pins', 50], ['role', 'admin'], ['isAdmin', true], ['verified', true], ['badges', ['admin']],
                        ['email', 'boss@strangepin.com'], ['displayName', 'StrangePin Team'], ['uid', 'bob'], ['joinedAt', Timestamp.fromMillis(0)], ['_schemaVersion', 99]])
    await t('server-owned', `owner cannot change users.${k}`, () => assertFails(updateDoc(doc(alice, 'users', 'alice'), { [k]: v })));
  await t('server-owned', 'users.points via increment is denied', () => assertFails(updateDoc(doc(alice, 'users', 'alice'), { points: increment(10), pins: increment(1) })));
  await t('server-owned', 'mirrored award batch (+10 users and profile) is denied', () => { const b = writeBatch(bob); b.update(doc(bob, 'users', 'bob'), { points: increment(10), pins: increment(1) }); b.update(doc(bob, 'publicProfiles', 'bob'), { points: increment(10), pins: increment(1), updatedAt: serverTimestamp() }); return assertFails(b.commit()); });
  await t('server-owned', 'publicProfiles.points direct write is denied', () => assertFails(updateDoc(doc(bob, 'publicProfiles', 'bob'), { points: 10000, updatedAt: serverTimestamp() })));
  await t('server-owned', 'publicProfiles.pins direct write is denied', () => assertFails(updateDoc(doc(bob, 'publicProfiles', 'bob'), { pins: 99, updatedAt: serverTimestamp() })));
  await t('server-owned', 'publicProfiles cannot gain role/verified', () => assertFails(updateDoc(doc(bob, 'publicProfiles', 'bob'), { role: 'admin', updatedAt: serverTimestamp() })));
  await t('server-owned', 'new users doc with points > 0 is denied', () => assertFails(signUp(ctx('dave'), 'dave', 'Dave Here', { points: 500 }, { points: 500 })));
  await t('server-owned', 'new users doc with role: admin is denied', () => assertFails(signUp(ctx('dave'), 'dave', 'Dave Here', { role: 'admin' })));
  await t('server-owned', 'new users doc with extra legacy fields (badges, verified) is denied', () => assertFails(signUp(ctx('dave'), 'dave', 'Dave Here', { badges: [], verified: false })));
  await t('server-owned', 'public profile without a users doc is denied', () => assertFails(setDoc(doc(ctx('frank'), 'publicProfiles', 'frank'), pubDoc('Frankie'))));
  await t('server-owned', 'cannot delete own users doc', () => assertFails(deleteDoc(doc(alice, 'users', 'alice'))));
  await t('server-owned', 'cannot delete own public profile', () => assertFails(deleteDoc(doc(alice, 'publicProfiles', 'alice'))));
  await t('server-owned', 'cannot publish/approve a pin document', () => assertFails(setDoc(doc(bob, 'pins', '100'), { name: 'x', status: 'approved' })));
  await t('server-owned', 'cannot modify an existing community pin', () => assertFails(updateDoc(doc(bob, 'pins', 'AbC123community'), { name: 'defaced' })));
  await t('server-owned', 'cannot write an admin/config doc', () => assertFails(setDoc(doc(bob, 'admin', 'config'), { admins: ['bob'] })));

  // ── Nicknames (public name) ──────────────────────────────────────────────
  for (const n of ['StrangePin', 'strangepin team', 'Strange-Pin', 'STRANGE.PIN', 'Str4ngeP1n', 'admin', 'Administrator', 'Adm1n', 'moderator',
                   'official', 'Supp0rt', 'staff', 'mod', 'Mods', 'team', 'system', 'owner', 'Google', 'a_d_m_i_n', 'The Admin 1', 'SUPPORT-desk'])
    await t('nickname', `reserved nickname "${n}" is denied`, () => assertFails(updateDoc(doc(alice, 'publicProfiles', 'alice'), { nickname: n, updatedAt: serverTimestamp() })));
  for (const n of ['ab', 'x'.repeat(25), ' lead', 'two  spaces', 'a..b', 'émile', '<b>x</b>', 42])
    await t('nickname', `malformed nickname ${JSON.stringify(n)} is denied`, () => assertFails(updateDoc(doc(alice, 'publicProfiles', 'alice'), { nickname: n, updatedAt: serverTimestamp() })));
  await t('nickname', 'reserved nickname at profile creation is denied', () => assertFails(signUp(ctx('erin'), 'erin', 'Official StrangePin')));
  await t('nickname', 'nickname change with a client timestamp is denied', () => assertFails(updateDoc(doc(alice, 'publicProfiles', 'alice'), { nickname: 'Alice C', updatedAt: Timestamp.fromMillis(0) })));
  await t('nickname', 'valid nicknames are accepted ("Ghost Hunter", "night_owl", "Modern Ghost")', async () => {
    for (const n of ['Ghost Hunter', 'night_owl', 'Modern Ghost']) await assertSucceeds(updateDoc(doc(alice, 'publicProfiles', 'alice'), { nickname: n, updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(alice, 'publicProfiles', 'alice'), { nickname: 'Alice B', updatedAt: serverTimestamp() }));
  });

  // ── Comments ─────────────────────────────────────────────────────────────
  const gina = ctx('gina');
  await signUp(gina, 'gina', 'Gina G');
  await t('comments', 'authorName must equal the public nickname (impersonation denied)', () => assertFails(commentBatch(gina, 'gina', 'StrangePin Team')));
  await t('comments', "authorName cannot be another user's nickname", () => assertFails(commentBatch(gina, 'gina', 'Alice B')));
  await t('comments', 'comment carrying displayName/photoURL is denied', () => assertFails(commentBatch(gina, 'gina', 'Gina G', { displayName: 'Real Name', photoURL: '' })));
  await t('comments', 'comment without the lastCommentAt stamp is denied', () => assertFails(commentBatch(gina, 'gina', 'Gina G', {}, '001', false)));
  await t('comments', 'first comment allowed', () => assertSucceeds(commentBatch(gina, 'gina', 'Gina G')));
  await t('comments', 'second comment within 15 s is denied (throttle)', () => assertFails(commentBatch(gina, 'gina', 'Gina G')));
  await t('comments', 'cannot reset the throttle with an old lastCommentAt', () => assertFails(updateDoc(doc(gina, 'users', 'gina'), { lastCommentAt: Timestamp.fromMillis(0) })));
  await t('comments', 'user without a public profile cannot comment', async () => { await admin(a => setDoc(doc(a, 'users', 'nopro'), userDoc('nopro', { joinedAt: Timestamp.now(), lastActive: Timestamp.now() }))); await assertFails(commentBatch(ctx('nopro'), 'nopro', 'Explorer-NOPR')); });
  await t('comments', 'empty comment is denied', () => assertFails(commentBatch(ctx('carol'), 'carol', 'Explorer-CARO', { text: '' })));
  await t('comments', '1001-char comment is denied', () => assertFails(commentBatch(ctx('carol'), 'carol', 'Explorer-CARO', { text: 'x'.repeat(1001) })));
  await t('comments', 'non-string comment is denied', () => assertFails(commentBatch(ctx('carol'), 'carol', 'Explorer-CARO', { text: 42 })));
  await t('comments', 'comment with client timestamp is denied', () => assertFails(commentBatch(ctx('carol'), 'carol', 'Explorer-CARO', { at: Timestamp.fromMillis(0) })));
  await t('comments', 'comment pre-pinned/approved is denied', () => assertFails(commentBatch(ctx('carol'), 'carol', 'Explorer-CARO', { pinned: true })));
  await t('comments', 'comment with likes: 5 is denied', () => assertFails(commentBatch(ctx('carol'), 'carol', 'Explorer-CARO', { likes: 5 })));
  await t('comments', 'author cannot change authorName afterwards', () => assertFails(updateDoc(doc(alice, 'pins', '001', 'comments', 'c1'), { authorName: 'StrangePin' })));

  // ── Likes ────────────────────────────────────────────────────────────────
  await t('likes', 'bob cannot like twice', () => assertFails(likeBatch(bob, 'bob')));
  await t('likes', 'increment without marker is denied', () => assertFails(updateDoc(doc(gina, 'pins', '001', 'comments', 'c1'), { likes: increment(1) })));
  await t('likes', '+5 in one batch is denied', () => assertFails(likeBatch(ctx('hank'), 'hank', 'c1', 5)));
  await t('likes', 'decrement is denied', () => assertFails(likeBatch(ctx('ivan'), 'ivan', 'c1', -1)));
  await t('likes', 'marker without the +1 is denied', () => assertFails(likeBatch(ctx('judy'), 'judy', 'c1', 0)));
  await t('likes', 'like marker on a non-existent comment is denied', () => assertFails(setDoc(doc(ctx('kim'), 'pins', '001', 'comments', 'nope', 'likes', 'kim'), { at: serverTimestamp() })));
  await t('likes', 'bob cannot delete his marker to like again', () => assertFails(deleteDoc(doc(bob, 'pins', '001', 'comments', 'c1', 'likes', 'bob'))));
  await t('likes', 'author cannot change likes while editing text', () => assertFails(updateDoc(doc(alice, 'pins', '001', 'comments', 'c1'), { text: 'x', likes: 999 })));

  // ── Submissions (pending review) ─────────────────────────────────────────
  const sue = ctx('sue');
  await signUp(sue, 'sue', 'Sue Q');
  await t('submissions', 'signed-in user creates a pending submission (+ lastSubmissionAt)', () => assertSucceeds(submitBatch(sue, 'sue', {}, true, 'sub1')));
  await t('submissions', 'author reads own submission', () => assertSucceeds(getDoc(doc(sue, 'submissions', 'sub1'))));
  await t('submissions', "author lists own submissions (where authorUid == uid)", () => assertSucceeds(getDocs(query(collection(sue, 'submissions'), where('authorUid', '==', 'sue')))));
  await t('submissions', "other users cannot read someone's submission", () => assertFails(getDoc(doc(bob, 'submissions', 'sub1'))));
  await t('submissions', 'nobody can list all submissions', () => assertFails(getDocs(collection(bob, 'submissions'))));
  await t('submissions', 'anonymous cannot read submissions', () => assertFails(getDoc(doc(anon, 'submissions', 'sub1'))));
  await t('submissions', 'second submission within 60 s is denied (throttle)', () => assertFails(submitBatch(sue, 'sue')));
  await t('submissions', 'author cannot approve own submission', () => assertFails(updateDoc(doc(sue, 'submissions', 'sub1'), { status: 'approved' })));
  await t('submissions', 'author cannot write review fields', () => assertFails(updateDoc(doc(sue, 'submissions', 'sub1'), { reviewedBy: 'sue', reviewedAt: serverTimestamp(), decision: 'approved', pointsAwarded: 100 })));
  await t('submissions', 'author cannot delete a submission', () => assertFails(deleteDoc(doc(sue, 'submissions', 'sub1'))));
  const tom = ctx('tom');
  await signUp(tom, 'tom', 'Tommy T');
  for (const [label, extra] of [['status approved', { status: 'approved' }], ['pointsAwarded field', { pointsAwarded: 10 }], ['points field', { points: 10 }],
    ['reviewedBy field', { reviewedBy: 'tom' }], ['decision field', { decision: 'approved' }], ['authorUid of another user', { authorUid: 'alice' }],
    ['client createdAt', { createdAt: Timestamp.fromMillis(0) }], ['unknown category', { category: 'Spam' }], ['non-Cloudinary imageUrl', { imageUrl: 'https://evil.example/x.jpg' }],
    ['other Cloudinary account', { imageUrl: 'https://res.cloudinary.com/other/image/upload/x.jpg' }], ['story of 5001 chars', { story: 'x'.repeat(5001) }],
    ['empty story', { story: '' }], ['intensity 11', { intensity: 11 }], ['intensity 5.5', { intensity: 5.5 }], ['lat 91', { lat: 91 }], ['lng as string', { lng: '9' }],
    ['name of 151 chars', { name: 'x'.repeat(151) }], ['empty username', { username: '' }], ['extra field', { to_email: 'victim@example.com' }]])
    await t('submissions', `create with ${label} is denied`, () => assertFails(submitBatch(tom, 'tom', extra)));
  await t('submissions', 'create without the lastSubmissionAt stamp is denied', () => assertFails(submitBatch(tom, 'tom', {}, false)));
  await t('submissions', 'valid Cloudinary photo URL is accepted', () => assertSucceeds(submitBatch(tom, 'tom', { imageUrl: 'https://res.cloudinary.com/dz9p5t4sj/image/upload/v1/strangepin/a.jpg' })));
  await t('submissions', 'cannot reset the submission throttle with an old stamp', () => assertFails(updateDoc(doc(tom, 'users', 'tom'), { lastSubmissionAt: Timestamp.fromMillis(0) })));

  // ── pointAwards ledger: no client access at all ──────────────────────────
  await admin(a => setDoc(doc(a, 'pointAwards', 'sub0'), { submissionId: 'sub0', uid: 'sue', points: 10, pins: 1, decision: 'approved', at: Timestamp.now() }));
  await t('ledger', 'author cannot read the ledger', () => assertFails(getDoc(doc(sue, 'pointAwards', 'sub0'))));
  await t('ledger', 'anonymous cannot read the ledger', () => assertFails(getDoc(doc(anon, 'pointAwards', 'sub0'))));
  await t('ledger', 'cannot create a ledger entry (pre-empt or self-award)', () => assertFails(setDoc(doc(sue, 'pointAwards', 'sub1'), { submissionId: 'sub1', uid: 'sue', points: 100 })));
  await t('ledger', 'cannot modify a ledger entry', () => assertFails(updateDoc(doc(sue, 'pointAwards', 'sub0'), { points: 1000 })));
  await t('ledger', 'cannot delete a ledger entry', () => assertFails(deleteDoc(doc(sue, 'pointAwards', 'sub0'))));

  // ── Account deletion requests ────────────────────────────────────────────
  await t('deletion', 'owner creates own deletion request', () => assertSucceeds(setDoc(doc(sue, 'deletionRequests', 'sue'), { uid: 'sue', status: 'requested', requestedAt: serverTimestamp(), reason: '' })));
  await t('deletion', 'owner reads own request', () => assertSucceeds(getDoc(doc(sue, 'deletionRequests', 'sue'))));
  await t('deletion', "others cannot read someone's request", () => assertFails(getDoc(doc(bob, 'deletionRequests', 'sue'))));
  await t('deletion', 'cannot request deletion for another user', () => assertFails(setDoc(doc(bob, 'deletionRequests', 'alice'), { uid: 'alice', status: 'requested', requestedAt: serverTimestamp() })));
  await t('deletion', "cannot create with status 'done'", () => assertFails(setDoc(doc(bob, 'deletionRequests', 'bob'), { uid: 'bob', status: 'done', requestedAt: serverTimestamp() })));
  await t('deletion', 'reason over 500 chars is denied', () => assertFails(setDoc(doc(bob, 'deletionRequests', 'bob'), { uid: 'bob', status: 'requested', requestedAt: serverTimestamp(), reason: 'x'.repeat(501) })));
  await t('deletion', 'owner cannot update or delete the request', async () => {
    await assertFails(updateDoc(doc(sue, 'deletionRequests', 'sue'), { status: 'done' }));
    await assertFails(deleteDoc(doc(sue, 'deletionRequests', 'sue')));
  });
  await t('deletion', 'a deletion request deletes nothing (users doc still present)', async () => { const d = await admin(a => getDoc(doc(a, 'users', 'sue'))); if (!d.exists()) throw new Error('gone'); });

  // ── Schema validation ────────────────────────────────────────────────────
  const zed = () => ctx('zed');
  await t('schema', 'users create missing email is denied', () => { const u = userDoc('zed'); delete u.email; const z = zed(); const b = writeBatch(z); b.set(doc(z, 'users', 'zed'), u); b.set(doc(z, 'publicProfiles', 'zed'), pubDoc('Zed Zed')); return assertFails(b.commit()); });
  await t('schema', 'users create with numeric displayName is denied', () => assertFails(signUp(zed(), 'zed', 'Zed Zed', { displayName: 123 })));
  await t('schema', 'users create with 81-char displayName is denied', () => assertFails(signUp(zed(), 'zed', 'Zed Zed', { displayName: 'x'.repeat(81) })));
  await t('schema', 'users create with client-supplied joinedAt is denied', () => assertFails(signUp(zed(), 'zed', 'Zed Zed', { joinedAt: Timestamp.fromMillis(0) })));
  await t('schema', 'users create with 100 kB email is denied', () => assertFails(signUp(zed(), 'zed', 'Zed Zed', { email: 'x'.repeat(100000) })));
  await t('schema', 'users create with javascript: photoURL is denied', () => assertFails(signUp(zed(), 'zed', 'Zed Zed', { photoURL: 'javascript:alert(1)' })));
  await t('schema', 'users create with wrong _schemaVersion is denied', () => assertFails(signUp(zed(), 'zed', 'Zed Zed', { _schemaVersion: 2 })));
  await t('schema', 'lastActive with a client time is denied', () => assertFails(updateDoc(doc(alice, 'users', 'alice'), { lastActive: Timestamp.fromMillis(0) })));
  await t('schema', 'reaction with client Date is denied', () => assertFails(setDoc(doc(bob, 'pins', '001', 'reactions', 'bob'), { type: 'ufo', uid: 'bob', at: new Date() })));
  await t('schema', 'reaction with unknown type is denied', () => assertFails(setDoc(doc(bob, 'pins', '001', 'reactions', 'bob'), { type: 'admin', uid: 'bob', at: serverTimestamp() })));
  await t('schema', 'saved doc with mismatched pinId is denied', () => assertFails(setDoc(doc(bob, 'users', 'bob', 'saved', '001'), { pinId: '002', at: serverTimestamp() })));
  await t('schema', 'profile created with a client updatedAt is denied', () => assertFails(signUp(zed(), 'zed', 'Zed Zed', {}, { updatedAt: Timestamp.fromMillis(0) })));

  // ── Invented pin ids (storage spam) ──────────────────────────────────────
  await t('pin-ids', 'comment on an invented pin id is denied', async () => { await sleep(15500); await assertFails(commentBatch(bob, 'bob', 'Bobby', {}, 'buy-cheap-pills')); });
  await t('pin-ids', 'reaction on an invented pin id is denied', () => assertFails(setDoc(doc(bob, 'pins', 'x'.repeat(300), 'reactions', 'bob'), { type: 'ufo', uid: 'bob', at: serverTimestamp() })));
  await t('pin-ids', 'saving an invented pin id is denied', () => assertFails(setDoc(doc(bob, 'users', 'bob', 'saved', 'spam'), { pinId: 'spam', at: serverTimestamp() })));

  // ── Default deny ─────────────────────────────────────────────────────────
  await t('catch-all', 'unknown top-level collection write denied', () => assertFails(setDoc(doc(alice, 'anything', 'x'), { a: 1 })));
  await t('catch-all', 'unknown sub-collection under users denied', () => assertFails(setDoc(doc(alice, 'users', 'alice', 'private', 'x'), { a: 1 })));
  await t('catch-all', 'unknown sub-collection under pins denied', () => assertFails(setDoc(doc(alice, 'pins', '001', 'votes', 'alice'), { v: 1 })));
  await t('catch-all', 'unknown sub-collection under submissions denied', () => assertFails(setDoc(doc(sue, 'submissions', 'sub1', 'notes', 'x'), { v: 1 })));

  await env.cleanup();
  const failed = results.filter(r => !r[2]);
  const groups = {};
  for (const [g, , ok] of results) { groups[g] = groups[g] || [0, 0]; groups[g][ok ? 0 : 1]++; }
  console.log('\nby group:', Object.entries(groups).map(([g, [p, f]]) => `${g} ${p}/${p + f}`).join(', '));
  console.log(`${results.length - failed.length}/${results.length} rules tests passed (${path.basename(RULES_FILE)})`);
  if (failed.length) console.log('FAILED:\n' + failed.map(f => ' - [' + f[0] + '] ' + f[1]).join('\n'));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
