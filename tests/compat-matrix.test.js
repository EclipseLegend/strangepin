// Firebase compatibility matrix at the rules level (Firestore emulator ONLY, project
// demo-strangepin). Replays the exact write/read shapes of the OLD client (main 728e8f5)
// and the NEW client (technical PR) against two rule sets:
//   - "assumed-old": tests/fixtures/rules-assumed-old.rules (ASSUMPTION: production rules unknown)
//   - "new":         firestore.rules (proposed)
// Prints a matrix; exits 1 only if an EXPECTATION in the table below is not met.
//   firebase emulators:exec --only firestore --project demo-strangepin "node tests/compat-matrix.test.js"
'use strict';
const fs = require('fs'), path = require('path');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDocs, updateDoc, addDoc, collection, writeBatch, serverTimestamp, increment,
        query, orderBy, limit, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');

const RULES = {
  'assumed-old': fs.readFileSync(path.join(__dirname, 'fixtures/rules-assumed-old.rules'), 'utf8'),
  'prod-expired': fs.readFileSync(path.join(__dirname, 'fixtures/rules-prod-expired.rules'), 'utf8'), // OWNER-REPORTED live rules
  'v1-pr1': fs.readFileSync(path.join(__dirname, 'fixtures/rules-v1-pr1.rules'), 'utf8'),
  'new': fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'), // v2
};
const ok = p => p.then(() => true, () => false);

// Old client (main 728e8f5) shapes, copied from its index.html.
const OLD = {
  'sign-in: create users/{uid}': (db, u) => setDoc(doc(db, 'users', u), { uid: u, displayName: 'A', email: 'a@x', photoURL: '', points: 0, pins: 0, badges: [], achievements: [], followers: 0, following: 0, verified: false, country: '', bio: '', website: '', joinedAt: serverTimestamp(), lastActive: serverTimestamp(), notifications: { newComment: true, newReaction: true, weeklyDigest: true }, _schemaVersion: 1 }),
  'sign-in: update lastActive': (db, u) => updateDoc(doc(db, 'users', u), { lastActive: serverTimestamp() }),
  'award points (users only, increment, no mirror)': (db, u) => updateDoc(doc(db, 'users', u), { points: increment(10), pins: increment(1) }),
  'reaction set (client Date)': (db, u) => setDoc(doc(db, 'pins', '001', 'reactions', u), { type: 'creepy', uid: u, at: new Date() }),
  'comment add': (db, u) => addDoc(collection(db, 'pins', '001', 'comments'), { uid: u, displayName: 'A', photoURL: '', text: 'hi', likes: 0, at: serverTimestamp() }),
  'comment like (increment, no marker)': async (db, u, other) => updateDoc(doc(db, 'pins', '001', 'comments', 'c1'), { likes: increment(1) }),
  'save pin (client Date)': (db, u) => setDoc(doc(db, 'users', u, 'saved', '001'), { pinId: '001', at: new Date() }),
  'home stats: list users': (db) => getDocs(collection(db, 'users')),
  'leaderboard: users orderBy points': (db) => getDocs(query(collection(db, 'users'), orderBy('points', 'desc'), limit(20))),
};
// New client shapes (same as tests/rules.test.js / index.html on the technical branch).
const NEW = {
  'sign-in: create users + publicProfiles (batch)': (db, u) => { const b = writeBatch(db); b.set(doc(db, 'users', u), { uid: u, displayName: 'A', email: 'a@x', photoURL: '', points: 0, pins: 0, badges: [], achievements: [], followers: 0, following: 0, verified: false, country: '', bio: '', website: '', joinedAt: serverTimestamp(), lastActive: serverTimestamp(), notifications: { newComment: true, newReaction: true, weeklyDigest: true }, _schemaVersion: 2 }); b.set(doc(db, 'publicProfiles', u), { displayName: 'A', photoURL: '', points: 0, pins: 0, updatedAt: serverTimestamp() }); return b.commit(); },
  'award points (mirrored batch, lastPointsAt)': (db, u) => { const b = writeBatch(db); b.update(doc(db, 'users', u), { points: increment(10), pins: increment(1), lastPointsAt: serverTimestamp() }); b.update(doc(db, 'publicProfiles', u), { points: increment(10), pins: increment(1), updatedAt: serverTimestamp() }); return b.commit(); },
  'reaction set (server time)': (db, u) => setDoc(doc(db, 'pins', '001', 'reactions', u), { type: 'creepy', uid: u, at: serverTimestamp() }),
  'comment add': (db, u) => addDoc(collection(db, 'pins', '001', 'comments'), { uid: u, displayName: 'A', photoURL: '', text: 'hi', likes: 0, at: serverTimestamp() }),
  'comment like (marker + increment batch)': (db, u) => { const b = writeBatch(db); b.set(doc(db, 'pins', '001', 'comments', 'c1', 'likes', u), { at: serverTimestamp() }); b.update(doc(db, 'pins', '001', 'comments', 'c1'), { likes: increment(1) }); return b.commit(); },
  'save pin (server time)': (db, u) => setDoc(doc(db, 'users', u, 'saved', '001'), { pinId: '001', at: serverTimestamp() }),
  'home stats / leaderboard: publicProfiles orderBy points': (db) => getDocs(query(collection(db, 'publicProfiles'), orderBy('points', 'desc'), limit(50))),
};
// Abuse probes (security exposure), same for both clients: any signed-in user can do these
// directly with the SDK, whatever the UI does.
const ABUSE = {
  'self-award 10,000 points': (db, u) => updateDoc(doc(db, 'users', u), { points: 10000 }),
  'read another user\'s private doc (email)': (db, u) => getDocs(collection(db, 'users')),
  'edit another user\'s comment': (db) => updateDoc(doc(db, 'pins', '001', 'comments', 'c1'), { text: 'defaced' }),
  'write a pin document': (db) => setDoc(doc(db, 'pins', '001'), { name: 'spam' }),
  'self-award +35 via mirrored batch (v1 loophole)': (db, u) => { const b = writeBatch(db); b.update(doc(db, 'users', u), { points: increment(35), pins: increment(1), lastPointsAt: serverTimestamp() }); b.update(doc(db, 'publicProfiles', u), { points: increment(35), pins: increment(1), updatedAt: serverTimestamp() }); return b.commit(); },
  'comment on an invented pin id': (db, u) => addDoc(collection(db, 'pins', 'spam-page', 'comments'), { uid: u, displayName: 'A', photoURL: '', text: 'buy now', likes: 0, at: serverTimestamp() }),
  'unauthenticated comment': null, // handled below
};

(async () => {
  const out = {};
  for (const [rname, rules] of Object.entries(RULES)) {
    const env = await initializeTestEnvironment({ projectId: 'demo-strangepin', firestore: { rules, host: '127.0.0.1', port: 8085 } });
    const run = async (set, label) => {
      for (const [name, fn] of Object.entries(set)) {
        if (!fn) continue;
        await env.clearFirestore();
        await env.withSecurityRulesDisabled(async (c) => {
          const a = c.firestore();
          await setDoc(doc(a, 'users', 'victim'), { uid: 'victim', email: 'victim@example.com', points: 5, pins: 0 });
          await setDoc(doc(a, 'publicProfiles', 'victim'), { displayName: 'V', photoURL: '', points: 5, pins: 0 });
          await setDoc(doc(a, 'pins', '001', 'comments', 'c1'), { uid: 'victim', displayName: 'V', photoURL: '', text: 'orig', likes: 0, at: new Date() });
          if (!/create users/.test(name)) {
            await setDoc(doc(a, 'users', 'alice'), { uid: 'alice', displayName: 'A', email: 'a@x', photoURL: '', points: 0, pins: 0, badges: [], achievements: [], followers: 0, following: 0, verified: false, country: '', bio: '', website: '', notifications: {}, _schemaVersion: 2 });
            await setDoc(doc(a, 'publicProfiles', 'alice'), { displayName: 'A', photoURL: '', points: 0, pins: 0 });
          }
        });
        const db = env.authenticatedContext('alice', { firebase: { sign_in_provider: 'google.com' } }).firestore();
        out[`${label} | ${name} | ${rname}`] = await ok(fn(db, 'alice'));
      }
    };
    await run(OLD, 'old client'); await run(NEW, 'new client'); await run(ABUSE, 'abuse');
    await env.clearFirestore();
    out[`abuse | unauthenticated comment | ${rname}`] = await ok(addDoc(collection(env.unauthenticatedContext().firestore(), 'pins', '001', 'comments'), { uid: 'x', text: 'spam', likes: 0, at: new Date() }));
    await env.cleanup();
  }
  // Expectations (documented in docs/firebase-compat-matrix.md).
  const expect = {
    'old client | award points (users only, increment, no mirror) | new': false,
    'old client | reaction set (client Date) | new': false,
    'old client | comment like (increment, no marker) | new': false,
    'old client | save pin (client Date) | new': false,
    'old client | home stats: list users | new': false,
    'old client | leaderboard: users orderBy points | new': false,
    'old client | comment add | new': true,
    'old client | sign-in: create users/{uid} | new': true,
    'abuse | self-award 10,000 points | assumed-old': true,
    'abuse | self-award 10,000 points | new': false,
    'abuse | read another user\'s private doc (email) | assumed-old': true,
    'abuse | read another user\'s private doc (email) | new': false,
    'abuse | edit another user\'s comment | assumed-old': true,
    'abuse | edit another user\'s comment | new': false,
    'abuse | write a pin document | new': false,
    'abuse | unauthenticated comment | new': false,
    'abuse | unauthenticated comment | assumed-old': false,
    // audit 2026-10-22: v2 makes points server-owned; v1 (PR #1) allows a capped self-award
    'new client | award points (mirrored batch, lastPointsAt) | new': false,
    'new client | award points (mirrored batch, lastPointsAt) | v1-pr1': true,
    'abuse | self-award +35 via mirrored batch (v1 loophole) | v1-pr1': true,
    'abuse | self-award +35 via mirrored batch (v1 loophole) | new': false,
    'abuse | comment on an invented pin id | v1-pr1': true,
    'abuse | comment on an invented pin id | new': false,
  };
  // Owner-reported live rules (expired test mode): every cell must be DENY.
  for (const k of Object.keys(out).filter(k => k.endsWith('| prod-expired'))) expect[k] = false;
  let bad = 0;
  for (const [k, v] of Object.entries(out)) {
    const e = k in expect ? (expect[k] === v ? ' (as expected)' : ` (EXPECTED ${expect[k] ? 'ALLOW' : 'DENY'})`) : '';
    if (k in expect && expect[k] !== v) bad++;
    console.log(`${v ? 'ALLOW' : 'DENY '}  ${k}${e}`);
  }
  for (const k of Object.keys(out).filter(k => k.startsWith('new client') && k.endsWith('| new') && !(k in expect))) if (!out[k]) { bad++; console.log('UNEXPECTED DENY for new client under new rules:', k); }
  console.log(`\n${Object.keys(out).length} matrix cells; ${bad} unexpected`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
