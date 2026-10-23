// AUDIT (2026-10-22): behaviour of the OWNER-REPORTED production rules (expired test mode,
// tests/fixtures/rules-prod-expired.rules) on the LOCAL Firestore emulator only
// (project demo-strangepin). Replays every read/write shape of the old client (main 728e8f5)
// the early PR #1 (v1) client and the v3 client (as deployed) plus anonymous reads, and expects every one to be DENIED,
// because request.time (now) is after timestamp.date(2026, 7, 4).
//   firebase emulators:exec --only firestore --project demo-strangepin "node tests/expired-rules.test.js"
'use strict';
const fs = require('fs'), path = require('path');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, addDoc, collection, writeBatch,
        serverTimestamp, increment, query, orderBy, limit, where, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');

const RULES = fs.readFileSync(path.join(__dirname, 'fixtures/rules-prod-expired.rules'), 'utf8');
const res = p => p.then(() => 'ALLOW', e => (e && e.code) || 'ERROR');
const userDoc = (u, v) => ({ uid: u, displayName: 'A', email: 'a@x', photoURL: '', points: 0, pins: 0, badges: [], achievements: [], followers: 0, following: 0, verified: false, country: '', bio: '', website: '', joinedAt: serverTimestamp(), lastActive: serverTimestamp(), notifications: { newComment: true, newReaction: true, weeklyDigest: true }, _schemaVersion: v });

const OPS = {
  // old client (main 728e8f5)
  'old | sign-in: get users/{uid}': (db, u) => getDoc(doc(db, 'users', u)),
  'old | sign-in: create users/{uid}': (db, u) => setDoc(doc(db, 'users', u), userDoc(u, 1)),
  'old | sign-in: update lastActive': (db, u) => updateDoc(doc(db, 'users', u), { lastActive: serverTimestamp() }),
  'old | award points (users only)': (db, u) => updateDoc(doc(db, 'users', u), { points: increment(10), pins: increment(1) }),
  'old | home stats: list users': db => getDocs(collection(db, 'users')),
  'old | home stats: list pins': db => getDocs(collection(db, 'pins')),
  'old | leaderboard: users orderBy points': db => getDocs(query(collection(db, 'users'), orderBy('points', 'desc'), limit(20))),
  'old | reactions: list': db => getDocs(collection(db, 'pins', '001', 'reactions')),
  'old | reaction set (client Date)': (db, u) => setDoc(doc(db, 'pins', '001', 'reactions', u), { type: 'creepy', uid: u, at: new Date() }),
  'old | comments: list': db => getDocs(query(collection(db, 'pins', '001', 'comments'), orderBy('at', 'desc'), limit(20))),
  'old | comment add': (db, u) => addDoc(collection(db, 'pins', '001', 'comments'), { uid: u, displayName: 'A', photoURL: '', text: 'hi', likes: 0, at: serverTimestamp() }),
  'old | comment like (increment)': db => updateDoc(doc(db, 'pins', '001', 'comments', 'c1'), { likes: increment(1) }),
  'old | save pin (client Date)': (db, u) => setDoc(doc(db, 'users', u, 'saved', '001'), { pinId: '001', at: new Date() }),
  'old | unsave pin': (db, u) => deleteDoc(doc(db, 'users', u, 'saved', '001')),
  'old | saved count query (users where savedPins)': db => getDocs(query(collection(db, 'users'), where('savedPins', 'array-contains', '001'))),
  // new client (PR #1)
  'new | sign-in: create users + publicProfiles (batch)': (db, u) => { const b = writeBatch(db); b.set(doc(db, 'users', u), userDoc(u, 2)); b.set(doc(db, 'publicProfiles', u), { displayName: 'A', photoURL: '', points: 0, pins: 0, updatedAt: serverTimestamp() }); return b.commit(); },
  'new | award points (mirrored batch)': (db, u) => { const b = writeBatch(db); b.update(doc(db, 'users', u), { points: increment(10), pins: increment(1), lastPointsAt: serverTimestamp() }); b.update(doc(db, 'publicProfiles', u), { points: increment(10), pins: increment(1), updatedAt: serverTimestamp() }); return b.commit(); },
  'new | home stats / leaderboard: publicProfiles orderBy points': db => getDocs(query(collection(db, 'publicProfiles'), orderBy('points', 'desc'), limit(50))),
  'new | reaction set (server time)': (db, u) => setDoc(doc(db, 'pins', '001', 'reactions', u), { type: 'creepy', uid: u, at: serverTimestamp() }),
  'new | reaction delete': (db, u) => deleteDoc(doc(db, 'pins', '001', 'reactions', u)),
  'new | comment like (marker + increment batch)': (db, u) => { const b = writeBatch(db); b.set(doc(db, 'pins', '001', 'comments', 'c1', 'likes', u), { at: serverTimestamp() }); b.update(doc(db, 'pins', '001', 'comments', 'c1'), { likes: increment(1) }); return b.commit(); },
  'new | save pin (server time)': (db, u) => setDoc(doc(db, 'users', u, 'saved', '001'), { pinId: '001', at: serverTimestamp() }),
  // v3 client (live since PR #1)
  'v3 | sign-in: create users + publicProfiles (batch)': (db, u) => { const b = writeBatch(db); b.set(doc(db, 'users', u), { uid: u, displayName: 'A', email: 'a@x', photoURL: '', points: 0, pins: 0, joinedAt: serverTimestamp(), lastActive: serverTimestamp(), _schemaVersion: 3 }); b.set(doc(db, 'publicProfiles', u), { nickname: 'Explorer-ABCD', points: 0, pins: 0, updatedAt: serverTimestamp() }); return b.commit(); },
  'v3 | comment add (nickname + stamp batch)': (db, u) => { const b = writeBatch(db); b.set(doc(collection(db, 'pins', '001', 'comments')), { uid: u, authorName: 'A', text: 'hi', likes: 0, at: serverTimestamp() }); b.update(doc(db, 'users', u), { lastCommentAt: serverTimestamp() }); return b.commit(); },
  'v3 | change nickname': (db, u) => updateDoc(doc(db, 'publicProfiles', u), { nickname: 'Alice B', updatedAt: serverTimestamp() }),
  'v3 | submit a location': (db, u) => { const b = writeBatch(db); b.set(doc(collection(db, 'submissions')), { authorUid: u, status: 'pending', createdAt: serverTimestamp(), name: 'M', country: 'PT', city: '', address: '', lat: 1.5, lng: 2.5, category: 'Haunted', story: 'x', storyLang: 'en', date: '', intensity: 5, imageUrl: '', username: 'A' }); b.update(doc(db, 'users', u), { lastSubmissionAt: serverTimestamp() }); return b.commit(); },
  'v3 | my submissions query': (db, u) => getDocs(query(collection(db, 'submissions'), where('authorUid', '==', u))),
  'v3 | request account deletion': (db, u) => setDoc(doc(db, 'deletionRequests', u), { uid: u, status: 'requested', requestedAt: serverTimestamp(), reason: '' }),
};

(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-strangepin', firestore: { rules: RULES, host: '127.0.0.1', port: 8085 } });
  let total = 0, denied = 0, bad = [];
  console.log('now (client clock):', new Date().toISOString(), '> 2026-07-04 :', Date.now() > Date.UTC(2026, 6, 4));
  for (const ctxName of ['signed-in', 'anonymous']) {
    for (const [name, fn] of Object.entries(OPS)) {
      await env.clearFirestore();
      await env.withSecurityRulesDisabled(async c => {
        const a = c.firestore();
        await setDoc(doc(a, 'users', 'alice'), { uid: 'alice', points: 0, pins: 0, email: 'a@x' });
        await setDoc(doc(a, 'publicProfiles', 'alice'), { displayName: 'A', photoURL: '', points: 0, pins: 0 });
        await setDoc(doc(a, 'pins', '001', 'comments', 'c1'), { uid: 'victim', displayName: 'V', photoURL: '', text: 'orig', likes: 0, at: new Date() });
      });
      const db = ctxName === 'signed-in' ? env.authenticatedContext('alice').firestore() : env.unauthenticatedContext().firestore();
      const r = await res(fn(db, 'alice'));
      total++; if (r === 'permission-denied') denied++; else bad.push(`${ctxName} | ${name} -> ${r}`);
      console.log(`${r === 'permission-denied' ? 'DENY ' : 'ALLOW'}  ${ctxName} | ${name}${r === 'permission-denied' ? '' : '  <-- UNEXPECTED: ' + r}`);
    }
  }
  await env.cleanup();
  console.log(`\n${denied}/${total} operations denied under the expired rules`);
  if (bad.length) console.log('UNEXPECTED:\n' + bad.join('\n'));
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
